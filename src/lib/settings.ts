import type { ProviderConfig } from '../types'
import { PROVIDER_PRESETS, createDefaultConfig } from './providers'

const KEY = 'argus:settings:v1'

export interface PersistedSettings {
  providers: ProviderConfig[]
  activeProviderId: string
}

function defaultProviders(): ProviderConfig[] {
  // one config slot per known preset; only baseURL/model are prefilled, apiKey empty
  return PROVIDER_PRESETS.map((preset) => createDefaultConfig(preset))
}

export function loadSettings(): PersistedSettings {
  const defaults = defaultProviders()
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedSettings>
      const providers = defaults.map((d) => {
        const found = parsed.providers?.find((p) => p.id === d.id)
        return found ? { ...d, ...found } : d
      })
      const activeProviderId =
        parsed.activeProviderId && providers.some((p) => p.id === parsed.activeProviderId)
          ? parsed.activeProviderId
          : providers[0].id
      return { providers, activeProviderId }
    }
  } catch {
    /* corrupted settings -> fall back to defaults */
  }
  return { providers: defaults, activeProviderId: defaults[0].id }
}

export function saveSettings(s: PersistedSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* storage may be unavailable in private mode */
  }
}
