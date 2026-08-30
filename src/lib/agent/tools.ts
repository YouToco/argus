import type { JSONSchema7 } from 'ai'
import type { ExtractedFrame } from '../../types'
import { cropRegion } from '../video/inspect'
import type { VideoSession } from '../video/session'
import type { MemoryStore } from './memory'

export interface SubagentInput {
  time_range: [number, number]
  goal: string
  max_frames?: number
  max_steps?: number
}

/**
 * Everything a tool needs at runtime. The harness wires this up; tools stay
 * pure functions of (input, context).
 */
export interface AgentContext {
  session: VideoSession | null
  addFrames: (frames: ExtractedFrame[]) => void
  listFrames: () => ExtractedFrame[]
  getFrameById: (id: string) => ExtractedFrame | undefined
  memory: MemoryStore
  runSubagent: (input: SubagentInput) => Promise<string>
}

export interface ToolResult {
  text: string
  /** images produced by the tool — injected into the next model turn */
  images?: { dataUrl: string; label: string }[]
}

export interface ArgusTool {
  name: string
  description: string
  parameters: JSONSchema7
  execute: (input: any, ctx: AgentContext) => Promise<ToolResult>
}

function fmt(t: number): string {
  return `${t.toFixed(2)}s`
}

export function buildToolRegistry(): ArgusTool[] {
  const tools: ArgusTool[] = [
    {
      name: 'get_video_info',
      description:
        '获取当前已加载视频的详细信息：容器格式、编码、文件大小、时长、分辨率（每帧像素）、帧率、码率、是否含音频。开始分析前应先调用一次。',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      execute: async (_input, ctx) => {
        if (!ctx.session) return { text: '尚未加载视频文件。请先让用户在左侧选择视频。' }
        const info = await ctx.session.getInfo()
        return { text: JSON.stringify(info, null, 2) }
      },
    },
    {
      name: 'extract_frames',
      description:
        '按时间范围与间隔批量抽取视频帧，返回每帧的图片与时间戳。参数：start_seconds/end_seconds（秒）、interval_seconds（抽帧间隔，越小越密）、max_width（输出最大宽度像素，控制精度与 token 消耗，默认 640，细看时可调大）、max_frames（上限，超出时均匀采样）、quality（JPEG 质量 0~1，默认 0.7）。抽出的帧会以图片形式返回给你观察。',
      parameters: {
        type: 'object',
        properties: {
          start_seconds: { type: 'number', description: '起始时间（秒）' },
          end_seconds: { type: 'number', description: '结束时间（秒）' },
          interval_seconds: { type: 'number', description: '抽帧间隔（秒）' },
          max_width: { type: 'number', description: '输出帧最大宽度像素，默认 640' },
          max_frames: { type: 'number', description: '最多抽取帧数，超限时均匀采样' },
          quality: { type: 'number', description: 'JPEG 质量 0~1，默认 0.7' },
        },
        required: ['start_seconds', 'end_seconds', 'interval_seconds'],
        additionalProperties: false,
      },
      execute: async (input, ctx) => {
        if (!ctx.session) return { text: '尚未加载视频文件。' }
        const frames = await ctx.session.extractFrames({
          start: input.start_seconds,
          end: input.end_seconds,
          interval: input.interval_seconds,
          maxWidth: input.max_width,
          maxFrames: input.max_frames,
          quality: input.quality,
        })
        ctx.addFrames(frames.map((f) => ({ ...f, source: 'extract_frames' })))
        const list = frames
          .map((f) => `- [${f.id}] ${fmt(f.timeSec)} (${f.width}×${f.height})`)
          .join('\n')
        return {
          text: `已抽取 ${frames.length} 帧：\n${list}`,
          images: frames.map((f) => ({ dataUrl: f.dataUrl, label: fmt(f.timeSec) })),
        }
      },
    },
    {
      name: 'extract_frame_at',
      description: '抽取指定时间点的一帧（默认较高精度）。用于确认某个具体瞬间的画面。',
      parameters: {
        type: 'object',
        properties: {
          time_seconds: { type: 'number', description: '时间点（秒）' },
          max_width: { type: 'number', description: '输出最大宽度像素，默认 1280' },
        },
        required: ['time_seconds'],
        additionalProperties: false,
      },
      execute: async (input, ctx) => {
        if (!ctx.session) return { text: '尚未加载视频文件。' }
        const f = await ctx.session.extractFrameAt(input.time_seconds, input.max_width ?? 1280)
        ctx.addFrames([{ ...f, source: 'extract_frame_at' }])
        return {
          text: `已抽取 ${fmt(f.timeSec)} 的一帧（${f.width}×${f.height}）。`,
          images: [{ dataUrl: f.dataUrl, label: fmt(f.timeSec) }],
        }
      },
    },
    {
      name: 'list_frames',
      description:
        '列出当前会话中已经抽取的所有帧（id 与时间戳）。需要再次观察或放大某帧前先用它拿到 frame_id。',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      execute: async (_input, ctx) => {
        const frames = ctx.listFrames()
        if (frames.length === 0) return { text: '当前还没有已抽取的帧。' }
        const list = frames
          .map((f) => `- [${f.id}] ${fmt(f.timeSec)} (${f.width}×${f.height})`)
          .join('\n')
        return { text: `已抽取 ${frames.length} 帧：\n${list}` }
      },
    },
    {
      name: 'inspect_region',
      description:
        '放大查看某帧的局部区域（用于确认远处的物体/人物/特征）。frame_id 来自 list_frames；x/y/width/height 为归一化坐标（0~1，相对帧宽高）；scale 为放大倍数。',
      parameters: {
        type: 'object',
        properties: {
          frame_id: { type: 'string', description: '帧 id' },
          x: { type: 'number', description: '区域左上角 x（0~1）' },
          y: { type: 'number', description: '区域左上角 y（0~1）' },
          width: { type: 'number', description: '区域宽度（0~1）' },
          height: { type: 'number', description: '区域高度（0~1）' },
          scale: { type: 'number', description: '放大倍数，默认 2' },
        },
        required: ['frame_id', 'x', 'y', 'width', 'height'],
        additionalProperties: false,
      },
      execute: async (input, ctx) => {
        const frame = ctx.getFrameById(input.frame_id)
        if (!frame) {
          return { text: `找不到帧 "${input.frame_id}"，请先用 list_frames 查看已抽取的帧。` }
        }
        const res = await cropRegion(
          frame.dataUrl,
          { x: input.x, y: input.y, width: input.width, height: input.height },
          input.scale ?? 2,
        )
        return {
          text: `已放大帧 ${input.frame_id}（${fmt(frame.timeSec)}）的局部区域到 ${res.width}×${res.height}：`,
          images: [{ dataUrl: res.dataUrl, label: `${fmt(frame.timeSec)} 局部放大` }],
        }
      },
    },
    {
      name: 'remember',
      description:
        '记录/更新某时间段画面内容的观察结论，避免长视频分析时遗忘（状态工具）。同一 (topic, 时间段) 会覆盖更新。',
      parameters: {
        type: 'object',
        properties: {
          start_seconds: { type: 'number' },
          end_seconds: { type: 'number' },
          topic: { type: 'string', description: '主题，如"人数"、"车辆"、"异常事件"' },
          notes: { type: 'string', description: '该时间段观察到的结论' },
        },
        required: ['start_seconds', 'end_seconds', 'topic', 'notes'],
        additionalProperties: false,
      },
      execute: async (input, ctx) => {
        ctx.memory.remember(input.start_seconds, input.end_seconds, input.topic, input.notes)
        return {
          text: `已记录 [${fmt(input.start_seconds)}-${fmt(input.end_seconds)}] ${input.topic}。`,
        }
      },
    },
    {
      name: 'recall',
      description: '回读之前 remember 记录的状态信息。可按 topic（关键词）、time_range（[start,end] 秒）、query（关键词）过滤。',
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string' },
          time_range: {
            type: 'array',
            items: { type: 'number' },
            minItems: 2,
            maxItems: 2,
            description: '[起始秒, 结束秒]',
          },
          query: { type: 'string', description: '在记录内容里搜索的关键词' },
        },
        additionalProperties: false,
      },
      execute: async (input, ctx) => {
        const entries = ctx.memory.recall({
          topic: input.topic,
          timeRange: input.time_range,
          query: input.query,
        })
        if (entries.length === 0) return { text: '没有匹配的记录。' }
        const text = entries
          .map((e) => `- [${fmt(e.startSec)}-${fmt(e.endSec)}] ${e.topic}: ${e.notes}`)
          .join('\n')
        return { text }
      },
    },
    {
      name: 'spawn_subagent',
      description:
        '把某个时间段的详细分析交给子代理独立完成（子代理会自行抽帧、观察并返回精简结论），避免主上下文被大量帧图撑爆。适用于超长视频或需要细看多个片段时。',
      parameters: {
        type: 'object',
        properties: {
          time_range: {
            type: 'array',
            items: { type: 'number' },
            minItems: 2,
            maxItems: 2,
            description: '[起始秒, 结束秒]',
          },
          goal: { type: 'string', description: '该子代理要达成的分析目标' },
          max_frames: { type: 'number', description: '子代理最多抽帧数，默认 12' },
          max_steps: { type: 'number', description: '子代理最大步数，默认 8' },
        },
        required: ['time_range', 'goal'],
        additionalProperties: false,
      },
      execute: async (input, ctx) => {
        const result = await ctx.runSubagent(input)
        return { text: `子代理分析结论：\n${result}` }
      },
    },
  ]
  return tools
}
