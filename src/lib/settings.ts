import type { ProviderConfig, ProviderKind } from '../types'
import { PROVIDER_PRESETS } from './providers'

const KEY = 'argus:settings:v1'

export interface PersistedSettings {
  providers: ProviderConfig[]
  activeProviderId: string
}

function defaultProviders(): ProviderConfig[] {
  return (Object.keys(PROVIDER_PRESETS) as ProviderKind[]).map((kind) => ({
    id: kind,
    kind,
    label: PROVIDER_PRESETS[kind].name,
    apiKey: '',
    baseURL: PROVIDER_PRESETS[kind].defaultBaseURL,
    model: PROVIDER_PRESETS[kind].defaultModel,
  }))
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
