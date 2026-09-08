import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useStickToBottom } from 'use-stick-to-bottom'
import { Check, ChevronDown, Square, X } from 'lucide-react'
import { useAppStore, getActiveProvider } from '../store'
import { buildModel } from '../lib/providers'
import { SYSTEM_PROMPT, runAgent } from '../lib/agent/harness'
import { memory } from '../lib/agent/memory'
import type { AgentContext } from '../lib/agent/tools'
import type { ChatMessage, ExtractedFrame, ToolActivity } from '../types'
import { formatTime } from '../lib/format'
import { loadFrameById } from '../lib/db'
import { EyeIcon } from './icons'
import { Markdown } from './Markdown'

let msgSeq = 0
function nextId(): string {
  msgSeq += 1
  return `m-${msgSeq}`
}

export function ChatPanel() {
  const messages = useAppStore((s) => s.messages)
  const frames = useAppStore((s) => s.frames)
  const activities = useAppStore((s) => s.activities)
  const running = useAppStore((s) => s.running)
  const session = useAppStore((s) => s.session)
  const videoInfo = useAppStore((s) => s.videoInfo)
  const setRunning = useAppStore((s) => s.setRunning)

  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // stick to the newest content while streaming, but let the user freely
  // scroll back up without being yanked to the bottom on every token
  const { scrollRef, contentRef, scrollToBottom, isAtBottom } = useStickToBottom({ resize: 'smooth', initial: 'smooth' })

  const lastActivity = activities.length > 0 ? activities[activities.length - 1] : null

  async function send() {
    const text = input.trim()
    if (!text || running) return
    const cfg = getActiveProvider()
    const preset = useAppStore.getState().presets.find((p) => p.id === cfg.id)
    if (preset?.needsApiKey !== false && !cfg.apiKey.trim()) {
      setError('请先点击右上角「模型配置」填写 API Key')
      return
    }
    if (!cfg.model.trim()) {
      setError('请填写模型名称')
      return
    }
    if (!session) {
      setError('请先在左侧加载一个视频文件')
      return
    }
    setError(null)
    setInput('')

    const userMsg: ChatMessage = { id: nextId(), role: 'user', content: text }
    const asstMsg: ChatMessage = { id: nextId(), role: 'assistant', content: '', pending: true }
    useAppStore.getState().addMessage(userMsg)
    useAppStore.getState().addMessage(asstMsg)
    useAppStore.getState().clearActivities()
    void scrollToBottom()

    const startFrames = useAppStore.getState().frames.length
    const startActs = useAppStore.getState().activities.length

    let model
    try {
      model = buildModel(cfg)
    } catch (e) {
      useAppStore.getState().updateMessage(asstMsg.id, {
        pending: false,
        error: true,
        content: `模型初始化失败：${(e as Error)?.message ?? String(e)}`,
      })
      return
    }

    const ctx: AgentContext = {
      session,
      addFrames: (f) => useAppStore.getState().addFrames(f),
      listFrames: () => useAppStore.getState().frames,
      getFrameById: (id) => useAppStore.getState().frames.find((fr) => fr.id === id),
      memory,
      runSubagent: () => Promise.resolve(''),
    }

    abortRef.current = new AbortController()
    setRunning(true)

    try {
      await runAgent({
        model,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: text }],
        context: ctx,
        maxSteps: 30,
        signal: abortRef.current.signal,
        onTextDelta: (d) => useAppStore.getState().appendToMessage(asstMsg.id, d),
        onActivity: (a) => useAppStore.getState().addActivity(a),
      })
    } catch (e) {
      const isAbort = (e as Error)?.name === 'AbortError' || (e as DOMException)?.name === 'AbortError'
      if (isAbort) {
        useAppStore.getState().appendToMessage(asstMsg.id, '\n\n（已停止）')
      } else {
        useAppStore.getState().updateMessage(asstMsg.id, { error: true })
        const hint =
          '若为 CORS / fetch 错误，通常是该端点不允许浏览器直连；请检查 baseURL 或改用支持浏览器直连的端点（见右上角配置说明）。'
        useAppStore.getState().appendToMessage(asstMsg.id, `\n\n❌ 出错：${(e as Error)?.message ?? String(e)}\n${hint}`)
      }
    } finally {
      const st = useAppStore.getState()
      const newFrames = st.frames.slice(startFrames)
      const newActs = st.activities.slice(startActs)
      useAppStore.getState().updateMessage(asstMsg.id, {
        pending: false,
        frameIds: newFrames.map((f) => f.id),
        activities: newActs,
      })
      setRunning(false)
      abortRef.current = null
    }
  }

  function stop() {
    abortRef.current?.abort()
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="scroll-thin relative flex-1 overflow-y-auto">
        <div ref={contentRef} className="flex min-h-full flex-col space-y-5 px-5 py-5">
          {messages.length === 0 && <EmptyState />}
          {messages.map((m) => (
            <Message
              key={m.id}
              message={m}
              frames={frames}
              liveActivities={m.pending ? activities : undefined}
              running={running}
            />
          ))}
        </div>

        {!isAtBottom && (
          <button
            type="button"
            onClick={() => void scrollToBottom()}
            className="absolute bottom-4 left-1/2 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border border-white/10 bg-[#0a0a0a]/90 text-zinc-300 shadow-lg shadow-black backdrop-blur-sm transition-colors hover:border-[#3d7fff]/60 hover:text-[#5c93ff]"
            aria-label="回到底部"
          >
            <ChevronDown size={15} />
          </button>
        )}
      </div>

      {videoInfo && !session && (
        <div className="border-t border-white/[0.08] bg-[#3d7fff]/5 px-4 py-2">
          <p className="mono-label text-zinc-500">
            restored from local history · reload <span className="text-[#5c93ff]">{videoInfo.name}</span> to continue
          </p>
        </div>
      )}

      <div className="border-t border-white/[0.08] bg-black/40 p-4">
        {running && (
          <div className="fade-in mb-3 flex items-center gap-2.5 rounded-md border border-white/[0.08] bg-white/[0.02] px-3 py-2">
            <span className="status-dot h-1.5 w-1.5 rounded-full bg-[#3d7fff]" />
            {lastActivity ? (
              <span className="font-mono text-[11px] text-zinc-400">
                calling <span className="text-[#5c93ff]">{lastActivity.toolName}</span>
                {lastActivity.depth > 0 ? ' · subagent' : ''}
              </span>
            ) : (
              <span className="mono-label text-zinc-500">thinking…</span>
            )}
            <button onClick={stop} className="btn-ghost mono-label ml-auto flex items-center gap-1.5 rounded-sm px-2.5 py-1">
              <Square size={9} fill="currentColor" strokeWidth={0} />
              stop
            </button>
          </div>
        )}
        {error && (
          <p className="fade-in mb-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>
        )}
        <div className="flex items-end gap-2.5">
          <textarea
            id="chat-input"
            name="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            rows={2}
            placeholder="描述你要分析的需求，例如：数一下这段监控视频里一共有几个人 / 找出画面里的红色物品…"
            className="input-line scroll-thin flex-1 resize-none rounded-md border border-white/10 bg-black/60 px-3.5 py-2.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
          />
          <button
            onClick={running ? stop : send}
            disabled={!running && !input.trim()}
            className={`flex items-center gap-1.5 rounded-md px-5 py-2.5 text-xs font-bold tracking-wide ${
              running
                ? 'btn-ghost border-red-500/40 text-red-400 hover:border-red-400 hover:bg-red-500/10 hover:text-red-300'
                : 'btn-primary'
            }`}
          >
            {running ? (
              <>
                <Square size={9} fill="currentColor" strokeWidth={0} />
                停止
              </>
            ) : (
              '发送'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="fade-in flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
      <p className="mono-label text-[#5c93ff]">long-video understanding · agent harness</p>
      <div className="flex items-center gap-3">
        <EyeIcon size={56} className="shrink-0 text-[#3d7fff]" />
        <h2 className="whitespace-nowrap text-[clamp(2rem,6vw,3.75rem)] font-extrabold tracking-tighter text-white">
          Argus<span className="caret ml-1.5" />
        </h2>
      </div>
      <p className="max-w-md text-sm leading-relaxed text-zinc-500">
        加载视频后，用一句话描述需求。agent 会自动了解视频信息、按需抽帧观察、记录状态，必要时派子代理细看长片段、放大确认细节。
      </p>
      <p className="mono-label text-zinc-700">drop a video on the left to begin</p>
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
  const [open, setOpen] = useState(live)
  const items = useMemo(() => dedupeActivities(activities), [activities])
  const mainCount = items.filter((a) => a.depth === 0).length
  const subCount = items.length - mainCount
  const runningCount = items.filter((a) => a.status === 'running').length

  useEffect(() => {
    if (live) setOpen(true)
  }, [live])

  return (
    <div className="rounded-md border border-white/[0.08] bg-black/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        {live ? (
          <span className="status-dot h-1.5 w-1.5 rounded-full bg-[#3d7fff]" />
        ) : (
          <Check size={11} className="shrink-0 text-emerald-400" />
        )}
        <span className="mono-label text-zinc-400">
          {live ? `working · ${mainCount} steps` : `process · ${mainCount} steps`}
          {subCount > 0 ? ` · ${subCount} subagent` : ''}
          {live && runningCount > 0 ? ` · ${runningCount} running` : ''}
        </span>
        <ChevronDown
          size={12}
          className={`ml-auto shrink-0 text-zinc-600 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <ul className="scroll-thin max-h-72 space-y-px overflow-y-auto border-t border-white/[0.06] p-1.5">
              {items.map((a) => (
                <ProcessItem key={a.id} activity={a} />
              ))}
              {items.length === 0 && <li className="mono-label px-3 py-2 text-zinc-600">waiting…</li>}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ProcessItem({ activity: a }: { activity: ToolActivity }) {
  const [detail, setDetail] = useState(false)
  const isSub = a.depth > 0
  const b = brief(a.input)
  return (
    <li className={isSub ? 'ml-4 border-l border-[#3d7fff]/25 pl-2' : ''}>
      <button
        type="button"
        onClick={() => setDetail((v) => !v)}
        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left transition-colors hover:bg-white/[0.03]"
      >
        {a.status === 'running' ? (
          <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[#3d7fff]" />
        ) : a.status === 'error' ? (
          <X size={10} className="shrink-0 text-red-400" />
        ) : (
          <Check size={10} className="shrink-0 text-emerald-500/80" />
        )}
        <span className={`shrink-0 font-mono text-[11px] ${isSub ? 'text-[#5c93ff]/80' : 'text-zinc-300'}`}>
          {a.toolName}
        </span>
        {isSub && <span className="mono-label shrink-0 rounded-sm border border-[#3d7fff]/40 px-1 py-px text-[8px] text-[#5c93ff]">sub</span>}
        {b && <span className="min-w-0 truncate font-mono text-[10px] text-zinc-600">{b}</span>}
        {a.summary && (
          <span className="ml-auto min-w-0 max-w-[45%] truncate text-right text-[10px] text-zinc-600" title={a.summary}>
            {a.summary}
          </span>
        )}
      </button>
      {detail && (
        <div className="mx-2 mb-1.5 space-y-1.5 rounded-sm border border-white/[0.06] bg-black/50 p-2.5">
          <div>
            <p className="mono-label mb-1 text-zinc-600">input</p>
            <pre className="scroll-thin max-h-32 overflow-auto font-mono text-[10px] leading-relaxed text-zinc-400">
              {JSON.stringify(a.input, null, 2)}
            </pre>
          </div>
          {a.summary && (
            <div>
              <p className="mono-label mb-1 text-zinc-600">result</p>
              <p className="whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-zinc-500">{a.summary}</p>
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
  frames: { id: string; dataUrl: string; timeSec: number; width: number; height: number }[]
  liveActivities?: ToolActivity[]
  running: boolean
}) {
  const isUser = message.role === 'user'
  useLazyFrames(message.frameIds, isUser)
  const frameObjs = (message.frameIds ?? [])
    .map((id) => frames.find((f) => f.id === id))
    .filter(Boolean) as { id: string; dataUrl: string; timeSec: number; width: number; height: number }[]

  if (isUser) {
    return (
      <div className="fade-in flex justify-end">
        <div className="max-w-[85%] rounded-md rounded-br-none bg-[#3d7fff] px-4 py-2.5 text-sm font-medium text-black">
          <span className="whitespace-pre-wrap">{message.content}</span>
        </div>
      </div>
    )
  }

  const trace = liveActivities ?? message.activities ?? []

  return (
    <div className="fade-in flex flex-col gap-2.5">
      {trace.length > 0 && <ProcessBlock activities={trace} live={Boolean(liveActivities) && running} />}

      <div className="max-w-full rounded-md rounded-bl-none border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-sm text-zinc-200">
        {message.content ? (
          <Markdown content={message.content} streaming={message.pending && running} />
        ) : (
          message.pending && (
            <span className="mono-label flex items-center gap-2 text-zinc-600">
              thinking
              <span className="caret" />
            </span>
          )
        )}
        {message.error && <span className="ml-2 text-xs text-red-400">（出错）</span>}
      </div>

      {frameObjs.length > 0 && (
        <div className="scroll-thin flex gap-2 overflow-x-auto pb-1">
          {frameObjs.map((f) => (
            <figure key={f.id} className="shrink-0 overflow-hidden rounded-md border border-white/[0.08] transition-colors hover:border-[#3d7fff]/60">
              <img src={f.dataUrl} alt={`frame @ ${formatTime(f.timeSec)}`} className="h-20 w-auto" loading="lazy" />
              <figcaption className="bg-black/60 px-1.5 py-0.5 text-center font-mono text-[10px] text-[#5c93ff]">
                {formatTime(f.timeSec)}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  )
}