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

interface AppState {
  providers: ProviderConfig[]
  activeProviderId: string
  session: VideoSession | null
  videoInfo: VideoFileInfo | null
  frames: ExtractedFrame[]
  messages: ChatMessage[]
  activities: ToolActivity[]
  running: boolean

  setActiveProvider: (id: string) => void
  updateProvider: (id: string, patch: Partial<ProviderConfig>) => void
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
  providers: initial.providers,
  activeProviderId: initial.activeProviderId,
  session: null,
  videoInfo: null,
  frames: [],
  messages: [],
  activities: [],
  running: false,

  setActiveProvider: (id) => {
    set({ activeProviderId: id })
    saveSettings({ providers: get().providers, activeProviderId: id })
  },

  updateProvider: (id, patch) => {
    const providers = get().providers.map((p) => (p.id === id ? { ...p, ...patch } : p))
    set({ providers })
    saveSettings({ providers, activeProviderId: get().activeProviderId })
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

export function getActiveProvider(): ProviderConfig {
  const st = useAppStore.getState()
  return st.providers.find((p) => p.id === st.activeProviderId) ?? st.providers[0]
}
