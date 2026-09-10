import { useAppStore } from '../store'
import { formatTime } from '../lib/format'
import { frameObjectUrl } from '../lib/frames'
import { useT } from '../lib/i18n'

export function FrameGrid() {
  const frames = useAppStore((s) => s.frames)
  const t = useT()

  if (frames.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-1 py-10 text-center">
        <span className="mono-label text-zinc-700">frames://</span>
        <p className="text-xs text-zinc-600">{t('frames.empty')}</p>
        <p className="mono-label text-zinc-700">agent captures appear here</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-2.5">
      {frames.map((f, i) => (
        <figure
          key={f.id}
          style={{ animationDelay: `${Math.min(i * 60, 600)}ms` }}
          className="fade-in group overflow-hidden rounded-md border border-white/[0.08] bg-black/40 transition-colors duration-200 hover:border-[#3d7fff]/60"
        >
          <div className="overflow-hidden">
            <img
              src={frameObjectUrl(f)}
              alt={`frame @ ${formatTime(f.timeSec)}`}
              className="w-full transition duration-300 group-hover:scale-[1.04]"
              loading="lazy"
            />
          </div>
          <figcaption className="flex items-center justify-between px-2 py-1.5">
            <span className="font-mono text-[10px] text-[#5c93ff]">{formatTime(f.timeSec)}</span>
            <span className="font-mono text-[10px] text-zinc-600">
              {f.width}×{f.height}
            </span>
          </figcaption>
        </figure>
      ))}
    </div>
  )
}