import { ALL_FORMATS, BlobSource, CanvasSink, Input } from 'mediabunny'
import type { InputVideoTrack } from 'mediabunny'
import type { ExtractedFrame, VideoFileInfo } from '../../types'
import { canvasToJpegBlob } from '../frames'

// ---------------------------------------------------------------------------
// Legacy rich-metadata probing (fallback path only, lazy WASM).
// ---------------------------------------------------------------------------

interface RichInfo {
  container: string | null
  codec: string | null
  frameRate: number | null
  bitrate: number | null
  hasAudio: boolean
}

const EMPTY_RICH: RichInfo = {
  container: null,
  codec: null,
  frameRate: null,
  bitrate: null,
  hasAudio: false,
}

async function probeMediaInfo(file: File): Promise<RichInfo> {
  const mod = await import('mediainfo.js')
  const wasmUrl = (await import('mediainfo.js/MediaInfoModule.wasm?url')).default
  const mediaInfoFactory = mod.default
  const mi = await mediaInfoFactory({ format: 'object', locateFile: () => wasmUrl })
  try {
    const getSize = () => file.size
    const readChunk = async (size: number, offset: number) =>
      new Uint8Array(await file.slice(offset, offset + size).arrayBuffer())
    const result = await mi.analyzeData(getSize, readChunk)
    const tracks = (result.media?.track ?? []) as unknown as Record<string, unknown>[]
    const video = tracks.find((t) => t['@type'] === 'Video')
    const general = tracks.find((t) => t['@type'] === 'General')
    const audio = tracks.find((t) => t['@type'] === 'Audio')

    let frameRate: number | null = null
    if (video) {
      const fr = parseFloat(String(video.FrameRate ?? ''))
      if (Number.isFinite(fr) && fr > 0) {
        frameRate = fr
      } else {
        const fc = parseFloat(String(video.FrameCount ?? ''))
        const d = parseFloat(String(video.Duration ?? ''))
        if (Number.isFinite(fc) && Number.isFinite(d) && d > 0) frameRate = fc / d
      }
    }

    const bitrate = parseFloat(String(general?.OverallBitRate ?? video?.BitRate ?? ''))
    return {
      container: (general?.Format as string) ?? null,
      codec: (video?.Format as string) ?? null,
      frameRate,
      bitrate: Number.isFinite(bitrate) && bitrate > 0 ? bitrate : null,
      hasAudio: Boolean(audio),
    }
  } finally {
    // release WASM memory
    mi.close?.()
  }
}

// ---------------------------------------------------------------------------
// VideoSession
//
// Frame extraction has two engines:
//  1. mediabunny (primary) — WebCodecs-based demux+decode, roughly an order of
//     magnitude faster than <video> seeking because frames are decoded
//     sequentially without per-frame seek/decode settling.
//  2. <video> + <canvas> (fallback) — works everywhere a browser can play the
//     file; also handles the rare cases where WebCodecs can't decode the codec.
//
// The class falls back permanently (per session) if the fast path throws.
// ---------------------------------------------------------------------------

const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

let frameSeq = 0
function frameId(t: number): string {
  frameSeq += 1
  return `f${Math.round(t * 1000)}-${frameSeq}`
}

interface BunnyEngine {
  input: Input
  track: InputVideoTrack
  sink: CanvasSink
}

export class VideoSession {
  readonly file: File
  private url: string | null = null
  private video: HTMLVideoElement | null = null
  private canvas: HTMLCanvasElement
  private bunny: BunnyEngine | null = null
  /** set when the mediabunny path failed once — everything goes through <video> after that */
  private bunnyBroken = false
  private rich: RichInfo | null = null
  private richPromise: Promise<RichInfo> | null = null
  private dims = { width: 0, height: 0, durationSec: 0 }
  /** serializes extractions — both engines are single-resource */
  private queue: Promise<unknown> = Promise.resolve()

  private constructor(file: File) {
    this.file = file
    this.canvas = document.createElement('canvas')
  }

  static async create(file: File): Promise<VideoSession> {
    // fast path: mediabunny demux + WebCodecs decode
    try {
      const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
      const track = await input.getPrimaryVideoTrack()
      if (track && (await track.canDecode())) {
        const [duration, width, height] = await Promise.all([
          input.computeDuration(),
          track.getDisplayWidth(),
          track.getDisplayHeight(),
        ])
        const s = new VideoSession(file)
        s.bunny = { input, track, sink: new CanvasSink(track) }
        s.dims = { width, height, durationSec: duration }
        return s
      }
      input.dispose()
    } catch {
      /* fall back to the <video> element engine */
    }

    const s = new VideoSession(file)
    await s.ensureElement()
    return s
  }

  /** lazily create the hidden <video> used by the fallback engine */
  private async ensureElement(): Promise<HTMLVideoElement> {
    if (this.video) return this.video
    const url = (this.url ??= URL.createObjectURL(this.file))
    const video = document.createElement('video')
    video.src = url
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        video.removeEventListener('loadedmetadata', onMeta)
        video.removeEventListener('error', onErr)
      }
      const onMeta = () => {
        cleanup()
        resolve()
      }
      const onErr = () => {
        cleanup()
        reject(new Error('无法加载该视频文件（格式可能不被浏览器解码）'))
      }
      video.addEventListener('loadedmetadata', onMeta)
      video.addEventListener('error', onErr)
    })
    // MediaRecorder-produced WebM often reports duration = Infinity until a
    // large seek forces the browser to discover the real end of the stream.
    if (!Number.isFinite(video.duration)) {
      const probeTo = (t: number) =>
        new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            video.removeEventListener('seeked', onSeeked)
            resolve()
          }, 5000)
          const onSeeked = () => {
            clearTimeout(timer)
            video.removeEventListener('seeked', onSeeked)
            resolve()
          }
          video.addEventListener('seeked', onSeeked)
          video.currentTime = t
        })
      await probeTo(1e7) // jump past any plausible end -> browser fixes duration
      await probeTo(0)
    }
    this.video = video
    this.dims = {
      width: video.videoWidth || 0,
      height: video.videoHeight || 0,
      durationSec: Number.isFinite(video.duration) ? video.duration : 0,
    }
    return video
  }

  get durationSec(): number {
    return this.dims.durationSec
  }

  get width(): number {
    return this.dims.width
  }

  get height(): number {
    return this.dims.height
  }

  /** serialize an extraction so concurrent tool calls never fight over one decoder */
  private runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.queue.then(fn, fn)
    this.queue = p.catch(() => {})
    return p
  }

  /** Rich metadata (fps/codec/bitrate/container). Loaded lazily. */
  private enrich(): Promise<RichInfo> {
    if (!this.richPromise) {
      this.richPromise = this.bunny
        ? (async () => {
            try {
              const [format, codec, metrics, stats, audioTrack] = await Promise.all([
                this.bunny!.input.getFormat(),
                this.bunny!.track.getCodec(),
                this.bunny!.track.computeFrameRateMetrics().catch(() => null),
                this.bunny!.track.computePacketStats().catch(() => null),
                this.bunny!.input.getPrimaryAudioTrack().catch(() => null),
              ])
              const rich: RichInfo = {
                container: format.name,
                codec,
                frameRate: metrics ? metrics.bestGuessFrameRate : null,
                bitrate: stats ? stats.averageBitrate : null,
                hasAudio: audioTrack !== null,
              }
              this.rich = rich
              return rich
            } catch {
              this.rich = EMPTY_RICH
              return this.rich
            }
          })()
        : probeMediaInfo(this.file)
            .then((r) => {
              this.rich = r
              return r
            })
            .catch(() => {
              this.rich = EMPTY_RICH
              return this.rich
            })
    }
    return this.richPromise
  }

  /** Fast metadata — available immediately after create(). */
  basicInfo(): VideoFileInfo {
    return {
      name: this.file.name,
      sizeBytes: this.file.size,
      mimeType: this.file.type || 'video/*',
      durationSec: this.dims.durationSec,
      width: this.dims.width,
      height: this.dims.height,
      frameRate: null,
      codec: null,
      container: null,
      bitrate: null,
      hasAudio: false,
    }
  }

  async getInfo(): Promise<VideoFileInfo> {
    const rich = await this.enrich()
    return {
      name: this.file.name,
      sizeBytes: this.file.size,
      mimeType: this.file.type || 'video/*',
      durationSec: this.dims.durationSec,
      width: this.dims.width,
      height: this.dims.height,
      frameRate: rich.frameRate,
      codec: rich.codec,
      container: rich.container,
      bitrate: rich.bitrate,
      hasAudio: rich.hasAudio,
    }
  }

  /** scale + JPEG-encode a decoded canvas at the requested output width */
  private async encode(src: HTMLCanvasElement, timeSec: number, maxWidth: number, quality: number): Promise<ExtractedFrame> {
    const vw = src.width || 1
    const vh = src.height || 1
    const scale = maxWidth && maxWidth < vw ? maxWidth / vw : 1
    const w = Math.max(1, Math.round(vw * scale))
    const h = Math.max(1, Math.round(vh * scale))
    const c = this.canvas
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')!
    ctx.drawImage(src, 0, 0, w, h)
    const blob = await canvasToJpegBlob(c, quality)
    return {
      id: frameId(timeSec),
      timeSec,
      blob,
      width: w,
      height: h,
    }
  }

  async extractFrameAt(t: number, maxWidth = 1280, quality = 0.8): Promise<ExtractedFrame> {
    return this.runExclusive(() => this.extractFrameAtInner(t, maxWidth, quality))
  }

  private async extractFrameAtInner(t: number, maxWidth: number, quality: number): Promise<ExtractedFrame> {
    const clamped = Math.max(0, Math.min(t, this.durationSec))
    if (this.bunny && !this.bunnyBroken) {
      try {
        const wrapped = await this.bunny.sink.getCanvas(clamped)
        if (wrapped) return await this.encode(wrapped.canvas as HTMLCanvasElement, wrapped.timestamp, maxWidth, quality)
        // null => timestamp before the first frame; fall through to <video>
        this.bunnyBroken = true
      } catch {
        this.bunnyBroken = true
      }
    }
    const video = await this.ensureElement()
    return this.captureViaElement(video, clamped, maxWidth, quality)
  }

  async extractFrames(opts: {
    start: number
    end: number
    interval: number
    maxWidth?: number
    maxFrames?: number
    quality?: number
  }): Promise<ExtractedFrame[]> {
    return this.runExclusive(() => this.extractFramesInner(opts))
  }

  private async extractFramesInner(opts: {
    start: number
    end: number
    interval: number
    maxWidth?: number
    maxFrames?: number
    quality?: number
  }): Promise<ExtractedFrame[]> {
    const duration = this.durationSec
    const s = Math.max(0, opts.start)
    const e = Math.min(opts.end, duration)
    const step = Math.max(opts.interval, 0.05)
    const times: number[] = []
    for (let t = s; t <= e + 1e-6; t += step) times.push(Math.min(t, duration))
    if (times.length === 0) times.push(s)

    // cap by maxFrames (evenly sampled)
    let chosen = times
    const maxFrames = opts.maxFrames ?? 0
    if (maxFrames > 0 && times.length > maxFrames) {
      chosen = []
      for (let i = 0; i < maxFrames; i++) {
        const idx = Math.min(times.length - 1, Math.floor((i * times.length) / maxFrames))
        chosen.push(times[idx])
      }
    }

    // seek forward only — sort ascending
    const sorted = [...chosen].sort((a, b) => a - b)
    const maxWidth = opts.maxWidth ?? 640
    const quality = opts.quality ?? 0.7

    if (this.bunny && !this.bunnyBroken) {
      try {
        const out: ExtractedFrame[] = []
        for await (const wrapped of this.bunny.sink.canvasesAtTimestamps(sorted)) {
          if (!wrapped) continue
          out.push(await this.encode(wrapped.canvas as HTMLCanvasElement, wrapped.timestamp, maxWidth, quality))
        }
        if (out.length > 0) return out
        // nothing decodable — downgrade and retry via <video>
        this.bunnyBroken = true
      } catch {
        this.bunnyBroken = true
      }
    }

    const video = await this.ensureElement()
    const out: ExtractedFrame[] = []
    for (const t of sorted) {
      out.push(await this.captureViaElement(video, t, maxWidth, quality))
    }
    return out
  }

  // --- <video> element engine (legacy fallback) ---

  private async seek(video: HTMLVideoElement, t: number): Promise<void> {
    if (Math.abs(video.currentTime - t) < 1e-3) return
    await new Promise<void>((resolve) => {
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked)
        resolve()
      }
      video.addEventListener('seeked', onSeeked)
      video.currentTime = t
    })
    await raf()
    await raf()
  }

  /** Force the decoder to produce a frame (helps on first seek of some H.264 files). */
  private async forceDecode(video: HTMLVideoElement): Promise<void> {
    try {
      await video.play()
      await new Promise((r) => setTimeout(r, 120))
      video.pause()
    } catch {
      /* play may be rejected in rare cases; ignore */
    }
  }

  private draw(video: HTMLVideoElement, maxWidth: number): void {
    const vw = video.videoWidth || 1
    const vh = video.videoHeight || 1
    const scale = maxWidth && maxWidth < vw ? maxWidth / vw : 1
    const w = Math.max(1, Math.round(vw * scale))
    const h = Math.max(1, Math.round(vh * scale))
    const c = this.canvas
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')!
    ctx.drawImage(video, 0, 0, w, h)
  }

  private isBlack(): boolean {
    try {
      const c = this.canvas
      const ctx = c.getContext('2d')!
      const data = ctx.getImageData(0, 0, c.width, c.height).data
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] > 10 || data[i + 1] > 10 || data[i + 2] > 10) return false
      }
      return true
    } catch {
      return false
    }
  }

  private async captureViaElement(
    video: HTMLVideoElement,
    t: number,
    maxWidth: number,
    quality: number,
  ): Promise<ExtractedFrame> {
    await this.seek(video, t)
    this.draw(video, maxWidth)
    if (this.isBlack()) {
      await this.forceDecode(video)
      await this.seek(video, t)
      this.draw(video, maxWidth)
    }
    const blob = await canvasToJpegBlob(this.canvas, quality)
    return {
      id: frameId(t),
      timeSec: t,
      blob,
      width: this.canvas.width,
      height: this.canvas.height,
    }
  }

  destroy(): void {
    // disposing the input also closes its decoders and cancels sink operations
    this.bunny?.input.dispose()
    this.bunny = null
    if (this.video) {
      this.video.pause()
      this.video.removeAttribute('src')
      this.video.load()
      this.video = null
    }
    if (this.url) {
      URL.revokeObjectURL(this.url)
      this.url = null
    }
  }
}