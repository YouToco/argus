import { create } from 'zustand'
import type {
  ChatMessage,
  ExtractedFrame,
  ProviderConfig,
  ToolActivity,
  VideoFileInfo,
} from './types'
import { loadSettings, saveSettings } from './lib/settings'
import { VideoSession } from './lib/video/session'
import { BUILTIN_PRESETS, resolveProviderConfig, type ProviderPreset } from './lib/providers'

interface AppState {
  /** available providers (curated built-ins + models.dev catalog), for the dropdown + metadata */
  presets: ProviderPreset[]
  /** per-provider config overrides (only what the user has touched) */
  configs: Record<string, ProviderConfig>
  activeProviderId: string

  session: VideoSession | null
  videoInfo: VideoFileInfo | null
  frames: ExtractedFrame[]
  messages: ChatMessage[]
  activities: ToolActivity[]
  running: boolean

  setActiveProvider: (id: string) => void
  updateConfig: (id: string, patch: Partial<ProviderConfig>) => void
  appendPresets: (list: ProviderPreset[]) => void
  resetConfig: (id: string) => void

  setSession: (s: VideoSession | null) => void
  setVideoInfo: (i: VideoFileInfo | null) => void
  addFrames: (f: ExtractedFrame[]) => void
  clearFrames: () => void
  addMessage: (m: ChatMessage) => void
  appendToMessage: (id: string, delta: string) => void
  updateMessage: (id: string, patch: Partial<ChatMessage>) => void
  addActivity: (a: ToolActivity) => void
  clearActivities: () => void
  setRunning: (v: boolean) => void
  reset: () => void
}

const initial = loadSettings()

export const useAppStore = create<AppState>()((set, get) => ({
  presets: BUILTIN_PRESETS,
  configs: initial.configs,
  activeProviderId: initial.activeProviderId,

  session: null,
  videoInfo: null,
  frames: [],
  messages: [],
  activities: [],
  running: false,

  setActiveProvider: (id) => {
    set({ activeProviderId: id })
    saveSettings({ configs: get().configs, activeProviderId: id })
  },

  updateConfig: (id, patch) => {
    const cfg = resolveProviderConfig(get().presets, get().configs, id)
    const next: ProviderConfig = { ...cfg, ...patch, id }
    const configs = { ...get().configs, [id]: next }
    set({ configs })
    saveSettings({ configs, activeProviderId: get().activeProviderId })
  },

  appendPresets: (list) => {
    set((s) => {
      const existing = new Set(s.presets.map((p) => p.id))
      const fresh = list.filter((p) => !existing.has(p.id))
      return { presets: [...s.presets, ...fresh] }
    })
  },

  resetConfig: (id) => {
    const configs = { ...get().configs }
    delete configs[id]
    set({ configs })
    saveSettings({ configs, activeProviderId: get().activeProviderId })
  },

  setSession: (s) => {
    const old = get().session
    if (old && old !== s) old.destroy()
    set({ session: s })
  },
  setVideoInfo: (i) => set({ videoInfo: i }),
  addFrames: (f) => set((st) => ({ frames: [...st.frames, ...f] })),
  clearFrames: () => set({ frames: [] }),
  addMessage: (m) => set((st) => ({ messages: [...st.messages, m] })),
  appendToMessage: (id, delta) =>
    set((st) => ({
      messages: st.messages.map((m) => (m.id === id ? { ...m, content: m.content + delta } : m)),
    })),
  updateMessage: (id, patch) =>
    set((st) => ({ messages: st.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),
  addActivity: (a) => set((st) => ({ activities: [...st.activities, a] })),
  clearActivities: () => set({ activities: [] }),
  setRunning: (v) => set({ running: v }),
  reset: () => {
    get().session?.destroy()
    set({
      session: null,
      videoInfo: null,
      frames: [],
      messages: [],
      activities: [],
      running: false,
    })
  },
}))

/** Resolve the active provider's effective config (saved override or preset default). */
export function getActiveProvider(): ProviderConfig {
  const st = useAppStore.getState()
  return resolveProviderConfig(st.presets, st.configs, st.activeProviderId)
}

/** Resolve a provider preset from the store (built-in or catalog). */
export function getPreset(id: string): ProviderPreset | undefined {
  return useAppStore.getState().presets.find((p) => p.id === id)
}
