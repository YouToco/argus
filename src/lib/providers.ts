import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogle } from '@ai-sdk/google'
import { generateText } from 'ai'
import type { LanguageModel } from 'ai'
import type { ProviderConfig, ProviderKind } from '../types'
import type { I18nKey } from './i18n'

/**
 * Transport kind selects which official AI SDK function drives a provider.
 * - 'openai'    → @ai-sdk/openai (OpenAI + almost every OpenAI-compatible gateway)
 * - 'anthropic' → @ai-sdk/anthropic (Claude Messages API)
 * - 'google'    → @ai-sdk/google (Gemini)
 *
 * The vendor is distinguished by `baseURL`, not by the transport.
 */
export type TransportKind = ProviderKind

export interface ProviderPreset {
  id: string
  name: string
  transport: TransportKind
  defaultModel: string
  /** '' = the vendor's official endpoint (use SDK default). */
  defaultBaseURL: string
  baseURLPlaceholder: string
  /** English override for baseURLPlaceholder (falls back to baseURLPlaceholder). */
  baseURLPlaceholderEn?: string
  /** model ids available to pick (for the datalist). */
  models: string[]
  /** subset of models that support vision / attachment. */
  visionModels?: string[]
  corsNote: string
  /** English override for corsNote (falls back to corsNote). */
  corsNoteEn?: string
  badge: 'official' | 'compatible' | 'local' | 'catalog'
  needsApiKey: boolean
  source: 'builtin' | 'catalog'
}

/** Curated, browser-friendly presets (guaranteed-good defaults + CORS notes). */
export const BUILTIN_PRESETS: ProviderPreset[] = [
  {
    id: 'openai', name: 'OpenAI', transport: 'openai',
    defaultModel: 'gpt-4o', defaultBaseURL: 'https://api.openai.com/v1', baseURLPlaceholder: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini'],
    visionModels: ['gpt-4o', 'gpt-4.1'],
    corsNote: '官方 OpenAI API 会拦截浏览器跨域，直接填官方 key 会报 CORS。建议改用 OpenRouter，或把 baseURL 指向支持浏览器直连的兼容网关。',
    corsNoteEn: 'The official OpenAI API blocks browser cross-origin requests, so an official key will hit CORS errors. Consider OpenRouter instead, or point baseURL to a compatible gateway that allows direct browser access.',
    badge: 'official', needsApiKey: true, source: 'builtin',
  },
  {
    id: 'anthropic', name: 'Anthropic Claude', transport: 'anthropic',
    defaultModel: 'claude-sonnet-4-20250514', defaultBaseURL: '', baseURLPlaceholder: '留空使用官方端点',
    baseURLPlaceholderEn: 'Leave empty for the official endpoint',
    models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-3-5-haiku-20241022'],
    visionModels: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-3-5-haiku-20241022'],
    corsNote: '支持浏览器直连（已自动附加 direct-browser-access 请求头）。视觉分析用 claude-sonnet-4。',
    corsNoteEn: 'Supports direct browser access (the direct-browser-access header is attached automatically). Use claude-sonnet-4 for vision analysis.',
    badge: 'official', needsApiKey: true, source: 'builtin',
  },
  {
    id: 'google', name: 'Google Gemini', transport: 'google',
    defaultModel: 'gemini-2.5-flash', defaultBaseURL: '', baseURLPlaceholder: '留空使用官方端点',
    baseURLPlaceholderEn: 'Leave empty for the official endpoint',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
    visionModels: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
    corsNote: '支持浏览器直连。视觉分析用 gemini-2.5-flash / gemini-2.5-pro。',
    corsNoteEn: 'Supports direct browser access. Use gemini-2.5-flash / gemini-2.5-pro for vision analysis.',
    badge: 'official', needsApiKey: true, source: 'builtin',
  },
  {
    id: 'openrouter', name: 'OpenRouter', transport: 'openai-compatible',
    defaultModel: 'openai/gpt-4o', defaultBaseURL: 'https://openrouter.ai/api/v1', baseURLPlaceholder: 'https://openrouter.ai/api/v1',
    models: ['openai/gpt-4o', 'openai/gpt-4o-mini', 'anthropic/claude-sonnet-4', 'google/gemini-2.5-flash', 'deepseek/deepseek-chat'],
    visionModels: ['openai/gpt-4o', 'anthropic/claude-sonnet-4', 'google/gemini-2.5-flash'],
    corsNote: '浏览器直连友好，一个 key 访问几十家模型；视觉模型需选支持 vision 的。',
    corsNoteEn: 'Browser-friendly. One key accesses dozens of models; pick a vision-capable model for vision tasks.',
    badge: 'compatible', needsApiKey: true, source: 'builtin',
  },
  {
    id: 'deepseek', name: 'DeepSeek', transport: 'openai-compatible',
    defaultModel: 'deepseek-v4-flash-vision-exp', defaultBaseURL: 'https://api.deepseek.com', baseURLPlaceholder: 'https://api.deepseek.com',
    models: ['deepseek-v4-flash-vision-exp', 'deepseek-v4-flash', 'deepseek-v4-pro'],
    visionModels: ['deepseek-v4-flash-vision-exp'],
    corsNote: '浏览器直连友好。视觉理解选 deepseek-v4-flash-vision-exp（2026-08 实验版，支持图片输入，带推理输出）；deepseek-v4-flash / v4-pro 为纯文本。',
    corsNoteEn: 'Browser-friendly. For vision, choose deepseek-v4-flash-vision-exp (2026-08 experimental, image input with reasoning output); deepseek-v4-flash / v4-pro are text-only.',
    badge: 'compatible', needsApiKey: true, source: 'builtin',
  },
  {
    id: 'moonshot', name: '月之暗面 Kimi', transport: 'openai-compatible',
    defaultModel: 'moonshot-v1-8k', defaultBaseURL: 'https://api.moonshot.cn/v1', baseURLPlaceholder: 'https://api.moonshot.cn/v1',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k', 'kimi-latest'],
    corsNote: '浏览器直连友好。kimi-latest / 视觉模型适合后续；当前模型偏文本。',
    corsNoteEn: 'Browser-friendly. kimi-latest / vision models are better suited; current models lean text-only.',
    badge: 'compatible', needsApiKey: true, source: 'builtin',
  },
  {
    id: 'zhipu', name: '智谱 GLM', transport: 'openai-compatible',
    defaultModel: 'glm-4-v-plus', defaultBaseURL: 'https://open.bigmodel.cn/api/paas/v4', baseURLPlaceholder: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4-v-plus', 'glm-4-plus', 'glm-4-flash'],
    visionModels: ['glm-4-v-plus'],
    corsNote: '浏览器直连友好。glm-4-v-plus 支持视觉。',
    corsNoteEn: 'Browser-friendly. glm-4-v-plus supports vision.',
    badge: 'compatible', needsApiKey: true, source: 'builtin',
  },
  {
    id: 'qwen', name: '阿里百炼 Qwen', transport: 'openai-compatible',
    defaultModel: 'qwen-vl-max', defaultBaseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', baseURLPlaceholder: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen-vl-max', 'qwen-vl-plus', 'qwen-plus', 'qwen-max'],
    visionModels: ['qwen-vl-max', 'qwen-vl-plus'],
    corsNote: '浏览器直连友好。视觉用 qwen-vl-max / qwen-vl-plus。',
    corsNoteEn: 'Browser-friendly. Use qwen-vl-max / qwen-vl-plus for vision.',
    badge: 'compatible', needsApiKey: true, source: 'builtin',
  },
  {
    id: 'ollama', name: 'Ollama（本地）', transport: 'openai-compatible',
    defaultModel: 'qwen2.5-vl', defaultBaseURL: 'http://localhost:11434/v1', baseURLPlaceholder: 'http://localhost:11434/v1',
    models: ['qwen2.5-vl', 'llama3.2', 'llama3.1', 'gemma3'],
    visionModels: ['qwen2.5-vl'],
    corsNote: '完全本地、无需 key。需本机已运行 `ollama serve`；视觉模型用 qwen2.5-vl。',
    corsNoteEn: 'Fully local, no key needed. Requires `ollama serve` running on this machine; use qwen2.5-vl for vision.',
    badge: 'local', needsApiKey: false, source: 'builtin',
  },
]

export function buildModel(cfg: ProviderConfig): LanguageModel {
  const baseURL = cfg.baseURL.trim()
  switch (cfg.kind) {
    case 'anthropic': {
      const provider = createAnthropic({
        apiKey: cfg.apiKey.trim() || undefined,
        baseURL: baseURL || undefined,
        headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
      })
      return provider.chat(cfg.model.trim())
    }
    case 'google': {
      const provider = createGoogle({
        apiKey: cfg.apiKey.trim() || undefined,
        baseURL: baseURL || undefined,
      })
      return provider.chat(cfg.model.trim())
    }
    case 'openai-compatible': {
      const baseURL = cfg.baseURL.trim()
      if (!baseURL) throw new Error('该 provider 需要填写 Base URL 才能请求')
      const provider = createOpenAICompatible({
        name: cfg.id,
        baseURL,
        apiKey: cfg.apiKey.trim() || undefined,
      })
      return provider.chatModel(cfg.model.trim())
    }
    case 'openai':
    default: {
      const provider = createOpenAI({
        apiKey: cfg.apiKey.trim() || undefined,
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
    apiKey: '',
    baseURL: preset.defaultBaseURL,
    model: preset.defaultModel,
  }
}

export function resolveProviderConfig(
  presets: ProviderPreset[],
  configs: Record<string, ProviderConfig>,
  id: string,
): ProviderConfig {
  const saved = configs[id]
  const preset = presets.find((p) => p.id === id)
  if (saved) return { id, kind: preset?.transport ?? saved.kind, apiKey: saved.apiKey, baseURL: saved.baseURL, model: saved.model }
  if (preset) return { id, kind: preset.transport, apiKey: '', baseURL: preset.defaultBaseURL, model: preset.defaultModel }
  return { id, kind: 'openai', apiKey: '', baseURL: '', model: '' }
}

export interface ConnectionTestResult {
  ok: boolean
  latencyMs?: number
  error?: string
  /** i18n key for known failures (takes precedence over `error` in the UI) */
  errorKey?: I18nKey
}

/** Sends a tiny completion to validate the key + endpoint + model. */
export async function testConnection(cfg: ProviderConfig): Promise<ConnectionTestResult> {
  const start = Date.now()
  try {
    const model = buildModel(cfg)
    await generateText({ model, prompt: 'Reply with the single word: OK', temperature: 0 })
    return { ok: true, latencyMs: Date.now() - start }
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e)
    const isCors = /fetch|CORS|Failed to fetch|NetworkError|cross-origin/i.test(msg)
    return {
      ok: false,
      error: msg,
      errorKey: isCors ? 'provider.error.cors' : undefined,
    }
  }
}

export interface FetchModelsResult {
  ok: boolean
  models?: string[]
  error?: string
  /** i18n key for known failures (takes precedence over `error` in the UI) */
  errorKey?: I18nKey
}

/**
 * Lists models from an OpenAI-compatible `GET {baseURL}/models` endpoint.
 * Only meaningful for the 'openai' transport; other SDKs have no such REST shape.
 */
export async function fetchModels(cfg: ProviderConfig, presetBaseURL?: string): Promise<FetchModelsResult> {
  if (cfg.kind !== 'openai' && cfg.kind !== 'openai-compatible') return { ok: false, errorKey: 'provider.error.unsupportedFetch' }
  const root = (cfg.baseURL.trim() || presetBaseURL || '').replace(/\/+$/, '')
  if (!root) return { ok: false, errorKey: 'provider.error.noBaseUrl' }
  try {
    const res = await fetch(`${root}/models`, {
      headers: cfg.apiKey.trim() ? { Authorization: `Bearer ${cfg.apiKey.trim()}` } : {},
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { ok: false, error: `HTTP ${res.status}${body ? `：${body.slice(0, 160)}` : ''}` }
    }
    const data = (await res.json()) as { data?: Array<{ id?: string }> }
    const ids = (data.data ?? [])
      .map((m) => m?.id)
      .filter((x): x is string => typeof x === 'string' && x.length > 0)
      .sort()
    if (ids.length === 0) return { ok: false, errorKey: 'provider.error.emptyModels' }
    return { ok: true, models: ids }
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e)
    const isCors = /fetch|CORS|Failed to fetch|NetworkError|cross-origin/i.test(msg)
    return { ok: false, error: msg, errorKey: isCors ? 'provider.error.corsList' : undefined }
  }
}