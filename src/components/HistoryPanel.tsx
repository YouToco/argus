import { useState } from 'react'
import { motion } from 'motion/react'
import * as Dialog from '@radix-ui/react-dialog'
import { History, Trash2, X } from 'lucide-react'
import { useAppStore } from '../store'
import { removeSession, restoreSession, wipeAllSessions } from '../lib/persistence'
import { formatBytes } from '../lib/format'

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
    <Dialog.Root open onOpenChange={(o) => { if (!o) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay asChild>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm"
          />
        </Dialog.Overlay>
        <Dialog.Content asChild aria-label="历史记录">
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-[8vh]" onClick={onClose}>
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-2xl rounded-md border border-white/10 bg-[#0a0a0a] p-6 shadow-2xl shadow-black"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-5 flex items-center justify-between">
                <h2 className="mono-label flex items-center gap-2 text-zinc-300">
                  <span className="h-1.5 w-1.5 bg-[#3d7fff]" />
                  history://
                </h2>
                <Dialog.Close asChild>
                  <button type="button" className="btn-ghost rounded-sm p-1.5" aria-label="关闭">
                    <X size={12} />
                  </button>
                </Dialog.Close>
              </div>

              {sessions.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <History size={28} className="text-zinc-700" />
                  <p className="text-xs text-zinc-500">暂无历史记录</p>
                  <p className="mono-label text-zinc-700">analysis sessions are persisted locally</p>
                </div>
              ) : (
                <ul className="scroll-thin max-h-[50vh] space-y-2 overflow-y-auto">
                  {sessions.map((s) => (
                    <li
                      key={s.id}
                      className={`flex items-center gap-3 rounded-md border px-4 py-3 transition-colors ${
                        s.id === activeSessionId ? 'border-[#3d7fff]/40 bg-[#3d7fff]/5' : 'border-white/[0.08] bg-white/[0.02]'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-zinc-200" title={s.videoName}>
                          {s.videoName}
                        </p>
                        <p className="mono-label mt-1 text-zinc-600">
                          {fmtDate(s.updatedAt)} · {s.messageCount} msgs · {formatBytes(s.videoSize)}
                          {s.id === activeSessionId && <span className="text-[#5c93ff]"> · active</span>}
                        </p>
                      </div>

                      {confirmId === s.id ? (
                        <span className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void removeSession(s.id)}
                            className="rounded-sm border border-red-500/40 bg-red-500/10 px-2.5 py-1 font-mono text-[10px] text-red-400 hover:bg-red-500/20"
                          >
                            确认删除
                          </button>
                          <button type="button" onClick={() => setConfirmId(null)} className="btn-ghost mono-label rounded-sm px-2.5 py-1">
                            取消
                          </button>
                        </span>
                      ) : (
                        <span className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void onRestore(s.id)}
                            disabled={restoring !== null}
                            className="btn-primary rounded-sm px-3 py-1.5 text-[10px] font-bold tracking-wider disabled:opacity-40"
                          >
                            {restoring === s.id ? 'RESTORING…' : '恢复'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmId(s.id)}
                            className="btn-ghost rounded-sm p-1.5 text-zinc-500 hover:text-red-400"
                            title="删除该记录"
                          >
                            <Trash2 size={13} />
                          </button>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {sessions.length > 0 && (
                <div className="mt-5 flex items-center justify-between border-t border-white/[0.06] pt-4">
                  <p className="mono-label text-zinc-700">stored in browser IndexedDB · never uploaded</p>
                  {confirmWipe ? (
                    <span className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void wipeAllSessions().then(onClose)}
                        className="rounded-sm border border-red-500/40 bg-red-500/10 px-3 py-1.5 font-mono text-[10px] text-red-400 hover:bg-red-500/20"
                      >
                        确认清空全部
                      </button>
                      <button type="button" onClick={() => setConfirmWipe(false)} className="btn-ghost mono-label rounded-sm px-2.5 py-1">
                        取消
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmWipe(true)}
                      className="btn-ghost mono-label flex items-center gap-1.5 rounded-sm px-3 py-1.5 hover:text-red-400"
                    >
                      <Trash2 size={11} />
                      清空全部
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}