import { useState } from 'react'
import { Film, History, RefreshCw, Trash2 } from 'lucide-react'
import { useAppStore } from '../store'
import { removeSession, restoreSession, wipeAllSessions } from '../lib/persistence'
import { formatBytes } from '../lib/format'
import { useT } from '../lib/i18n'
import { Modal } from './ui/Modal'

function fmtDate(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function HistoryPanel({ onClose }: { onClose: () => void }) {
  const sessions = useAppStore((s) => s.sessions)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [confirmWipe, setConfirmWipe] = useState(false)
  const [restoring, setRestoring] = useState<string | null>(null)
  const t = useT()

  async function onRestore(id: string) {
    setRestoring(id)
    try {
      await restoreSession(id)
      onClose()
    } finally {
      setRestoring(null)
    }
  }

  return (
    <Modal
      title={t('history.title')}
      icon={<History size={16} />}
      onClose={onClose}
      closeLabel={t('common.close')}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-fg-3">{t('history.storageNote')}</p>
          {sessions.length > 0 &&
            (confirmWipe ? (
              <span className="flex items-center gap-2">
                <button type="button" onClick={() => void wipeAllSessions().then(onClose)} className="btn btn-danger h-8 px-3 text-xs">
                  {t('history.wipeConfirm')}
                </button>
                <button type="button" onClick={() => setConfirmWipe(false)} className="btn btn-ghost h-8 px-3 text-xs">
                  {t('history.cancel')}
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmWipe(true)}
                className="btn btn-ghost h-8 px-3 text-xs hover:!text-danger"
              >
                <Trash2 size={13} />
                {t('history.wipeAll')}
              </button>
            ))}
        </div>
      }
    >
      {sessions.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <History size={28} className="text-fg-4" />
          <p className="text-sm font-medium text-fg-2">{t('history.empty')}</p>
          <p className="text-xs text-fg-3">{t('history.emptyDesc')}</p>
        </div>
      ) : (
        <ul className="scroll-thin -mx-1 max-h-[55vh] space-y-2 overflow-y-auto px-1">
          {sessions.map((s) => {
            const active = s.id === activeSessionId
            return (
              <li
                key={s.id}
                className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors ${
                  active ? 'border-accent-line bg-accent-soft' : 'border-line bg-surface-2/50 hover:border-line-strong'
                }`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-fg-3">
                  <Film size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium" title={s.videoName}>
                    <span className="truncate">{s.videoName}</span>
                    {active && <span className="chip shrink-0 border-accent-line text-accent-text">{t('history.active')}</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-fg-3">
                    {fmtDate(s.updatedAt)} · {t('history.msgs', { n: s.messageCount })} · {formatBytes(s.videoSize)}
                  </p>
                </div>

                {confirmId === s.id ? (
                  <span className="flex shrink-0 items-center gap-2">
                    <button type="button" onClick={() => void removeSession(s.id)} className="btn btn-danger h-8 px-3 text-xs">
                      {t('history.confirmDelete')}
                    </button>
                    <button type="button" onClick={() => setConfirmId(null)} className="btn btn-ghost h-8 px-3 text-xs">
                      {t('history.cancel')}
                    </button>
                  </span>
                ) : (
                  <span className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void onRestore(s.id)}
                      disabled={restoring !== null}
                      className="btn btn-ghost h-8 px-3 text-xs"
                    >
                      {restoring === s.id && <RefreshCw size={13} className="animate-spin" />}
                      {restoring === s.id ? t('history.restoring') : t('history.restore')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmId(s.id)}
                      className="btn h-8 w-8 text-fg-3 hover:bg-danger-soft hover:text-danger"
                      title={t('history.deleteTip')}
                      aria-label={t('history.deleteTip')}
                    >
                      <Trash2 size={14} />
                    </button>
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Modal>
  )
}
