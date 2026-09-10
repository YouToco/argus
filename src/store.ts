import { create } from 'zustand'
import type {
  ChatMessage,
  ExtractedFrame,
  ProviderConfig,
  ToolActivity,
  VideoFileInfo,
} from './types'
import type { SessionMeta } from './lib/db'
import { loadSettings, saveSettings } from './lib/settings'
import { VideoSession } from './lib/video/session'
import { memory } from './lib/agent/memory'
import type { MemoryEntry } from './lib/agent/memory'
import { BUILTIN_PRESETS, resolveProviderConfig, type ProviderPreset } from './lib/providers'
import { initialLang, LANG_KEY, type Lang } from './lib/i18n'

/**
 * In-memory frame window. Every frame is also persisted to IndexedDB, so
 * evicted frames can be lazily reloaded — this cap is what keeps 24h-video
 * analyses (hundreds of frames × ~50KB base64) from blowing up tab memory.
 */
export const MAX_FRAMES_IN_MEMORY = 200

export const LAST_SESSION_KEY = 'argus:lastSession'

interface AppState {
  /** available providers (curated built-ins + models.dev catalog), for the dropdown + metadata */
  presets: ProviderPreset[]
  /** per-provider config overrides (only what the user has touched) */
  configs: Record<string, ProviderConfig>
  activeProviderId: string

  /** UI language (persisted to localStorage) */
  lang: Lang

  session: VideoSession | null
  videoInfo: VideoFileInfo | null
  frames: ExtractedFrame[]
  messages: ChatMessage[]
  activities: ToolActivity[]
  running: boolean
  /** catalog loading status for offline-aware UI */
  catalogStatus: 'loading' | 'ready' | 'error'

  /** persistence: active analysis session + history list */
  activeSessionId: string | null
  sessions: SessionMeta[]

  setActiveProvider: (id: string) => void
  setLang: (l: Lang) => void
  updateConfig: (id: string, patch: Partial<ProviderConfig>) => void
  appendPresets: (list: ProviderPreset[]) => void
  resetConfig: (id: string) => void
  setCatalogStatus: (s: 'loading' | 'ready' | 'error') => void

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

  setActiveSession: (id: string | null) => void
  setSessions: (list: SessionMeta[]) => void
  upsertSessionMeta: (meta: SessionMeta) => void
  removeSessionMeta: (id: string) => void
  /** load a persisted session back into the UI (video file itself must be re-picked) */
  hydrate: (p: {
    sessionId: string
    videoInfo: VideoFileInfo | null
    messages: ChatMessage[]
    frames: ExtractedFrame[]
    memoryEntries: MemoryEntry[]
  }) => void
}

const initial = loadSettings()

export const useAppStore = create<AppState>()((set, get) => ({
  presets: BUILTIN_PRESETS,
  configs: initial.configs,
  activeProviderId: initial.activeProviderId,
  lang: initialLang(),

  session: null,
  videoInfo: null,
  frames: [],
  messages: [],
  activities: [],
  running: false,
  catalogStatus: 'loading',
  activeSessionId: null,
  sessions: [],

  setLang: (l) => {
    set({ lang: l })
    try {
      localStorage.setItem(LANG_KEY, l)
    } catch {
      /* storage may be unavailable */
    }
  },

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

  setCatalogStatus: (s) => set({ catalogStatus: s }),

  setSession: (s) => {
    const old = get().session
    if (old && old !== s) old.destroy()
    set({ session: s })
  },
  setVideoInfo: (i) => set({ videoInfo: i }),
  addFrames: (f) =>
    set((st) => ({ frames: [...st.frames, ...f].slice(-MAX_FRAMES_IN_MEMORY) })),
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
    memory.clear()
    localStorage.removeItem(LAST_SESSION_KEY)
    set({
      session: null,
      videoInfo: null,
      frames: [],
      messages: [],
      activities: [],
      running: false,
      activeSessionId: null,
    })
  },

  setActiveSession: (id) => {
    set({ activeSessionId: id })
    if (id) localStorage.setItem(LAST_SESSION_KEY, id)
    else localStorage.removeItem(LAST_SESSION_KEY)
  },
  setSessions: (list) => set({ sessions: list }),
  upsertSessionMeta: (meta) =>
    set((st) => {
      const idx = st.sessions.findIndex((s) => s.id === meta.id)
      const sessions = idx >= 0 ? st.sessions.map((s) => (s.id === meta.id ? meta : s)) : [meta, ...st.sessions]
      return { sessions: sessions.sort((a, b) => b.updatedAt - a.updatedAt) }
    }),
  removeSessionMeta: (id) => set((st) => ({ sessions: st.sessions.filter((s) => s.id !== id) })),

  hydrate: (p) => {
    get().session?.destroy()
    memory.restore(p.memoryEntries)
    set({
      session: null,
      videoInfo: p.videoInfo,
      frames: p.frames.slice(-MAX_FRAMES_IN_MEMORY),
      messages: p.messages,
      activities: [],
      running: false,
    })
    get().setActiveSession(p.sessionId)
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