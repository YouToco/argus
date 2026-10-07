import { useRef, useState } from 'react'
import { useAppStore } from '../store'
import type { VideoSession } from '../lib/video/session'
import { memory } from '../lib/agent/memory'
import { formatBitrate, formatBytes, formatDuration, formatFps } from '../lib/format'
import { FilePlus2, Film, Sparkles, X } from 'lucide-react'
import { startSession } from '../lib/persistence'
import { useT } from '../lib/i18n'
import { likelyNeedsTranscode, transcodeToMp4 } from '../lib/video/transcode'
import type { VideoFileInfo } from '../types'
import { VideoPlayer } from './VideoPlayer'

const SAMPLE_VIDEO = { url: '/argus-test-long.webm', name: 'argus-sample.webm' }

const VIDEO_EXT = /\.(mp4|webm|mkv|mov|m4v|avi|wmv|flv|asf|ts|m2ts|mpg|mpeg|vob|3gp|rm|rmvb)$/i

export function VideoPanel() {
  const session = useAppStore((s) => s.session)
  const videoInfo = useAppStore((s) => s.videoInfo)
  const setSession = useAppStore((s) => s.setSession)
  const setVideoInfo = useAppStore((s) => s.setVideoInfo)
  const clearFrames = useAppStore((s) => s.clearFrames)
  const reset = useAppStore((s) => s.reset)
  const running = useAppStore((s) => s.running)
  const t = useT()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadNote, setLoadNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function loadFile(origFile: File) {
    setError(null)
    setLoading(true)
    setLoadNote(null)
    // 同名同大小 = 历史会话重新挂载：保留对话/记忆/帧，兑现 "reload to continue"
    // 转码格式（AVI 等）转码后体积会变，仅按文件名匹配 reattach
    const st = useAppStore.getState()
    const sameName = st.videoInfo && st.videoInfo.name === origFile.name
    const sizeMatch = sameName && st.videoInfo!.sizeBytes === origFile.size
    const reattach = Boolean(
      st.activeSessionId && sameName && (sizeMatch || likelyNeedsTranscode(origFile.name)),
    )
    let file = origFile
    try {
      // mediabunny (~1MB) is only fetched once a video is actually opened
      const { VideoSession } = await import('../lib/video/session')
      let s: VideoSession
      try {
        // 已知浏览器解不了的容器直接进转码，跳过注定失败的探测
        if (likelyNeedsTranscode(origFile.name)) throw new Error('browser-unsupported container')
        s = await VideoSession.create(origFile)
      } catch {
        try {
          file = await transcodeToMp4(origFile, (p) => {
            setLoadNote(
              p.phase === 'downloading'
                ? t('video.transcodeDownload')
                : t('video.transcoding', { pct: Math.round(p.ratio * 100) }),
            )
          })
        } catch (e2) {
          throw new Error(
            t('video.transcodeFailed', { msg: (e2 as Error)?.message ?? String(e2) }),
          )
        }
        setLoadNote(t('video.transcodeDone'))
        s = await VideoSession.create(file)
      }
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
      setError((e as Error)?.message ?? t('video.loadFailed'))
    } finally {
      setLoading(false)
      setLoadNote(null)
    }
  }

  async function loadSample() {
    setError(null)
    setLoading(true)
    setLoadNote(t('video.sampleLoading'))
    try {
      const res = await fetch(SAMPLE_VIDEO.url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      await loadFile(new File([blob], SAMPLE_VIDEO.name, { type: blob.type || 'video/webm' }))
    } catch (e) {
      setError((e as Error)?.message ?? t('video.loadFailed'))
      setLoading(false)
      setLoadNote(null)
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files?.[0]
    const isVideo = f && (f.type.startsWith('video/') || VIDEO_EXT.test(f.name))
    if (f && isVideo) void loadFile(f)
    else setError(t('video.dropError'))
  }

  const dropHandlers = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(true)
    },
    onDragLeave: () => setDragging(false),
    onDrop,
  }

  return (
    <div className="flex flex-col gap-3 p-3" {...(session ? dropHandlers : {})}>
      <div className="flex items-center justify-between px-1 pt-0.5">
        <h2 className="label flex items-center gap-2">
          <Film size={14} className="text-fg-4" />
          {t('video.title')}
        </h2>
        {session && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={running || loading}
              className="btn h-7 px-2 text-xs text-fg-3 hover:bg-surface-2 hover:text-fg"
              title={t('video.replaceTip')}
            >
              <FilePlus2 size={13} />
              {t('video.replace')}
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={running}
              className="btn h-7 w-7 text-fg-3 hover:bg-surface-2 hover:text-fg"
              title={t('video.closeTip')}
              aria-label={t('video.closeTip')}
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      {session ? (
        <>
          <VideoPlayer session={session} />
          {videoInfo && <InfoCard info={videoInfo} />}
          {loading && <div className="loading-bar h-0.5 w-full" />}
          {dragging && <p className="text-center text-xs text-accent-text">{t('video.dropToReplace')}</p>}
        </>
      ) : (
        <>
          {videoInfo && <InfoCard info={videoInfo} detached />}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={loading}
            {...dropHandlers}
            className={`group relative flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed text-center transition-colors duration-200 ${
              videoInfo ? 'px-5 py-6' : 'px-5 py-10'
            } ${
              dragging
                ? 'border-accent bg-accent-soft'
                : 'border-line-strong bg-surface-2/50 hover:border-accent-line hover:bg-accent-soft'
            }`}
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft text-accent-text transition-transform duration-200 group-hover:scale-105">
              <Film size={20} />
            </span>
            <span className="space-y-1">
              <span className="block text-sm font-semibold">
                {loading
                  ? (loadNote ?? t('video.loading'))
                  : videoInfo
                    ? t('video.reloadToContinue', { name: videoInfo.name })
                    : t('video.dropHint')}
              </span>
              <span className="block text-xs text-fg-3">{t('video.formats')}</span>
            </span>
            {loading && <span className="loading-bar h-0.5 w-28" />}
          </button>
          {!videoInfo && !loading && (
            <button
              type="button"
              onClick={() => void loadSample()}
              className="btn mx-auto h-8 px-3 text-xs text-accent-text hover:bg-accent-soft"
            >
              <Sparkles size={13} />
              {t('video.trySample')}
            </button>
          )}
        </>
      )}

      {error && (
        <div className="fade-in rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-xs leading-relaxed text-danger">
          {error}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="video/*,.mkv,.avi,.wmv,.flv,.asf,.ts,.m2ts,.mpg,.mpeg,.vob,.3gp,.rm,.rmvb"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void loadFile(f)
          e.target.value = ''
        }}
      />
    </div>
  )
}

function InfoCard({ info, detached }: { info: VideoFileInfo; detached?: boolean }) {
  const t = useT()
  const stats: Array<[string, string]> = [
    [t('info.duration'), formatDuration(info.durationSec)],
    [t('info.resolution'), info.width ? `${info.width}×${info.height}` : '-'],
    [t('info.fps'), formatFps(info.frameRate)],
    [t('info.codec'), info.codec ?? '-'],
    [t('info.container'), info.container ?? '-'],
    [t('info.size'), formatBytes(info.sizeBytes)],
    [t('info.bitrate'), formatBitrate(info.bitrate)],
    [t('info.audio'), info.hasAudio ? t('info.audioYes') : t('info.audioNo')],
  ]
  return (
    <div className="fade-in rounded-xl border border-line bg-surface-2/60 p-3.5">
      <div className="mb-3 flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-[13px] font-semibold" title={info.name}>
          {info.name}
        </p>
        {detached ? (
          <span className="chip shrink-0 border-warn/30 bg-warn-soft text-warn">{t('info.detached')}</span>
        ) : (
          <span className="chip shrink-0 border-ok/30 bg-ok-soft text-ok">{t('info.ready')}</span>
        )}
      </div>
      <dl className="grid grid-cols-4 gap-x-3 gap-y-2.5">
        {stats.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-[11px] text-fg-3">{k}</dt>
            <dd className="truncate font-mono text-xs text-fg" title={v}>
              {v}
            </dd>
          </div>
        ))}
      </dl>
      {detached && <p className="mt-3 border-t border-line pt-2.5 text-xs text-fg-3">{t('info.detachedNote')}</p>}
    </div>
  )
}
