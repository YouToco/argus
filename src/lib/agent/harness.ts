import {
  jsonSchema,
  stepCountIs,
  streamText,
  tool as aiTool,
} from 'ai'
import type { ImagePart, JSONSchema7, LanguageModel, ModelMessage, TextPart, ToolCallPart, ToolResultPart, ToolSet } from 'ai'
import type { ToolActivity } from '../../types'
import type { AgentContext, ArgusTool, SubagentInput, ToolResult } from './tools'
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

function dataUrlToImagePart(dataUrl: string): ImagePart {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl)
  if (m) return { type: 'image', image: m[2], mediaType: m[1] }
  return { type: 'image', image: dataUrl }
}

function buildAiTools(registry: ArgusTool[]): ToolSet {
  const set: Record<string, unknown> = {}
  for (const t of registry) {
    set[t.name] = aiTool({
      description: t.description,
      inputSchema: jsonSchema(t.parameters as JSONSchema7),
    })
  }
  return set as ToolSet
}

// ---------------------------------------------------------------------------
// Agent loop
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

/** Runs the manual tool loop. Returns the final assistant text. */
export async function runAgent(opts: RunAgentOptions): Promise<string> {
  const {
    model,
    system,
    context: baseContext,
    maxSteps = 24,
    signal,
    depth = 0,
  } = opts
  const messages: ModelMessage[] = [...opts.messages]
  const registry = buildToolRegistry()
  const aiTools = buildAiTools(registry)

  // context for this run: sub-agents spawn from here run one level deeper
  const context: AgentContext = {
    ...baseContext,
    runSubagent: (input: SubagentInput) =>
      runSubagent(input, baseContext, model, signal, depth + 1),
  }

  let finalText = ''

  for (let step = 0; step < maxSteps; step++) {
    const result = streamText({
      model,
      system,
      messages,
      tools: aiTools,
      stopWhen: stepCountIs(1),
      abortSignal: signal,
    })

    let text = ''
    for await (const delta of result.textStream) {
      text += delta
      opts.onTextDelta?.(delta)
    }
    finalText = text

    const toolCalls = await result.toolCalls
    if (toolCalls.length === 0) break

    // assistant message carrying the tool calls
    const assistantContent: Array<TextPart | ToolCallPart> = []
    if (text.trim()) assistantContent.push({ type: 'text', text })
    for (const tc of toolCalls) {
      assistantContent.push({
        type: 'tool-call',
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        input: tc.input,
      })
    }
    messages.push({ role: 'assistant', content: assistantContent })

    // execute tools ourselves
    const toolResultParts: ToolResultPart[] = []
    const images: { dataUrl: string; label: string }[] = []

    for (const tc of toolCalls) {
      const def = registry.find((t) => t.name === tc.toolName)
      const actId = nextId()
      opts.onActivity?.({ id: actId, toolName: tc.toolName, input: tc.input, status: 'running', depth })

      let out: ToolResult
      if (!def) {
        out = { text: `未知工具：${tc.toolName}` }
        opts.onActivity?.({ id: actId, toolName: tc.toolName, input: tc.input, status: 'error', summary: out.text, depth })
      } else {
        try {
          out = await def.execute(tc.input, context)
          opts.onActivity?.({ id: actId, toolName: tc.toolName, input: tc.input, status: 'done', summary: summarize(out.text), depth })
        } catch (e) {
          out = { text: `工具执行失败：${(e as Error)?.message ?? String(e)}` }
          opts.onActivity?.({ id: actId, toolName: tc.toolName, input: tc.input, status: 'error', summary: out.text, depth })
        }
      }

      toolResultParts.push({
        type: 'tool-result',
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        output: { type: 'text', value: out.text },
      })
      if (out.images) images.push(...out.images)
    }

    messages.push({ role: 'tool', content: toolResultParts })

    // inject freshly produced frames as a user message so the model sees them
    if (images.length > 0) {
      const parts: Array<TextPart | ImagePart> = [
        {
          type: 'text',
          text: `以下是你刚才通过抽帧/放大得到的 ${images.length} 张画面，请仔细观察后继续分析：`,
        },
        ...images.map((img) => dataUrlToImagePart(img.dataUrl)),
      ]
      messages.push({ role: 'user', content: parts })
    }
  }

  return finalText
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
): Promise<string> {
  const [s, e] = input.time_range
  const registry = buildToolRegistry().filter((t) => t.name !== 'spawn_subagent')
  const context: AgentContext = { ...baseContext }
  const result = await runAgent({
    model,
    system: SUBAGENT_PROMPT,
    messages: [
      {
        role: 'user',
        content: `请分析视频 ${s.toFixed(2)}s ~ ${e.toFixed(2)}s 时间段。目标：${input.goal}`,
      },
    ],
    context,
    maxSteps: input.max_steps ?? 8,
    signal,
    depth,
  })
  return result.trim() || '(子代理未产出结论)'
}
