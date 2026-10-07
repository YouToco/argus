import type { ExtractedFrame } from '../types'
import { formatTime } from '../lib/format'
import { frameObjectUrl } from '../lib/frames'

/** Clickable frame thumbnail with its timestamp burned into the corner. */
export function FrameThumb({
  frame,
  onOpen,
  label,
  delay = 0,
  className = 'w-full',
}: {
  frame: ExtractedFrame
  onOpen: () => void
  label: string
  delay?: number
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title={label}
      aria-label={label}
      style={{ animationDelay: `${delay}ms` }}
      className={`fade-in group relative block shrink-0 overflow-hidden rounded-lg border border-line bg-black transition-colors hover:border-accent ${className}`}
    >
      <img
        src={frameObjectUrl(frame)}
        alt=""
        className="aspect-video h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]"
        loading="lazy"
      />
      <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 py-px font-mono text-[10px] leading-4 text-white">
        {formatTime(frame.timeSec)}
      </span>
    </button>
  )
}
