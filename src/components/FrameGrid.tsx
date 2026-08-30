import { useAppStore } from '../store'
import { formatTime } from '../lib/format'

export function FrameGrid() {
  const frames = useAppStore((s) => s.frames)

  if (frames.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-1 py-8 text-center">
        <span className="text-xl text-zinc-700">🖼️</span>
        <p className="text-xs text-zinc-600">抽帧结果会显示在这里</p>
        <p className="text-[11px] text-zinc-700">agent 抽帧后可逐帧查看</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {frames.map((f) => (
        <figure
          key={f.id}
          className="group overflow-hidden rounded-lg border border-zinc-800/80 bg-zinc-900/40 transition hover:border-amber-500/50"
        >
          <img
            src={f.dataUrl}
            alt={`frame @ ${formatTime(f.timeSec)}`}
            className="w-full"
            loading="lazy"
          />
          <figcaption className="flex items-center justify-between px-1.5 py-1 text-[10px] text-zinc-500">
            <span className="font-mono">{formatTime(f.timeSec)}</span>
            <span>
              {f.width}×{f.height}
            </span>
          </figcaption>
        </figure>
      ))}
    </div>
  )
}
