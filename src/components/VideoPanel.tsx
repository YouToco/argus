import { useRef, useState } from 'react'
import { useAppStore } from '../store'
import { VideoSession } from '../lib/video/session'
import { memory } from '../lib/agent/memory'
import { formatBitrate, formatBytes, formatDuration, formatFps } from '../lib/format'
import type { VideoFileInfo } from '../types'

export function VideoPanel() {
  const session = useAppStore((s) => s.session)
  const videoInfo = useAppStore((s) => s.videoInfo)
  const setSession = useAppStore((s) => s.setSession)
  const setVideoInfo = useAppStore((s) => s.setVideoInfo)
  const clearFrames = useAppStore((s) => s.clearFrames)
  const reset = useAppStore((s) => s.reset)
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadFile(file: File) {
    setError(null)
    setLoading(true)
    try {
      const s = await VideoSession.create(file)
      setSession(s)
      setVideoInfo(s.basicInfo())
      clearFrames()
      memory.clear()
      // rich metadata (fps/codec/bitrate) in the background
      s.getInfo()
        .then((full) => setVideoInfo(full))
        .catch(() => {})
    } catch (e) {
      setError((e as Error)?.message ?? '视频加载失败')
    } finally {
      setLoading(false)
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files?.[0]
    if (f && f.type.startsWith('video/')) loadFile(f)
    else setError('请拖入视频文件')
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">视频</h2>
        {session && (
          <button
            onClick={reset}
            className="rounded-md px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            重置
          </button>
        )}
      </div>

      {!session ? (
        <button
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${
            dragging ? 'border-amber-500 bg-amber-500/10' : 'border-zinc-700 hover:border-zinc-500'
          }`}
        >
          <span className="text-2xl">🎞️</span>
          <span className="text-sm text-zinc-300">{loading ? '加载中…' : '点击或拖入本地视频文件'}</span>
          <span className="text-xs text-zinc-500">视频仅在本地浏览器处理，不上传</span>
        </button>
      ) : (
        videoInfo && <InfoCard info={videoInfo} />
      )}

      {error && <p className="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) loadFile(f)
          e.target.value = ''
        }}
      />
    </div>
  )
}

function InfoCard({ info }: { info: VideoFileInfo }) {
  const rows: Array<[string, string]> = [
    ['文件名', info.name],
    ['大小', formatBytes(info.sizeBytes)],
    ['时长', formatDuration(info.durationSec)],
    ['分辨率', info.width ? `${info.width} × ${info.height}` : '-'],
    ['帧率', formatFps(info.frameRate)],
    ['编码', info.codec ?? '-'],
    ['容器', info.container ?? '-'],
    ['码率', formatBitrate(info.bitrate)],
    ['音频', info.hasAudio ? '有' : '-'],
  ]
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
      <dl className="space-y-1.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-2">
            <dt className="shrink-0 text-xs text-zinc-500">{k}</dt>
            <dd className="truncate text-right text-xs text-zinc-200" title={v}>
              {v}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
