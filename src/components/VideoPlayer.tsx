import { useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play, Volume2, VolumeX } from 'lucide-react'
import { useAppStore } from '../store'
import type { VideoSession } from '../lib/video/session'
import { formatDuration, formatTime } from '../lib/format'
import { useT } from '../lib/i18n'

/**
 * Preview player for the loaded file. It plays its own object URL, separate
 * from the hidden <video> the session may use for frame capture, so scrubbing
 * here never races the agent's decoder. The timeline marks every frame the
 * agent has looked at; answers and frame thumbnails jump it via `seekTo`.
 */
export function VideoPlayer({ session }: { session: VideoSession }) {
  const t = useT()
  const videoRef = useRef<HTMLVideoElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  // create + revoke in the same effect: a memoised URL would be revoked by
  // StrictMode's simulated unmount and never recreated
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    const u = URL.createObjectURL(session.file)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [session])

  const frames = useAppStore((s) => s.frames)
  const seekRequest = useAppStore((s) => s.seekRequest)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(session.durationSec || 0)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(true)

  // answer timestamps / frame thumbnails → jump here and bring the player into view
  useEffect(() => {
    const v = videoRef.current
    if (!v || !seekRequest) return
    v.pause()
    v.currentTime = Math.max(0, Math.min(seekRequest.t, v.duration || seekRequest.t))
    setTime(v.currentTime)
    const r = wrapRef.current?.getBoundingClientRect()
    if (r && (r.bottom < 0 || r.top > window.innerHeight)) wrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [seekRequest])

  function toggle() {
    const v = videoRef.current
    if (!v) return
    if (v.paused) void v.play().catch(() => {})
    else v.pause()
  }

  function seek(sec: number) {
    const v = videoRef.current
    if (!v) return
    v.currentTime = sec
    setTime(sec)
  }

  const markers = useMemo(() => {
    const seen = new Set<number>()
    return frames
      .map((f) => Math.round(f.timeSec * 10) / 10)
      .filter((x) => (seen.has(x) ? false : (seen.add(x), true)))
  }, [frames])

  return (
    <div ref={wrapRef} className="overflow-hidden rounded-xl border border-line bg-black">
      <div className="group relative">
        <video
          ref={videoRef}
          src={url}
          muted={muted}
          playsInline
          preload="auto"
          onClick={toggle}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          className="block aspect-video w-full cursor-pointer bg-black object-contain"
        />
        {!playing && (
          <button
            type="button"
            onClick={toggle}
            aria-label={t('player.play')}
            // after a seek the user wants to see the frame — only show the big button on hover
            className={`absolute inset-0 m-auto flex h-12 w-12 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition hover:scale-105 focus-visible:opacity-100 ${
              time < 0.05 ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}
          >
            <Play size={20} className="translate-x-px" fill="currentColor" />
          </button>
        )}
      </div>

      <div className="border-t border-white/10 bg-[#0d0f12] px-2.5 pb-2 pt-1.5 text-white">
        <Timeline duration={duration} time={time} markers={markers} onSeek={seek} />
        <div className="mt-1 flex items-center gap-1.5">
          <button
            type="button"
            onClick={toggle}
            className="flex h-7 w-7 items-center justify-center rounded-md text-white/85 hover:bg-white/10 hover:text-white"
            aria-label={playing ? t('player.pause') : t('player.play')}
          >
            {playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
          </button>
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-white/70 hover:bg-white/10 hover:text-white"
            aria-label={muted ? t('player.unmute') : t('player.mute')}
          >
            {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
          <span className="font-mono text-[11px] tabular-nums text-white/75">
            {formatDuration(time)} <span className="text-white/35">/ {formatDuration(duration)}</span>
          </span>
          {markers.length > 0 && (
            <span className="ml-auto flex items-center gap-1.5 text-[11px] text-white/55">
              <span className="h-2.5 w-[3px] rounded-full bg-[#5b8cff]" />
              {t('player.markers', { n: markers.length })}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function Timeline({
  duration,
  time,
  markers,
  onSeek,
}: {
  duration: number
  time: number
  markers: number[]
  onSeek: (t: number) => void
}) {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const dragging = useRef(false)
  const pct = (x: number) => (duration > 0 ? Math.min(100, Math.max(0, (x / duration) * 100)) : 0)

  function timeAt(clientX: number): number {
    const r = ref.current?.getBoundingClientRect()
    if (!r || duration <= 0) return 0
    return Math.min(duration, Math.max(0, ((clientX - r.left) / r.width) * duration))
  }

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={t('player.timeline')}
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(time)}
      aria-valuetext={formatDuration(time)}
      className="group relative h-6 cursor-pointer touch-none select-none outline-none"
      onPointerDown={(e) => {
        dragging.current = true
        e.currentTarget.setPointerCapture(e.pointerId)
        onSeek(timeAt(e.clientX))
      }}
      onPointerMove={(e) => {
        const x = timeAt(e.clientX)
        setHover(x)
        if (dragging.current) onSeek(x)
      }}
      onPointerUp={() => (dragging.current = false)}
      onPointerLeave={() => setHover(null)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 10 : 2
        if (e.key === 'ArrowRight') onSeek(Math.min(duration, time + step))
        else if (e.key === 'ArrowLeft') onSeek(Math.max(0, time - step))
        else return
        e.preventDefault()
      }}
    >
      {/* track */}
      <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/15 transition-[height] group-hover:h-1.5">
        <div className="h-full rounded-full bg-white/70" style={{ width: `${pct(time)}%` }} />
      </div>
      {/* frames the agent looked at */}
      {markers.map((m) => (
        <span
          key={m}
          className="pointer-events-none absolute top-1/2 h-3 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#5b8cff] shadow-[0_0_0_1px_rgba(0,0,0,0.5)]"
          style={{ left: `${pct(m)}%` }}
        />
      ))}
      {/* playhead */}
      <span
        className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow ring-2 ring-black/30 transition-transform group-hover:scale-110"
        style={{ left: `${pct(time)}%` }}
      />
      {hover !== null && (
        <span
          className="pointer-events-none absolute -top-6 -translate-x-1/2 rounded bg-black/85 px-1.5 py-0.5 font-mono text-[10px] text-white"
          style={{ left: `${pct(hover)}%` }}
        >
          {formatTime(hover)}
        </span>
      )}
    </div>
  )
}
