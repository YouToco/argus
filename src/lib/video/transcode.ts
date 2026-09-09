// ---------------------------------------------------------------------------
// In-browser transcoding for containers WebCodecs / <video> can't handle
// (AVI, WMV, FLV, TS…). Uses ffmpeg.wasm, lazy-loaded from public CDNs on
// first need — nothing is downloaded for the common MP4/MKV/WebM path.
//
// License note: @ffmpeg/core ships a GPL-2.0 build of ffmpeg (libx264).
// We deliberately do NOT bundle the 32MB wasm into this MIT-licensed app;
// the user’s browser fetches it directly from the CDN at runtime.
// ---------------------------------------------------------------------------

export interface TranscodeProgress {
  phase: 'downloading' | 'transcoding'
  /** 0..1, only meaningful during 'transcoding' */
  ratio: number
}

type ProgressFn = (p: TranscodeProgress) => void

interface FFmpegLike {
  load(opts: { coreURL: string; wasmURL: string }): Promise<boolean>
  writeFile(name: string, data: Uint8Array): Promise<boolean>
  readFile(name: string): Promise<Uint8Array | string>
  exec(args: string[]): Promise<number>
  on(event: 'progress', cb: (e: { progress: number }) => void): void
  terminate(): void
}

const CORE_VERSION = '0.12.10'
const CDN_BASES = [
  `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm`,
  `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/esm`,
]

let ffmpegPromise: Promise<FFmpegLike> | null = null

async function loadFFmpeg(onProgress: ProgressFn): Promise<FFmpegLike> {
  onProgress({ phase: 'downloading', ratio: 0 })
  const { FFmpeg } = await import('@ffmpeg/ffmpeg')
  const { toBlobURL } = await import('@ffmpeg/util')

  let lastErr: unknown = null
  for (const base of CDN_BASES) {
    try {
      // toBlobURL pulls the cross-origin core into same-origin blob URLs,
      // which sidesteps worker/CORS restrictions on some browsers.
      const [coreURL, wasmURL] = await Promise.all([
        toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
        toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
      ])
      const ffmpeg = new FFmpeg() as unknown as FFmpegLike
      await ffmpeg.load({ coreURL, wasmURL })
      return ffmpeg
    } catch (e) {
      lastErr = e
    }
  }
  throw new Error(`转码器下载失败（需要访问 unpkg/jsdelivr）：${(lastErr as Error)?.message ?? lastErr}`)
}

function getFFmpeg(onProgress: ProgressFn): Promise<FFmpegLike> {
  if (!ffmpegPromise) {
    ffmpegPromise = loadFFmpeg(onProgress).catch((e) => {
      ffmpegPromise = null // allow retry after a transient network failure
      throw e
    })
  }
  return ffmpegPromise
}

/**
 * True for containers browsers essentially never decode natively.
 * MKV is excluded — mediabunny demuxes it fine.
 */
export function likelyNeedsTranscode(fileName: string): boolean {
  return /\.(avi|wmv|flv|asf|mpg|mpeg|vob|ts|m2ts|3gp|rm|rmvb)$/i.test(fileName)
}

/**
 * Transcode any ffmpeg-readable file to H.264 MP4 (audio dropped — unused).
 * The returned File keeps the ORIGINAL name so session identity (name-based
 * reattach) and the info card stay stable; only the mime type changes.
 */
export async function transcodeToMp4(file: File, onProgress: ProgressFn): Promise<File> {
  const ffmpeg = await getFFmpeg(onProgress)
  const inputName = 'input' + (file.name.match(/\.[a-z0-9]+$/i)?.[0] ?? '.bin')
  const outputName = 'output.mp4'

  await ffmpeg.writeFile(inputName, new Uint8Array(await file.arrayBuffer()))

  const handler = (e: { progress: number }) => {
    const ratio = Number.isFinite(e.progress) ? Math.max(0, Math.min(1, e.progress)) : 0
    onProgress({ phase: 'transcoding', ratio })
  }
  ffmpeg.on('progress', handler)
  try {
    // ultrafast + crf 30: speed over fidelity — the agent only needs to see frames.
    // -an drops audio (unused); +faststart moves moov up front for demuxers.
    const code = await ffmpeg.exec([
      '-i', inputName,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '30',
      '-pix_fmt', 'yuv420p',
      '-an',
      '-movflags', '+faststart',
      outputName,
    ])
    if (code !== 0) throw new Error(`ffmpeg 退出码 ${code}`)
  } finally {
    ffmpeg.on('progress', () => {}) // detach best-effort
  }

  const data = await ffmpeg.readFile(outputName)
  if (typeof data === 'string') throw new Error('转码输出异常（得到文本而非二进制）')
  return new File([data as BlobPart], file.name, { type: 'video/mp4' })
}
