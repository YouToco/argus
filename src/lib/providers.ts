import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogle } from '@ai-sdk/google'
import type { LanguageModel } from 'ai'
import type { ProviderConfig, ProviderKind } from '../types'

export interface ProviderPreset {
  kind: ProviderKind
  name: string
  defaultModel: string
  defaultBaseURL: string
  baseURLPlaceholder: string
  modelHint: string
  corsNote: string
}

export const PROVIDER_PRESETS: Record<ProviderKind, ProviderPreset> = {
  'openai-compatible': {
    kind: 'openai-compatible',
    name: 'OpenAI 兼容',
    defaultModel: 'gpt-4o',
    defaultBaseURL: '',
    baseURLPlaceholder: 'https://api.openai.com/v1（或其他兼容端点）',
    modelHint: '如 gpt-4o / deepseek-chat / kimi-latest / qwen-vl-max',
    corsNote:
      '官方 OpenAI API 会拦截浏览器跨域调用，建议改用 OpenRouter / DeepSeek / Kimi / 智谱 等支持浏览器直连的 OpenAI 兼容端点。',
  },
  anthropic: {
    kind: 'anthropic',
    name: 'Anthropic',
    defaultModel: 'claude-sonnet-4-20250514',
    defaultBaseURL: '',
    baseURLPlaceholder: '留空使用官方端点',
    modelHint: '如 claude-sonnet-4-20250514',
    corsNote: '支持浏览器直连（已自动附加 direct-browser-access 请求头）。',
  },
  google: {
    kind: 'google',
    name: 'Google Gemini',
    defaultModel: 'gemini-2.5-flash',
    defaultBaseURL: '',
    baseURLPlaceholder: '留空使用官方端点',
    modelHint: '如 gemini-2.5-flash / gemini-2.5-pro（视觉需多模态模型）',
    corsNote: '支持浏览器直连。',
  },
}

export function buildModel(cfg: ProviderConfig): LanguageModel {
  switch (cfg.kind) {
    case 'openai-compatible': {
      const provider = createOpenAI({
        apiKey: cfg.apiKey,
        baseURL: cfg.baseURL.trim() || undefined,
      })
      return provider.chat(cfg.model.trim())
    }
    case 'anthropic': {
      const provider = createAnthropic({
        apiKey: cfg.apiKey,
        baseURL: cfg.baseURL.trim() || undefined,
        headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
      })
      return provider.chat(cfg.model.trim())
    }
    case 'google': {
      const provider = createGoogle({
        apiKey: cfg.apiKey,
        baseURL: cfg.baseURL.trim() || undefined,
      })
      return provider.chat(cfg.model.trim())
    }
  }
}
