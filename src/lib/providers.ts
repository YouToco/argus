import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogle } from '@ai-sdk/google'
import { generateText } from 'ai'
import type { LanguageModel } from 'ai'
import type { ProviderConfig } from '../types'

/**
 * Transport kind selects which official AI SDK function drives the provider.
 * - 'openai'      → @ai-sdk/openai (covers OpenAI + every OpenAI-compatible
 *                   endpoint — OpenRouter/DeepSeek/Kimi/智谱/Groq/Mistral/…).
 *                   The actual vendor is distinguished by `baseURL`.
 * - 'anthropic'   → @ai-sdk/anthropic (Claude Messages API)
 * - 'google'      → @ai-sdk/google (Gemini)
 */
export type TransportKind = 'openai' | 'anthropic' | 'google'

export interface ProviderPreset {
  id: string
  name: string
  transport: TransportKind
  defaultModel: string
  /** '' means the vendor's official endpoint (use the SDK default). */
  defaultBaseURL: string
  baseURLPlaceholder: string
  models: string[]
  corsNote: string
  /** 'official' → uses a first-party branded endpoint; 'compatible' → OpenAI-compatible gateway; 'local' → localhost. */
  badge: 'official' | 'compatible' | 'local'
  needsApiKey?: boolean
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    transport: 'openai',
    defaultModel: 'gpt-4o',
    defaultBaseURL: 'https://api.openai.com/v1',
    baseURLPlaceholder: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o3-mini'],
    corsNote:
      '官方 OpenAI API 会拦截浏览器跨域调用，直接填官方 key 会报 CORS。建议改用 OpenRouter，或把 baseURL 指向支持浏览器直连的兼容网关。',
    badge: 'official',
    needsApiKey: true,
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    transport: 'anthropic',
    defaultModel: 'claude-sonnet-4-20250514',
    defaultBaseURL: '',
    baseURLPlaceholder: '留空使用官方端点',
    models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-3-5-haiku-20241022'],
    corsNote: '支持浏览器直连（已自动附加 direct-browser-access 请求头）。视觉分析用 claude-sonnet-4。',
    badge: 'official',
    needsApiKey: true,
  },
  {
    id: 'google',
    name: 'Google Gemini',
    transport: 'google',
    defaultModel: 'gemini-2.5-flash',
    defaultBaseURL: '',
    baseURLPlaceholder: '留空使用官方端点',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
    corsNote: '支持浏览器直连。视觉分析用 gemini-2.5-flash / gemini-2.5-pro。',
    badge: 'official',
    needsApiKey: true,
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    transport: 'openai',
    defaultModel: 'openai/gpt-4o',
    defaultBaseURL: 'https://openrouter.ai/api/v1',
    baseURLPlaceholder: 'https://openrouter.ai/api/v1',
    models: ['openai/gpt-4o', 'openai/gpt-4o-mini', 'anthropic/claude-sonnet-4', 'google/gemini-2.5-flash', 'deepseek/deepseek-chat'],
    corsNote: '浏览器直连友好，一个 key 访问几十家模型；视觉模型需选支持 vision 的（如 gpt-4o / claude-sonnet-4）。',
    badge: 'compatible',
    needsApiKey: true,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    transport: 'openai',
    defaultModel: 'deepseek-chat',
    defaultBaseURL: 'https://api.deepseek.com',
    baseURLPlaceholder: 'https://api.deepseek.com',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    corsNote: '浏览器直连友好。deepseek-chat 是文本模型，无视觉能力；视觉任务请换有 vision 的 provider。',
    badge: 'compatible',
    needsApiKey: true,
  },
  {
    id: 'moonshot',
    name: '月之暗面 Kimi',
    transport: 'openai',
    defaultModel: 'moonshot-v1-8k',
    defaultBaseURL: 'https://api.moonshot.cn/v1',
    baseURLPlaceholder: 'https://api.moonshot.cn/v1',
    models: ['kimi-latest', 'moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    corsNote: '浏览器直连友好。kimi-openai 有视觉能力但常用模型偏文本；视觉任务建议用支持 vision 的模型。',
    badge: 'compatible',
    needsApiKey: true,
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    transport: 'openai',
    defaultModel: 'glm-4-plus',
    defaultBaseURL: 'https://open.bigmodel.cn/api/paas/v4',
    baseURLPlaceholder: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4-plus', 'glm-4v-plus', 'glm-4-flash'],
    corsNote: '浏览器直连友好。glm-4v-plus 支持视觉。',
    badge: 'compatible',
    needsApiKey: true,
  },
  {
    id: 'qwen',
    name: '阿里百炼 Qwen',
    transport: 'openai',
    defaultModel: 'qwen-plus',
    defaultBaseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    baseURLPlaceholder: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen-vl-max', 'qwen-vl-plus', 'qwen-plus', 'qwen-max'],
    corsNote: '浏览器直连友好。visual 用 qwen-vl-max / qwen-vl-plus。',
    badge: 'compatible',
    needsApiKey: true,
  },
  {
    id: 'groq',
    name: 'Groq',
    transport: 'openai',
    defaultModel: 'llama-3.3-70b-versatile',
    defaultBaseURL: 'https://api.groq.com/openai/v1',
    baseURLPlaceholder: 'https://api.groq.com/openai/v1',
    models: ['llama-3.3-70b-versatile', 'llama-4-maverick', 'qwen/qwen3-32b'],
    corsNote: '浏览器直连友好、速度快。主要为文本模型，视觉任务请换支持 vision 的 provider。',
    badge: 'compatible',
    needsApiKey: true,
  },
  {
    id: 'mistral',
    name: 'Mistral',
    transport: 'openai',
    defaultModel: 'mistral-large-latest',
    defaultBaseURL: 'https://api.mistral.ai/v1',
    baseURLPlaceholder: 'https://api.mistral.ai/v1',
    models: ['mistral-large-latest', 'pixtral-large-latest', 'mistral-small-latest'],
    corsNote: '浏览器直连友好。pixtral 系列支持视觉。',
    badge: 'compatible',
    needsApiKey: true,
  },
  {
    id: 'xai',
    name: 'xAI Grok',
    transport: 'openai',
    defaultModel: 'grok-3',
    defaultBaseURL: 'https://api.x.ai/v1',
    baseURLPlaceholder: 'https://api.x.ai/v1',
    models: ['grok-3', 'grok-3-mini', 'grok-2'],
    corsNote: '浏览器直连友好。grok 系列偏文本，视觉任务请换支持 vision 的 provider。',
    badge: 'compatible',
    needsApiKey: true,
  },
  {
    id: 'together',
    name: 'Together AI',
    transport: 'openai',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    defaultBaseURL: 'https://api.together.xyz/v1',
    baseURLPlaceholder: 'https://api.together.xyz/v1',
    models: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'Qwen/Qwen2.5-VL-72B-Instruct'],
    corsNote: '浏览器直连友好。Qwen2.5-VL 支持视觉。',
    badge: 'compatible',
    needsApiKey: true,
  },
  {
    id: 'siliconflow',
    name: '硅基流动 SiliconFlow',
    transport: 'openai',
    defaultModel: 'deepseek-ai/DeepSeek-V3',
    defaultBaseURL: 'https://api.siliconflow.cn/v1',
    baseURLPlaceholder: 'https://api.siliconflow.cn/v1',
    models: ['deepseek-ai/DeepSeek-V3', 'Qwen/Qwen2.5-VL-72B-Instruct', 'Qwen/Qwen2.5-72B-Instruct'],
    corsNote: '浏览器直连友好；国内节点速度好。Qwen2.5-VL 支持视觉。',
    badge: 'compatible',
    needsApiKey: true,
  },
  {
    id: 'volcengine',
    name: '火山方舟 Ark',
    transport: 'openai',
    defaultModel: 'doubao-seed-1-6-250615',
    defaultBaseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    baseURLPlaceholder: 'https://ark.cn-beijing.volces.com/api/v3',
    models: ['doubao-seed-1-6-250615', 'doubao-seed-1-6-vision-250815', 'deepseek-v3-250324'],
    corsNote: '浏览器直连友好。doubao-seed-1-6-vision 支持视觉。',
    badge: 'compatible',
    needsApiKey: true,
  },
  {
    id: 'ollama',
    name: 'Ollama（本地）',
    transport: 'openai',
    defaultModel: 'llama3.2',
    defaultBaseURL: 'http://localhost:11434/v1',
    baseURLPlaceholder: 'http://localhost:11434/v1',
    models: ['llama3.2', 'llama3.1', 'qwen2.5-vl', 'gemma3'],
    corsNote: '完全本地、无需 key。需本机已运行 `ollama serve`；视觉模型用 qwen2.5-vl。',
    badge: 'local',
    needsApiKey: false,
  },
]

export function getPreset(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((p) => p.id === id)
}

export function buildModel(cfg: ProviderConfig): LanguageModel {
  const baseURL = cfg.baseURL.trim()
  switch (cfg.kind) {
    case 'anthropic': {
      const provider = createAnthropic({
        apiKey: cfg.apiKey,
        baseURL: baseURL || undefined,
        headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
      })
      return provider.chat(cfg.model.trim())
    }
    case 'google': {
      const provider = createGoogle({
        apiKey: cfg.apiKey,
        baseURL: baseURL || undefined,
      })
      return provider.chat(cfg.model.trim())
    }
    case 'openai':
    default: {
      const provider = createOpenAI({
        apiKey: cfg.apiKey,
        baseURL: baseURL || undefined,
      })
      return provider.chat(cfg.model.trim())
    }
  }
}

export function createDefaultConfig(preset: ProviderPreset): ProviderConfig {
  return {
    id: preset.id,
    kind: preset.transport,
    label: preset.name,
    apiKey: '',
    baseURL: preset.defaultBaseURL,
    model: preset.defaultModel,
  }
}

export interface ConnectionTestResult {
  ok: boolean
  latencyMs?: number
  error?: string
}

/** Sends a tiny completion to validate the key + endpoint + model. */
export async function testConnection(cfg: ProviderConfig): Promise<ConnectionTestResult> {
  const start = Date.now()
  try {
    const model = buildModel(cfg)
    await generateText({
      model,
      prompt: 'Reply with the single word: OK',
      temperature: 0,
    })
    return { ok: true, latencyMs: Date.now() - start }
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e)
    const isCors = /fetch|CORS|Failed to fetch|NetworkError|cross-origin/i.test(msg)
    return {
      ok: false,
      error: isCors
        ? '跨域/CORS 失败：该端点不允许浏览器直连。请检查 baseURL 或改用支持直连的 provider。'
        : msg,
    }
  }
}
