import type { ProviderConfig } from '../types'
import { BUILTIN_PRESETS, createDefaultConfig } from './providers'

const KEY = 'argus:settings:v1'

export interface PersistedSettings {
  /** per-provider config overrides, keyed by provider id */
  configs: Record<string, ProviderConfig>
  activeProviderId: string
}

function defaultSettings(): PersistedSettings {
  return { configs: {}, activeProviderId: BUILTIN_PRESETS[0].id }
}

export function loadSettings(): PersistedSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaultSettings()
    const parsed = JSON.parse(raw) as Partial<PersistedSettings> & { providers?: unknown }

    // Migration: v0 stored providers[] (array); v1 stores configs{} (keyed record).
    if (Array.isArray(parsed.providers)) {
      const configs: Record<string, ProviderConfig> = {}
      for (const p of parsed.providers as ProviderConfig[]) {
        if (p?.id) configs[p.id] = { id: p.id, kind: p.kind, apiKey: p.apiKey, baseURL: p.baseURL, model: p.model }
      }
      return {
        configs,
        activeProviderId: parsed.activeProviderId || BUILTIN_PRESETS[0].id,
      }
    }

    const configs = parsed.configs ?? {}
    const activeProviderId =
      parsed.activeProviderId &&
      Object.keys(configs).includes(parsed.activeProviderId)
        ? parsed.activeProviderId
        : BUILTIN_PRESETS[0].id
    return { configs, activeProviderId }
  } catch {
    /* corrupted settings -> defaults */
  }
  return defaultSettings()
}

export function saveSettings(s: PersistedSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ configs: s.configs, activeProviderId: s.activeProviderId }))
  } catch {
    /* storage may be unavailable in private mode */
  }
}

export { createDefaultConfig }
