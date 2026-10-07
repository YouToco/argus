import { Images } from 'lucide-react'
import { useAppStore } from '../store'
import { formatTime } from '../lib/format'
import { useT } from '../lib/i18n'
import { FrameThumb } from './FrameThumb'

export function FrameGrid() {
  const frames = useAppStore((s) => s.frames)
  const openLightbox = useAppStore((s) => s.openLightbox)
  const t = useT()

  return (
    <div className="p-3">
      <div className="mb-2.5 flex items-center justify-between px-1">
        <h2 className="label flex items-center gap-2">
          <Images size={14} className="text-fg-4" />
          {t('frames.title')}
        </h2>
        {frames.length > 0 && <span className="font-mono text-[11px] text-fg-3">{frames.length}</span>}
      </div>

      {frames.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line px-4 py-8 text-center">
          <Images size={22} className="text-fg-4" />
          <p className="max-w-[16rem] text-xs leading-relaxed text-fg-3">{t('frames.empty')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {frames.map((f, i) => (
            <FrameThumb
              key={f.id}
              frame={f}
              delay={Math.min(i * 30, 400)}
              onOpen={() => openLightbox(frames.map((x) => x.id), i)}
              label={t('frames.open', { time: formatTime(f.timeSec) })}
            />
          ))}
        </div>
      )}
    </div>
  )
}
