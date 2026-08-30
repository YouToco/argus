import type { ExtractedFrame, VideoFileInfo } from '../../types'

// ---------------------------------------------------------------------------
// MediaInfo (WASM) probing for fps / codec / bitrate / container.
// Loaded lazily only when get_video_info requests rich metadata.
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
// VideoSession — wraps a hidden <video> element for fast, local frame seeking.
// ---------------------------------------------------------------------------

const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

let frameSeq = 0
function frameId(t: number): string {
  frameSeq += 1
  return `f${Math.round(t * 1000)}-${frameSeq}`
}

export class VideoSession {
  readonly file: File
  readonly url: string
  private video: HTMLVideoElement
  private canvas: HTMLCanvasElement
  private rich: RichInfo | null = null
  private richPromise: Promise<RichInfo> | null = null

  private constructor(file: File, url: string, video: HTMLVideoElement) {
    this.file = file
    this.url = url
    this.video = video
    this.canvas = document.createElement('canvas')
  }

  static async create(file: File): Promise<VideoSession> {
    const url = URL.createObjectURL(file)
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
    return new VideoSession(file, url, video)
  }

  get durationSec(): number {
    const d = this.video.duration
    return Number.isFinite(d) ? d : 0
  }

  get width(): number {
    return this.video.videoWidth || 0
  }

  get height(): number {
    return this.video.videoHeight || 0
  }

  /** Rich metadata (fps/codec/bitrate/container). Loaded lazily. */
  enrich(): Promise<RichInfo> {
    if (!this.richPromise) {
      this.richPromise = probeMediaInfo(this.file)
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

  /** Fast metadata from the <video> element + File — no WASM, available immediately. */
  basicInfo(): VideoFileInfo {
    return {
      name: this.file.name,
      sizeBytes: this.file.size,
      mimeType: this.file.type || 'video/*',
      durationSec: this.durationSec,
      width: this.width,
      height: this.height,
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
      durationSec: this.durationSec,
      width: this.width,
      height: this.height,
      frameRate: rich.frameRate,
      codec: rich.codec,
      container: rich.container,
      bitrate: rich.bitrate,
      hasAudio: rich.hasAudio,
    }
  }

  private async seek(t: number): Promise<void> {
    const v = this.video
    if (Math.abs(v.currentTime - t) < 1e-3) return
    await new Promise<void>((resolve) => {
      const onSeeked = () => {
        v.removeEventListener('seeked', onSeeked)
        resolve()
      }
      v.addEventListener('seeked', onSeeked)
      v.currentTime = t
    })
    await raf()
    await raf()
  }

  /** Force the decoder to produce a frame (helps on first seek of some H.264 files). */
  private async forceDecode(): Promise<void> {
    const v = this.video
    try {
      await v.play()
      await new Promise((r) => setTimeout(r, 120))
      v.pause()
    } catch {
      /* play may be rejected in rare cases; ignore */
    }
  }

  private draw(maxWidth: number, quality: number): string {
    const vw = this.video.videoWidth || 1
    const vh = this.video.videoHeight || 1
    const scale = maxWidth && maxWidth < vw ? maxWidth / vw : 1
    const w = Math.max(1, Math.round(vw * scale))
    const h = Math.max(1, Math.round(vh * scale))
    const c = this.canvas
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')!
    ctx.drawImage(this.video, 0, 0, w, h)
    return c.toDataURL('image/jpeg', quality)
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

  async captureFrame(t: number, maxWidth: number, quality: number): Promise<ExtractedFrame> {
    const clamped = Math.max(0, Math.min(t, this.durationSec))
    await this.seek(clamped)
    let dataUrl = this.draw(maxWidth, quality)
    if (this.isBlack()) {
      await this.forceDecode()
      await this.seek(clamped)
      dataUrl = this.draw(maxWidth, quality)
    }
    return {
      id: frameId(clamped),
      timeSec: clamped,
      dataUrl,
      width: this.canvas.width,
      height: this.canvas.height,
    }
  }

  async extractFrameAt(t: number, maxWidth = 1280, quality = 0.8): Promise<ExtractedFrame> {
    return this.captureFrame(t, maxWidth, quality)
  }

  async extractFrames(opts: {
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

    const out: ExtractedFrame[] = []
    // seek forward only — sort ascending
    const sorted = [...chosen].sort((a, b) => a - b)
    for (const t of sorted) {
      out.push(await this.captureFrame(t, opts.maxWidth ?? 640, opts.quality ?? 0.7))
    }
    return out
  }

  destroy(): void {
    URL.revokeObjectURL(this.url)
    this.video.pause()
    this.video.removeAttribute('src')
    this.video.load()
  }
}
