import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useStickToBottom } from 'use-stick-to-bottom'
import { ArrowUp, Check, ChevronDown, CircleAlert, Images, ListTree, Square, X } from 'lucide-react'
import { useAppStore, getActiveProvider, useActiveProvider } from '../store'
import { memory } from '../lib/agent/memory'
import type { AgentContext } from '../lib/agent/tools'
import type { ChatMessage, ExtractedFrame, ToolActivity } from '../types'
import { formatTime } from '../lib/format'
import { citedFirst } from '../lib/timestamps'
import { priorTurns } from '../lib/agent/history'
import { loadFrameById } from '../lib/db'
import { EyeIcon } from './icons'
import { FrameThumb } from './FrameThumb'
import { useT, type I18nKey } from '../lib/i18n'

// streamdown + shiki + the unified pipeline only load once there's an answer to render
const Markdown = lazy(() => import('./Markdown'))

let msgSeq = 0
function nextId(): string {
  msgSeq += 1
  return `m-${msgSeq}`
}

const EXAMPLES: I18nKey[] = ['example.timeline', 'example.count', 'example.find', 'example.text']

export function ChatPanel() {
  const messages = useAppStore((s) => s.messages)
  const frames = useAppStore((s) => s.frames)
  const activities = useAppStore((s) => s.activities)
  const running = useAppStore((s) => s.running)
  const session = useAppStore((s) => s.session)
  const videoInfo = useAppStore((s) => s.videoInfo)
  const setRunning = useAppStore((s) => s.setRunning)
  const setDialog = useAppStore((s) => s.setDialog)
  const { preset, config, ready } = useActiveProvider()
  const t = useT()

  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // stick to the newest content while streaming, but let the user freely
  // scroll back up without being yanked to the bottom on every token
  const { scrollRef, contentRef, scrollToBottom, isAtBottom } = useStickToBottom({ resize: 'smooth', initial: 'smooth' })

  const lastActivity = activities.length > 0 ? activities[activities.length - 1] : null

  // auto-grow the composer up to ~8 lines
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [input])

  function applyExample(key: I18nKey) {
    setInput(t(key))
    inputRef.current?.focus()
  }

  async function send() {
    const text = input.trim()
    if (!text || running) return
    const cfg = getActiveProvider()
    const preset = useAppStore.getState().presets.find((p) => p.id === cfg.id)
    if (preset?.needsApiKey !== false && !cfg.apiKey.trim()) {
      setError(t('chat.needApiKey'))
      return
    }
    if (!cfg.model.trim()) {
      setError(t('chat.needModel'))
      return
    }
    if (!session) {
      setError(t('chat.needVideo'))
      return
    }
    setError(null)
    setInput('')

    const history = priorTurns(useAppStore.getState().messages)
    const userMsg: ChatMessage = { id: nextId(), role: 'user', content: text }
    const asstMsg: ChatMessage = { id: nextId(), role: 'assistant', content: '', pending: true }
    useAppStore.getState().addMessage(userMsg)
    useAppStore.getState().addMessage(asstMsg)
    useAppStore.getState().clearActivities()
    void scrollToBottom()

    // ids of every frame this run extracts (sub-agents included); slicing the
    // store by index breaks once the in-memory window is full and starts evicting
    const runFrameIds: string[] = []
    const startActs = useAppStore.getState().activities.length

    abortRef.current = new AbortController()
    setRunning(true)

    try {
      // the AI SDK + provider packages (~1MB) load on the first send
      const [{ buildModel }, { SYSTEM_PROMPT, runAgent }] = await Promise.all([
        import('../lib/llm'),
        import('../lib/agent/harness'),
      ])
      let model
      try {
        model = buildModel(cfg)
      } catch (e) {
        useAppStore.getState().updateMessage(asstMsg.id, {
          error: true,
          content: t('chat.modelInitFailed', { msg: (e as Error)?.message ?? String(e) }),
        })
        return
      }

      const ctx: AgentContext = {
        session,
        addFrames: (f) => {
          runFrameIds.push(...f.map((x) => x.id))
          useAppStore.getState().addFrames(f)
        },
        listFrames: () => useAppStore.getState().frames,
        getFrameById: (id) => useAppStore.getState().frames.find((fr) => fr.id === id),
        memory,
        runSubagent: () => Promise.resolve(''),
      }

      await runAgent({
        model,
        system: SYSTEM_PROMPT,
        messages: [...history, { role: 'user', content: text }],
        context: ctx,
        maxSteps: 30,
        signal: abortRef.current.signal,
        onTextDelta: (d) => useAppStore.getState().appendToMessage(asstMsg.id, d),
        onActivity: (a) => useAppStore.getState().addActivity(a),
      })
    } catch (e) {
      const isAbort = (e as Error)?.name === 'AbortError' || (e as DOMException)?.name === 'AbortError'
      if (isAbort) {
        useAppStore.getState().appendToMessage(asstMsg.id, `\n\n${t('chat.stopped')}`)
      } else {
        useAppStore.getState().updateMessage(asstMsg.id, { error: true })
        const msg = (e as Error)?.message ?? String(e)
        // the CORS hint only helps when the request never got an answer — a
        // 401 / 400 from the provider already says what is wrong
        const status = (e as { statusCode?: unknown })?.statusCode
        const hint = typeof status !== 'number' && /fetch|network|cors|connect/i.test(msg) ? `\n\n${t('chat.corsHint')}` : ''
        useAppStore.getState().appendToMessage(asstMsg.id, `\n\n${t('chat.runError', { msg })}${hint}`)
      }
    } finally {
      const newActs = useAppStore.getState().activities.slice(startActs)
      // a stopped or failed run leaves the tool calls it was in the middle of
      // marked as running forever — close them out
      const stopped = abortRef.current?.signal.aborted
      for (const a of dedupeActivities(newActs)) {
        if (a.status === 'running') newActs.push({ ...a, status: 'error', summary: stopped ? t('chat.stopped') : a.summary })
      }
      useAppStore.getState().updateMessage(asstMsg.id, {
        pending: false,
        frameIds: [...new Set(runFrameIds)],
        activities: newActs,
      })
      setRunning(false)
      abortRef.current = null
    }
  }

  function stop() {
    abortRef.current?.abort()
  }

  const canSend = !running && input.trim().length > 0

  return (
    <div className="flex h-full min-h-0 flex-col">
      {messages.length === 0 ? (
        // outside the stick-to-bottom scroller, so a tall onboarding view starts at its top
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col px-4 py-6 sm:px-6">
            <EmptyState onExample={applyExample} />
          </div>
        </div>
      ) : (
        <div ref={scrollRef} className="scroll-thin relative min-h-0 flex-1 overflow-y-auto">
          <div ref={contentRef} className="mx-auto flex min-h-full w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6">
            {messages.map((m) => (
              <Message key={m.id} message={m} frames={frames} liveActivities={m.pending ? activities : undefined} running={running} />
            ))}
          </div>

          {!isAtBottom && (
            <button
              type="button"
              onClick={() => void scrollToBottom()}
              className="sticky bottom-4 mx-auto flex h-8 w-8 items-center justify-center rounded-full border border-line-strong bg-elevated text-fg-2 shadow-lg backdrop-blur-sm transition-colors hover:text-accent-text"
              aria-label={t('chat.backToBottom')}
            >
              <ChevronDown size={16} />
            </button>
          )}
        </div>
      )}

      {videoInfo && !session && (
        <div className="flex items-center gap-2 border-t border-warn/25 bg-warn-soft px-4 py-2 text-xs text-warn">
          <CircleAlert size={14} className="shrink-0" />
          <span className="min-w-0 truncate">{t('chat.restored', { name: videoInfo.name })}</span>
        </div>
      )}

      <div className="border-t border-line bg-surface px-3 pb-3 pt-3 sm:px-4">
        <div className="mx-auto w-full max-w-4xl">
          {running && (
            <div className="fade-in mb-2.5 flex items-center gap-2.5 px-1 text-xs text-fg-3">
              <span className="status-dot h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              {lastActivity ? (
                <span className="min-w-0 truncate">
                  {t('chat.calling')} <span className="font-mono text-accent-text">{lastActivity.toolName}</span>
                  {lastActivity.depth > 0 ? t('chat.subagentSuffix') : ''}
                </span>
              ) : (
                <span>{t('chat.thinking')}</span>
              )}
            </div>
          )}
          {error && (
            <p className="fade-in mb-2.5 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger">
              <CircleAlert size={14} className="mt-px shrink-0" />
              {error}
            </p>
          )}
          <div className="field flex flex-col gap-1 px-3 pb-2 pt-2.5">
            <textarea
              ref={inputRef}
              id="chat-input"
              name="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  void send()
                }
              }}
              rows={1}
              placeholder={session ? t('chat.placeholder') : t('chat.placeholderNoVideo')}
              className="scroll-thin max-h-[200px] min-h-[24px] w-full resize-none bg-transparent text-[14px] leading-6 text-fg outline-none placeholder:text-fg-4"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDialog('provider')}
                className="chip min-w-0 max-w-[60%] text-fg-3 transition-colors hover:border-line-strong hover:text-fg"
                title={t('app.modelSettings')}
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ready ? 'bg-ok' : 'bg-warn'}`} />
                <span className="truncate">{ready ? `${preset?.name ?? config.id} · ${config.model}` : t('app.setupModel')}</span>
              </button>
              <span className="hidden items-center gap-1 text-[11px] text-fg-4 md:flex">
                <span className="kbd">Enter</span> {t('chat.sendKey')} · <span className="kbd">Shift+Enter</span> {t('chat.newlineKey')}
              </span>
              {running ? (
                <button
                  type="button"
                  onClick={stop}
                  className="btn btn-danger ml-auto h-8 px-3 text-xs"
                  aria-label={t('chat.stop')}
                >
                  <Square size={10} fill="currentColor" strokeWidth={0} />
                  {t('chat.stop')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={!canSend}
                  className="btn btn-primary ml-auto h-8 w-8 rounded-full"
                  aria-label={t('chat.send')}
                  title={t('chat.send')}
                >
                  <ArrowUp size={16} strokeWidth={2.25} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function EmptyState({ onExample }: { onExample: (k: I18nKey) => void }) {
  const t = useT()
  const hasVideo = useAppStore((s) => s.session !== null)
  const setDialog = useAppStore((s) => s.setDialog)
  const { preset, ready } = useActiveProvider()

  const steps = [
    {
      done: ready,
      title: t('empty.step1'),
      desc: ready ? t('empty.step1Done', { name: preset?.name ?? '' }) : t('empty.step1Desc'),
      action: !ready ? (
        <button type="button" onClick={() => setDialog('provider')} className="btn btn-primary mt-2 h-7 px-2.5 text-xs">
          {t('empty.step1Action')}
        </button>
      ) : null,
    },
    { done: hasVideo, title: t('empty.step2'), desc: hasVideo ? t('empty.step2Done') : t('empty.step2Desc') },
    { done: false, title: t('empty.step3'), desc: t('empty.step3Desc') },
  ]

  return (
    <div className="fade-in flex flex-1 flex-col items-center justify-center gap-7 py-6 text-center">
      <div className="flex flex-col items-center gap-4">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent-text ring-1 ring-accent-line">
          <EyeIcon size={30} />
        </span>
        <div className="space-y-2">
          <h2 className="text-[clamp(1.6rem,4vw,2.25rem)] font-bold tracking-tight">{t('empty.title')}</h2>
          <p className="mx-auto max-w-lg text-sm leading-relaxed text-fg-3">{t('chat.emptyDesc')}</p>
        </div>
      </div>

      <ol className="grid w-full max-w-2xl gap-2.5 text-left sm:grid-cols-3">
        {steps.map((s, i) => (
          <li
            key={i}
            className={`rounded-xl border p-3.5 transition-colors ${s.done ? 'border-ok/25 bg-ok-soft' : 'border-line bg-surface-2/60'}`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                  s.done ? 'bg-ok text-white' : 'bg-surface-3 text-fg-3'
                }`}
              >
                {s.done ? <Check size={12} strokeWidth={3} /> : i + 1}
              </span>
              <span className="text-[13px] font-semibold">{s.title}</span>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-fg-3">{s.desc}</p>
            {s.action}
          </li>
        ))}
      </ol>

      {hasVideo && (
        <div className="w-full max-w-2xl">
          <p className="label mb-2.5">{t('empty.tryAsking')}</p>
          <div className="flex flex-wrap justify-center gap-2">
            {EXAMPLES.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => onExample(k)}
                className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-[13px] text-fg-2 transition-colors hover:border-accent-line hover:bg-accent-soft hover:text-fg"
              >
                {t(k)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Process view — collapsible tool-call / subagent trace (mainstream agent UI)
// ---------------------------------------------------------------------------

/** status updates arrive as appended records with the same id — keep the latest. */
function dedupeActivities(list: ToolActivity[]): ToolActivity[] {
  const map = new Map<string, ToolActivity>()
  for (const a of list) map.set(a.id, a)
  return [...map.values()]
}

function brief(input: unknown): string {
  if (!input || typeof input !== 'object') return ''
  const p = input as Record<string, unknown>
  const n = (k: string) => (typeof p[k] === 'number' ? (p[k] as number) : undefined)
  const s = (k: string) => (typeof p[k] === 'string' ? (p[k] as string) : undefined)
  if (n('start_seconds') !== undefined && n('end_seconds') !== undefined) {
    const range = `${n('start_seconds')}-${n('end_seconds')}s`
    const iv = n('interval_seconds')
    const topic = s('topic')
    return iv !== undefined ? `${range} @${iv}s` : topic ? `[${range}] ${topic}` : range
  }
  if (n('time_seconds') !== undefined) return `@${n('time_seconds')}s`
  if (Array.isArray(p.time_range)) {
    const tr = p.time_range as number[]
    const goal = s('goal')
    return `[${tr[0]}-${tr[1]}s]${goal ? ' ' + (goal.length > 40 ? goal.slice(0, 40) + '…' : goal) : ''}`
  }
  const q = s('query') ?? s('topic')
  if (q) return q.length > 40 ? q.slice(0, 40) + '…' : q
  if (s('frame_id')) return `frame ${s('frame_id')}`
  return ''
}

function ProcessBlock({ activities, live }: { activities: ToolActivity[]; live: boolean }) {
  const t = useT()
  const [open, setOpen] = useState(live)
  const items = useMemo(() => dedupeActivities(activities), [activities])
  const mainCount = items.filter((a) => a.depth === 0).length
  const subCount = items.length - mainCount
  const runningCount = items.filter((a) => a.status === 'running').length
  const errorCount = items.filter((a) => a.status === 'error').length

  // open while the agent works, fold away once the answer is in
  const wasLive = useRef(live)
  useEffect(() => {
    if (live) setOpen(true)
    else if (wasLive.current) setOpen(false)
    wasLive.current = live
  }, [live])

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface-2/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-xs transition-colors hover:bg-surface-2"
      >
        {live ? (
          <span className="status-dot h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
        ) : (
          <ListTree size={14} className="shrink-0 text-fg-3" />
        )}
        <span className="font-semibold text-fg-2">{live ? t('process.working') : t('process.done')}</span>
        <span className="text-fg-3">
          {t('process.steps', { n: mainCount })}
          {subCount > 0 ? t('process.subagents', { n: subCount }) : ''}
          {live && runningCount > 0 ? t('process.running', { n: runningCount }) : ''}
        </span>
        {errorCount > 0 && <span className="chip border-danger/30 bg-danger-soft text-danger">{t('process.errors', { n: errorCount })}</span>}
        <ChevronDown size={14} className={`ml-auto shrink-0 text-fg-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* grid-rows 0fr→1fr animates height without measuring */}
      <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="min-h-0 overflow-hidden">
          <ul className="scroll-thin max-h-80 space-y-px overflow-y-auto border-t border-line p-1.5">
            {items.map((a) => (
              <ProcessItem key={a.id} activity={a} />
            ))}
            {items.length === 0 && <li className="px-3 py-2 text-xs text-fg-3">{t('process.waiting')}</li>}
          </ul>
        </div>
      </div>
    </div>
  )
}

function ProcessItem({ activity: a }: { activity: ToolActivity }) {
  const t = useT()
  const [detail, setDetail] = useState(false)
  const isSub = a.depth > 0
  const b = brief(a.input)
  return (
    <li className={isSub ? 'ml-5 border-l border-accent-line pl-2' : ''}>
      <button
        type="button"
        onClick={() => setDetail((v) => !v)}
        aria-expanded={detail}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-3/60"
      >
        {a.status === 'running' ? (
          <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent" />
        ) : a.status === 'error' ? (
          <X size={12} className="shrink-0 text-danger" />
        ) : (
          <Check size={12} className="shrink-0 text-ok" />
        )}
        <span className={`shrink-0 font-mono text-[12px] ${isSub ? 'text-accent-text' : 'text-fg-2'}`}>{a.toolName}</span>
        {isSub && <span className="chip shrink-0 border-accent-line px-1.5 text-[10px] leading-4 text-accent-text">{t('process.sub')}</span>}
        {b && <span className="min-w-0 truncate font-mono text-[11px] text-fg-3">{b}</span>}
        {a.summary && (
          <span className="ml-auto hidden min-w-0 max-w-[45%] truncate text-right text-[11px] text-fg-3 sm:block" title={a.summary}>
            {a.summary}
          </span>
        )}
      </button>
      {detail && (
        <div className="mx-2 mb-1.5 space-y-2 rounded-lg border border-line bg-surface p-2.5">
          <div>
            <p className="mb-1 text-[11px] font-semibold text-fg-3">{t('process.input')}</p>
            <pre className="scroll-thin max-h-32 overflow-auto font-mono text-[11px] leading-relaxed text-fg-2">
              {JSON.stringify(a.input, null, 2)}
            </pre>
          </div>
          {a.summary && (
            <div>
              <p className="mb-1 text-[11px] font-semibold text-fg-3">{t('process.result')}</p>
              <p className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-fg-2">{a.summary}</p>
            </div>
          )}
        </div>
      )}
    </li>
  )
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/** ids already probed in IndexedDB — avoids re-fetch loops for frames that no longer exist. */
const attemptedFrames = new Set<string>()

/**
 * Frames evicted from the in-memory window (MAX_FRAMES_IN_MEMORY) are still in
 * IndexedDB — reload them on demand when an old message's thumbnails render.
 */
function useLazyFrames(frameIds: string[] | undefined, skip: boolean) {
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  useEffect(() => {
    if (skip || !frameIds?.length || !activeSessionId) return
    const st = useAppStore.getState()
    const missing = frameIds.filter((id) => !st.frames.some((f) => f.id === id) && !attemptedFrames.has(id))
    if (missing.length === 0) return
    missing.forEach((id) => attemptedFrames.add(id))
    void (async () => {
      const loaded: ExtractedFrame[] = []
      for (const fid of missing.slice(0, 24)) {
        const f = await loadFrameById(activeSessionId, fid).catch(() => undefined)
        if (f) loaded.push(f)
      }
      if (loaded.length > 0) useAppStore.getState().addFrames(loaded)
    })()
  }, [frameIds, activeSessionId, skip])
}

function Message({
  message,
  frames,
  liveActivities,
  running,
}: {
  message: ChatMessage
  frames: ExtractedFrame[]
  liveActivities?: ToolActivity[]
  running: boolean
}) {
  const t = useT()
  const openLightbox = useAppStore((s) => s.openLightbox)
  const isUser = message.role === 'user'
  useLazyFrames(message.frameIds, isUser)
  const { frames: frameObjs, cited } = useMemo(
    () =>
      citedFirst(
        (message.frameIds ?? []).map((id) => frames.find((f) => f.id === id)).filter((f): f is ExtractedFrame => Boolean(f)),
        message.content,
      ),
    [message.frameIds, message.content, frames],
  )

  if (isUser) {
    return (
      <div className="fade-in flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-[14px] leading-relaxed text-accent-fg">
          <span className="whitespace-pre-wrap">{message.content}</span>
        </div>
      </div>
    )
  }

  const trace = liveActivities ?? message.activities ?? []
  const streaming = Boolean(message.pending && running)

  return (
    <div className="fade-in flex gap-3">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-text ring-1 ring-accent-line">
        <EyeIcon size={16} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {trace.length > 0 && <ProcessBlock activities={trace} live={Boolean(liveActivities) && running} />}

        <div className="min-w-0">
          {message.content ? (
            <Suspense fallback={<p className="whitespace-pre-wrap text-[14px] leading-[1.75] text-fg-2">{message.content}</p>}>
              <Markdown content={message.content} streaming={streaming} />
            </Suspense>
          ) : (
            message.pending && (
              <span className="flex items-center gap-2 text-sm text-fg-3">
                {t('chat.thinkingInline')}
                <span className="caret" />
              </span>
            )
          )}
          {message.error && (
            <span className="chip mt-2 border-danger/30 bg-danger-soft text-danger">
              <CircleAlert size={12} />
              {t('chat.errorMark')}
            </span>
          )}
        </div>

        {frameObjs.length > 0 && (
          <div>
            <p className="label mb-2 flex items-center gap-1.5">
              <Images size={13} className="text-fg-4" />
              {t('chat.evidence', { n: frameObjs.length })}
              {cited > 0 && cited < frameObjs.length && (
                <span className="font-normal text-fg-4">· {t('chat.evidenceCited', { n: cited })}</span>
              )}
            </p>
            <div className="scroll-thin -mx-1 flex gap-2 overflow-x-auto px-1 pb-1.5">
              {frameObjs.map((f, i) => (
                <FrameThumb
                  key={f.id}
                  frame={f}
                  className={`h-[72px] w-32 ${i < cited ? 'ring-1 ring-accent-line' : ''}`}
                  label={t('frames.open', { time: formatTime(f.timeSec) })}
                  onOpen={() => openLightbox(frameObjs.map((x) => x.id), i)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
