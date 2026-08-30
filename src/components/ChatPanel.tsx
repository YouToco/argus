import { useEffect, useRef, useState } from 'react'
import { useAppStore, getActiveProvider } from '../store'
import { buildModel } from '../lib/providers'
import { SYSTEM_PROMPT, runAgent } from '../lib/agent/harness'
import { memory } from '../lib/agent/memory'
import type { AgentContext } from '../lib/agent/tools'
import type { ChatMessage } from '../types'
import { formatTime } from '../lib/format'

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
  const setRunning = useAppStore((s) => s.setRunning)

  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, activities])

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
        toolCalls: newActs
          .filter((a) => a.depth === 0)
          .map((a) => ({
            toolName: a.toolName,
            input: a.input,
            summary: a.summary,
            error: a.status === 'error',
          })),
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
      <div ref={scrollRef} className="scroll-thin flex-1 space-y-4 overflow-y-auto px-1 py-2">
        {messages.length === 0 && <EmptyState />}
        {messages.map((m) => (
          <Message
            key={m.id}
            message={m}
            frames={frames}
            onAbort={stop}
            running={running}
          />
        ))}
      </div>

      <div className="border-t border-zinc-800/70 bg-zinc-950/50 p-3">
        {running && (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-zinc-900/60 px-3 py-1.5 text-xs text-zinc-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
            {lastActivity ? (
              <span className="font-mono">
                正在调用 {lastActivity.toolName}
                {lastActivity.depth > 0 ? `（子代理）` : ''}
              </span>
            ) : (
              <span>思考中…</span>
            )}
            <button onClick={stop} className="ml-auto rounded-md bg-zinc-800 px-2 py-0.5 text-xs hover:bg-zinc-700">
              停止
            </button>
          </div>
        )}
        {error && <p className="mb-2 rounded-md bg-red-500/10 px-3 py-1.5 text-xs text-red-400">{error}</p>}
        <div className="flex items-end gap-2">
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
            className="scroll-thin flex-1 resize-none rounded-xl border border-zinc-700/80 bg-zinc-900 px-3.5 py-2.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-amber-500/70 focus:ring-2 focus:ring-amber-500/10"
          />
          <button
            onClick={running ? stop : send}
            disabled={!running && !input.trim()}
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
              running
                ? 'bg-red-500/15 text-red-300 hover:bg-red-500/25'
                : 'bg-gradient-to-b from-amber-400 to-amber-600 text-zinc-950 shadow-sm hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:saturate-50'
            }`}
          >
            {running ? '停止' : '发送'}
          </button>
        </div>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 py-16 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500/25 to-orange-600/10 text-3xl shadow-inner ring-1 ring-amber-500/20">
        👁️
      </span>
      <div>
        <p className="text-sm font-semibold text-zinc-300">Argus · 百眼守望</p>
        <p className="mt-0.5 text-xs text-zinc-500">长视频理解 Agent Harness</p>
      </div>
      <p className="max-w-sm text-xs leading-relaxed text-zinc-600">
        加载视频后，用一句话描述需求。agent 会自动了解视频信息、按需抽帧观察、记录状态，必要时派子代理细看长片段、放大确认细节。
      </p>
    </div>
  )
}

function Message({
  message,
  frames,
  onAbort,
  running,
}: {
  message: ChatMessage
  frames: { id: string; dataUrl: string; timeSec: number; width: number; height: number }[]
  onAbort: () => void
  running: boolean
}) {
  const isUser = message.role === 'user'
  const frameObjs = (message.frameIds ?? [])
    .map((id) => frames.find((f) => f.id === id))
    .filter(Boolean) as { id: string; dataUrl: string; timeSec: number; width: number; height: number }[]

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-amber-500/15 px-4 py-2 text-sm text-amber-50">
          <span className="whitespace-pre-wrap">{message.content}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="max-w-full rounded-2xl rounded-bl-sm border border-zinc-800 bg-zinc-900/60 px-4 py-2.5 text-sm text-zinc-200">
        {message.content ? (
          <span className="whitespace-pre-wrap">{message.content}</span>
        ) : (
          message.pending && <span className="text-zinc-500">思考中…</span>
        )}
        {message.pending && running && <span className="ml-1 inline-block h-3 w-1 animate-pulse bg-amber-400" />}
        {message.error && <span className="ml-2 text-xs text-red-400">（出错）</span>}
      </div>

      {message.toolCalls && message.toolCalls.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {message.toolCalls.map((tc, i) => (
            <button
              key={i}
              title={JSON.stringify(tc.input)}
              className={`max-w-[220px] truncate rounded-md px-2 py-1 text-left font-mono text-[11px] ${
                tc.error ? 'bg-red-500/10 text-red-400' : 'bg-zinc-800 text-zinc-400'
              }`}
            >
              {tc.toolName}
            </button>
          ))}
        </div>
      )}

      {frameObjs.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {frameObjs.map((f) => (
            <figure key={f.id} className="shrink-0 overflow-hidden rounded-md border border-zinc-800">
              <img src={f.dataUrl} alt={`frame @ ${formatTime(f.timeSec)}`} className="h-20 w-auto" loading="lazy" />
              <figcaption className="px-1 py-0.5 text-center font-mono text-[10px] text-zinc-500">
                {formatTime(f.timeSec)}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  )
}
