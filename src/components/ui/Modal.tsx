import type { ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'

/**
 * Shared dialog shell: Radix handles focus trap, scroll lock, Esc and aria;
 * this only supplies the look (overlay, card, header) for every modal.
 */
export function Modal({
  title,
  icon,
  onClose,
  closeLabel,
  children,
  footer,
  className = 'max-w-2xl',
  onEscapeKeyDown,
  bare,
}: {
  title: ReactNode
  icon?: ReactNode
  onClose: () => void
  closeLabel: string
  children: ReactNode
  footer?: ReactNode
  className?: string
  onEscapeKeyDown?: (e: KeyboardEvent) => void
  /** skip the padded card (e.g. full-bleed image viewer) */
  bare?: boolean
}) {
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fade-in fixed inset-0 z-50 bg-overlay backdrop-blur-[3px]" />
        <Dialog.Content
          aria-describedby={undefined}
          onEscapeKeyDown={onEscapeKeyDown}
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-3 pt-[6vh] outline-none sm:p-6 sm:pt-[8vh]"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) onClose()
          }}
        >
          <div
            className={`pop-in w-full overflow-hidden rounded-2xl border border-line bg-elevated text-fg ${className}`}
            style={{ boxShadow: 'var(--shadow-pop)' }}
          >
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
              <Dialog.Title className="flex min-w-0 items-center gap-2.5 text-[15px] font-semibold tracking-tight">
                {icon && <span className="text-accent-text">{icon}</span>}
                {title}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" className="btn btn-ghost h-8 w-8 shrink-0 border-transparent" aria-label={closeLabel}>
                  <X size={16} />
                </button>
              </Dialog.Close>
            </div>
            <div className={bare ? '' : 'px-5 py-5'}>{children}</div>
            {footer && <div className="border-t border-line bg-surface-2/60 px-5 py-3.5">{footer}</div>}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
