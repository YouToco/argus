// AI SDK model construction — kept out of providers.ts so the ~1MB of
// provider SDKs only loads when the user actually talks to a model.
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogle } from '@ai-sdk/google'
import { generateText } from 'ai'
import type { LanguageModel } from 'ai'
import type { ProviderConfig } from '../types'
import type { I18nKey } from './i18n'

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
