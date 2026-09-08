import { useRef, useState } from 'react'
import { useAppStore } from '../store'
import { VideoSession } from '../lib/video/session'
import { memory } from '../lib/agent/memory'
import { formatBitrate, formatBytes, formatDuration, formatFps } from '../lib/format'
import { FilmIcon } from './icons'
import { startSession } from '../lib/persistence'
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
    // 同名同大小 = 历史会话重新挂载：保留对话/记忆/帧，兑现 "reload to continue"
    const st = useAppStore.getState()
    const reattach = Boolean(
      st.activeSessionId && st.videoInfo && st.videoInfo.name === file.name && st.videoInfo.sizeBytes === file.size,
    )
    try {
      const s = await VideoSession.create(file)
      setSession(s)
      setVideoInfo(s.basicInfo())
      if (!reattach) {
        clearFrames()
        memory.clear()
        // 新视频 = 新分析会话：清空对话并立即建档持久化
        useAppStore.setState({ messages: [], activities: [] })
        void startSession(file.name, file.size).catch(() => {})
      }
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
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="mono-label flex items-center gap-2 text-zinc-400">
          <span className="h-1.5 w-1.5 bg-[#3d7fff]" />
          video source://
        </h2>
        {session && (
          <button onClick={reset} className="mono-label text-zinc-600 transition hover:text-white">
            reset
          </button>
        )}
      </div>

      {!session ? (
        <>
          {videoInfo && <InfoCard info={videoInfo} detached />}
          <button
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`group relative flex flex-col items-center justify-center gap-4 rounded-md border border-dashed text-center transition-colors duration-200 ${
              videoInfo ? 'px-6 py-7' : 'px-6 py-12'
            } ${
              dragging
                ? 'border-[#3d7fff] bg-[#3d7fff]/10'
                : 'border-white/15 hover:border-[#3d7fff]/50 hover:bg-[#3d7fff]/5'
            }`}
          >
            <span className="mono-label absolute left-2 top-1.5 text-zinc-700">+</span>
            <span className="mono-label absolute right-2 top-1.5 text-zinc-700">+</span>
            <span className="mono-label absolute bottom-1.5 left-2 text-zinc-700">+</span>
            <span className="mono-label absolute bottom-1.5 right-2 text-zinc-700">+</span>

            <FilmIcon size={videoInfo ? 24 : 32} className="text-zinc-300 transition-transform duration-200 group-hover:scale-110" />
            <div className="space-y-1.5">
              <span className="block text-sm font-bold tracking-tight text-white">
                {loading ? '正在加载…' : videoInfo ? '重新加载视频文件以继续分析' : '点击或拖入本地视频'}
              </span>
              <span className="mono-label block text-zinc-600">local only · never uploaded</span>
            </div>
            {loading && <div className="loading-bar h-0.5 w-28" />}
          </button>
        </>
      ) : (
        videoInfo && <InfoCard info={videoInfo} />
      )}

      {error && (
        <div className="fade-in rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs leading-relaxed text-red-400">
          {error}
        </div>
      )}

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

function InfoCard({ info, detached }: { info: VideoFileInfo; detached?: boolean }) {
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
    <div className="fade-in rounded-md border border-white/[0.08] bg-black/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="mono-label text-zinc-500">video info</span>
        {detached ? (
          <span className="mono-label flex items-center gap-1.5 text-amber-400/90">
            <span className="h-1.5 w-1.5 bg-amber-400" />
            file not loaded
          </span>
        ) : (
          <span className="mono-label flex items-center gap-1.5 text-[#5c93ff]">
            <span className="h-1.5 w-1.5 bg-[#3d7fff]" />
            ready
          </span>
        )}
      </div>
      <dl className="space-y-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-3">
            <dt className="shrink-0 text-xs text-zinc-600">{k}</dt>
            <dd className="truncate text-right font-mono text-xs text-zinc-200" title={v}>
              {v}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mono-label mt-3 border-t border-white/[0.06] pt-3 text-zinc-600">
        {detached ? 'metadata restored · frames & memory intact' : 'loaded locally · agent can probe'}
      </p>
    </div>
  )
}