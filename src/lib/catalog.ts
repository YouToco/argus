import type { ProviderPreset } from './providers'

/**
 * Fetch the public model catalog from https://models.dev/api.json and normalize
 * it into `ProviderPreset[]` so the app can offer hundreds of providers with
 * correct transport (from the provider's `npm` AI SDK package), base URL (from
 * `api`), and model list (chat models, vision models first).
 *
 * models.dev is CORS-open (`Access-Control-Allow-Origin: *`) and the file is a
 * small enough JSON to fetch in-browser. Results are cached in localStorage.
 */

const FETCH_URL = 'https://models.dev/api.json'
const CACHE_KEY = 'argus:modelsdev:v1'
const CACHE_KEY_META = 'argus:modelsdev:meta:v1'

/**
 * models.dev doesn't carry an `api` base URL for SDK-native providers (those are
 * meant to use their own @ai-sdk/* package). Since we drive them through
 * @ai-sdk/openai, we need the OpenAI-compatible endpoint. This is a small, stable
 * map for the common vendors; models/transport still come from models.dev.
 */
const KNOWN_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  deepinfra: 'https://api.deepinfra.com/v1',
  xai: 'https://api.x.ai/v1',
  togetherai: 'https://api.together.xyz/v1',
  mistral: 'https://api.mistral.ai/v1',
  cerebras: 'https://api.cerebras.ai/v1',
  groq: 'https://api.groq.com/openai/v1',
  cohere: 'https://api.cohere.ai/compatibility/v1',
  perplexity: 'https://api.perplexity.ai',
  venice: 'https://api.venice.ai/api/v1',
  aihubmix: 'https://aihubmix.com/v1',
}

interface ModelsDevEntry {
  name?: string
  npm?: string
  api?: string
  env?: string[]
  models?: Record<string, { id?: string; name?: string; attachment?: boolean }>
}

function isLocalhost(url: string): boolean {
  return /localhost|127\.0\.0\.1/.test(url)
}

function transportFromNpm(npm: string | undefined): ProviderPreset['transport'] {
  if (npm === '@ai-sdk/anthropic') return 'anthropic'
  if (npm === '@ai-sdk/google' || npm === '@google/genai') return 'google'
  return 'openai'
}

function isChatModel(m: { id?: string; name?: string; modalities?: { output?: string[] } }): boolean {
  const id = (m.id ?? '').toLowerCase()
  // skip obvious non-chat models (image gen, embeddings, audio, etc.)
  if (/image|embed|dall-e|\btts\b|\bstt\b|whisper|audio|video|rerank|\bocr\b|\bvoice\b|\bspeech\b|transcri|moderation/.test(id)) {
    return false
  }
  const output = m.modalities?.output
  if (output && output.length > 0 && !output.some((o) => o === 'text' || o.includes('text'))) {
    return false
  }
  return true
}

export async function fetchCatalogPresets(force = false): Promise<ProviderPreset[]> {
  if (!force) {
    try {
      const cached = localStorage.getItem(CACHE_KEY)
      if (cached) return JSON.parse(cached) as ProviderPreset[]
    } catch {
      /* ignore corrupt cache */
    }
  }

  const res = await fetch(FETCH_URL)
  if (!res.ok) throw new Error(`models.dev 目录拉取失败 (${res.status})`)
  const json = (await res.json()) as Record<string, ModelsDevEntry>

  const out: ProviderPreset[] = []
  for (const [id, p] of Object.entries(json)) {
    const rawModels = Object.values(p.models ?? {})
    const models = rawModels
      .filter(isChatModel)
      .map((m) => ({ id: m.id ?? '', name: m.name ?? m.id ?? '', attachment: !!m.attachment }))
      .filter((m) => m.id)
      .sort((a, b) => Number(b.attachment) - Number(a.attachment) || a.id.localeCompare(b.id))
    if (models.length === 0) continue

    const api = p.api ?? KNOWN_BASE_URLS[id] ?? ''
    const vision = models.filter((m) => m.attachment).map((m) => m.id)
    const defaultModel = vision[0] ?? models[0].id
    const local = isLocalhost(api)

    out.push({
      id,
      name: p.name ?? id,
      transport: transportFromNpm(p.npm),
      defaultModel,
      defaultBaseURL: api,
      baseURLPlaceholder: api || '留空使用官方端点',
      models: models.map((m) => m.id),
      visionModels: vision.length ? vision : undefined,
      corsNote: api
        ? '来自 models.dev 目录。是否支持浏览器直连取决于该端点，建议先用「测试连接」验证；视觉任务选带 👁️ 的模型。'
        : '来自 models.dev 目录，无公开 OpenAI 兼容 base URL，需自行填写端点。',
      badge: local ? 'local' : transportFromNpm(p.npm) !== 'openai' ? 'official' : 'compatible',
      needsApiKey: !local,
      source: 'catalog',
    })
  }

  out.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(out))
    localStorage.setItem(CACHE_KEY_META, JSON.stringify({ fetchedAt: Date.now(), count: out.length }))
  } catch {
    /* storage may be unavailable */
  }
  return out
}
