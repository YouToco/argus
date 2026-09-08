import { stepCountIs, streamText, tool as aiTool } from 'ai'
import type { FilePart, LanguageModel, ModelMessage, ToolSet } from 'ai'
import type { ToolActivity } from '../../types'
import type { AgentContext, SubagentInput, ToolResult } from './tools'
import { buildToolRegistry } from './tools'

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

export const SYSTEM_PROMPT = `你是 Argus，一个在浏览器里本地分析长视频的 agent harness。视频完全在本地处理，无后端、无音频转写。用户会给你一个视频和一条需求（例如"数一下这段监控里有几个人""找出画面里出现的红色物品"）。

你必须遵守的工作方式：
1. 开始前先调用 get_video_info 了解视频基本参数（时长、分辨率、帧率、编码等）。
2. 用 extract_frames 按【时间范围 + 间隔】抽帧概览；用 extract_frame_at 抽取某个瞬间的单帧；用 list_frames 查看已抽取的帧及其 id。
3. 抽帧会消耗上下文。长视频要分层推进：先粗扫（大间隔、较小 max_width），锁定关键时间段后，再用更小间隔、更高 max_width 对该段重新抽帧细看。当你根据已有状态信息无法确定某段时间是否满足需求时，就重新调用抽帧工具细看那段——这是被鼓励的行为。
4. 用 remember 记录你已经分析过的时间段的结论（例如"0-60s：空停车场，3 辆车，无行人"），分析新时间段前先用 recall 看是否已覆盖，避免长上下文遗忘。
5. 需要一次性细看大量帧、避免主上下文被帧图撑爆时，用 spawn_subagent 把某个时间段的详细分析交给子代理，它会返回精简结论。
6. 找特定物体/人物时，先粗帧定位，再对候选帧用 inspect_region 放大局部区域确认细节。
7. 每次抽帧后，帧会以图片形式出现在对话里，你必须直接观察这些画面，绝不能凭空猜测画面内容。
8. 最终用简洁的中文总结结论，并给出关键帧的时间戳作为证据。如果没有证据支持，要明确说"证据不足"。`

export const SUBAGENT_PROMPT = `你是 Argus 的子代理，负责分析视频中一个指定的时间段。你会自行调用抽帧工具观察画面，然后用几句精简的中文给出结论（发现什么、关键时间点、与目标的匹配程度）。不要长篇大论，也不要调用 spawn_subagent。`

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let activitySeq = 0
function nextId(): string {
  activitySeq += 1
  return `a-${activitySeq}`
}

function summarize(text: string, max = 220): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}

function dataUrlToFilePart(dataUrl: string): FilePart {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl)
  if (m) return { type: 'file', data: m[2], mediaType: m[1] }
  return { type: 'file', data: dataUrl, mediaType: 'image' }
}

/**
 * Keep only the most recent image batches in the outbound context. Frames from
 * older tool calls are replaced with a text pointer — the model can re-fetch
 * any frame via list_frames / extract_frame_at. This is what makes hour-long
 * analyses affordable: without it every step re-sends every frame ever drawn.
 */
export const KEEP_IMAGE_BATCHES = 3

function isImagePart(p: { type: string; mediaType?: string }): boolean {
  return p.type === 'file' && (p.mediaType === 'image' || Boolean(p.mediaType?.startsWith('image/')))
}

export function pruneOldImages(messages: ModelMessage[]): ModelMessage[] {
  const imgIdx: number[] = []
  messages.forEach((m, i) => {
    if (m.role === 'user' && Array.isArray(m.content) && m.content.some(isImagePart)) {
      imgIdx.push(i)
    }
  })
  if (imgIdx.length <= KEEP_IMAGE_BATCHES) return messages
  const keep = new Set(imgIdx.slice(-KEEP_IMAGE_BATCHES))
  return messages.map((m, i) => {
    if (keep.has(i) || m.role !== 'user' || !Array.isArray(m.content)) return m
    if (!m.content.some(isImagePart)) return m
    return {
      ...m,
      content: m.content.map((p) =>
        isImagePart(p)
          ? { type: 'text' as const, text: '[此前抽取的帧图已从上下文省略；可用 list_frames 查 id、extract_frame_at 重新获取]' }
          : p,
      ),
    }
  })
}

// ---------------------------------------------------------------------------
// Agent loop
//
// The loop itself is driven by the AI SDK: one `streamText` call runs up to
// `maxSteps` steps, executes tools (whose execute wrappers report activities
// and collect produced frames), and keeps going until the model answers with
// plain text. Two pieces remain ours because they are the product's core:
//   - prepareStep injects freshly extracted frames as a user message so any
//     vision model can see them (images in tool results are not portable
//     across OpenAI-compatible gateways), and
//   - pruneOldImages keeps the outbound context bounded on long runs.
// ---------------------------------------------------------------------------

export interface RunAgentOptions {
  model: LanguageModel
  system: string
  messages: ModelMessage[]
  context: AgentContext
  maxSteps?: number
  onTextDelta?: (delta: string) => void
  onActivity?: (a: ToolActivity) => void
  signal?: AbortSignal
  depth?: number
}

/** Runs the agent. Returns the final step's text (the answer). */
export async function runAgent(opts: RunAgentOptions): Promise<string> {
  const {
    model,
    system,
    context: baseContext,
    maxSteps = 24,
    signal,
    depth = 0,
    onTextDelta,
    onActivity,
  } = opts

  // frames produced by tool executions, handed to the model before the next step
  let pendingImages: { dataUrl: string; label: string }[] = []

  const context: AgentContext = {
    ...baseContext,
    runSubagent: (input: SubagentInput) =>
      runSubagent(input, baseContext, model, signal, depth + 1, onActivity),
  }

  // sub-agents cannot spawn further sub-agents
  const registry = buildToolRegistry().filter((t) => depth === 0 || t.name !== 'spawn_subagent')

  const tools: Record<string, unknown> = {}
  for (const t of registry) {
    tools[t.name] = aiTool({
      description: t.description,
      inputSchema: t.inputSchema,
      execute: async (input: unknown) => {
        const actId = nextId()
        onActivity?.({ id: actId, toolName: t.name, input, status: 'running', depth })
        let out: ToolResult
        try {
          out = await t.execute(input, context)
          onActivity?.({ id: actId, toolName: t.name, input, status: 'done', summary: summarize(out.text), depth })
        } catch (e) {
          out = { text: `工具执行失败：${(e as Error)?.message ?? String(e)}` }
          onActivity?.({ id: actId, toolName: t.name, input, status: 'error', summary: out.text, depth })
        }
        if (out.images) pendingImages.push(...out.images)
        return out.text
      },
    })
  }

  const result = streamText({
    model,
    system,
    messages: opts.messages,
    tools: tools as ToolSet,
    stopWhen: stepCountIs(maxSteps),
    abortSignal: signal,
    prepareStep: ({ messages }) => {
      let msgs = messages
      if (pendingImages.length > 0) {
        msgs = [
          ...messages,
          {
            role: 'user' as const,
            content: [
              {
                type: 'text' as const,
                text: `以下是你刚才通过抽帧/放大得到的 ${pendingImages.length} 张画面，请仔细观察后继续分析：`,
              },
              ...pendingImages.map((img) => dataUrlToFilePart(img.dataUrl)),
            ],
          },
        ]
        pendingImages = []
      }
      return { messages: pruneOldImages(msgs) }
    },
  })

  for await (const delta of result.textStream) {
    onTextDelta?.(delta)
  }

  // the answer is the last step's text — intermediate steps may hold reasoning
  // while tools were still being called
  const steps = await result.steps
  return steps.at(-1)?.text ?? ''
}

// ---------------------------------------------------------------------------
// Sub-agent
// ---------------------------------------------------------------------------

async function runSubagent(
  input: SubagentInput,
  baseContext: AgentContext,
  model: LanguageModel,
  signal: AbortSignal | undefined,
  depth: number,
  onActivity?: (a: ToolActivity) => void,
): Promise<string> {
  const [s, e] = input.time_range
  const result = await runAgent({
    model,
    system: SUBAGENT_PROMPT,
    messages: [
      {
        role: 'user',
        content: `请分析视频 ${s.toFixed(2)}s ~ ${e.toFixed(2)}s 时间段。目标：${input.goal}`,
      },
    ],
    context: { ...baseContext },
    maxSteps: input.max_steps ?? 8,
    signal,
    depth,
    onActivity,
  })
  return result.trim() || '(子代理未产出结论)'
}