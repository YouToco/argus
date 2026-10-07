import { useEffect } from 'react'
import { ChevronLeft, ChevronRight, Crosshair, Image as ImageIcon } from 'lucide-react'
import { useAppStore } from '../store'
import { formatTime } from '../lib/format'
import { frameObjectUrl } from '../lib/frames'
import { useT } from '../lib/i18n'
import { Modal } from './ui/Modal'

/** Full-size frame viewer: ←/→ to step through, "jump to" seeks the player. */
export function FrameLightbox() {
  const t = useT()
  const lightbox = useAppStore((s) => s.lightbox)
  const frames = useAppStore((s) => s.frames)
  const hasPlayer = useAppStore((s) => s.session !== null)
  const close = useAppStore((s) => s.closeLightbox)
  const setIndex = useAppStore((s) => s.setLightboxIndex)
  const seekTo = useAppStore((s) => s.seekTo)

  const ids = lightbox?.frameIds ?? []
  const index = lightbox?.index ?? 0
  const frame = frames.find((f) => f.id === ids[index])
  const prev = () => setIndex(Math.max(0, index - 1))
  const next = () => setIndex(Math.min(ids.length - 1, index + 1))

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') prev()
      else if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!lightbox) return null

  return (
    <Modal
      onClose={close}
      closeLabel={t('common.close')}
      icon={<ImageIcon size={16} />}
      className="max-w-5xl"
      bare
      title={
        <span className="flex items-center gap-2.5">
          {frame ? formatTime(frame.timeSec) : '—'}
          <span className="font-mono text-xs font-normal text-fg-3">
            {index + 1} / {ids.length}
          </span>
        </span>
      }
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-fg-3">
            {frame ? `${frame.width}×${frame.height}` : ''}
            {frame?.source ? ` · ${frame.source}` : ''}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={prev} disabled={index <= 0} className="btn btn-ghost h-8 w-8" aria-label={t('lightbox.prev')}>
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={next}
              disabled={index >= ids.length - 1}
              className="btn btn-ghost h-8 w-8"
              aria-label={t('lightbox.next')}
            >
              <ChevronRight size={16} />
            </button>
            {hasPlayer && frame && (
              <button
                type="button"
                onClick={() => {
                  seekTo(frame.timeSec)
                  close()
                }}
                className="btn btn-primary h-8 px-3 text-xs"
              >
                <Crosshair size={14} />
                {t('lightbox.jump')}
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="flex min-h-[40vh] items-center justify-center bg-black">
        {frame ? (
          <img src={frameObjectUrl(frame)} alt={formatTime(frame.timeSec)} className="max-h-[70vh] w-auto max-w-full object-contain" />
        ) : (
          <p className="text-sm text-white/60">{t('lightbox.missing')}</p>
        )}
      </div>
    </Modal>
  )
}
