import * as db from './db'
import type { SessionMeta } from './db'
import { useAppStore } from '../store'
import { memory } from './agent/memory'
import type { ChatMessage, ExtractedFrame } from '../types'
import type { MemoryEntry } from './agent/memory'

/** restore a persisted session into the live store. Returns false if nothing was saved. */
export async function restoreSession(id: string): Promise<boolean> {
  const [messages, frames, memoryEntries] = await Promise.all([
    db.loadMessages<ChatMessage[]>(id),
    db.loadFrames(id),
    db.loadMemoryEntries<MemoryEntry>(id),
  ])
  if (!messages) return false
  const meta = useAppStore.getState().sessions.find((s) => s.id === id)
  useAppStore.getState().hydrate({
    sessionId: id,
    videoInfo: meta?.videoInfo ?? null,
    messages,
    frames: frames ?? [],
    memoryEntries: memoryEntries ?? [],
  })
  return true
}

/** delete one session from IndexedDB + history list; resets the UI if it was active. */
export async function removeSession(id: string): Promise<void> {
  await db.deleteSession(id)
  const st = useAppStore.getState()
  st.removeSessionMeta(id)
  if (st.activeSessionId === id) st.reset()
}

/** wipe every persisted session and reset the UI. */
export async function wipeAllSessions(): Promise<void> {
  await db.clearAllSessions()
  useAppStore.getState().setSessions([])
  useAppStore.getState().reset()
}

/** create the session record for a freshly loaded video file. */
export async function startSession(videoName: string, videoSize: number): Promise<SessionMeta> {
  const meta: SessionMeta = {
    id: `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    videoName,
    videoSize,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messageCount: 0,
  }
  await db.saveSessionMeta(meta)
  await db.saveMessages(meta.id, [])
  const st = useAppStore.getState()
  st.upsertSessionMeta(meta)
  st.setActiveSession(meta.id)
  return meta
}

/** load history list; then restore the last active session if any. */
export async function bootstrapPersistence(): Promise<void> {
  const list = await db.listSessions()
  useAppStore.getState().setSessions(list)
  const lastId = localStorage.getItem('argus:lastSession')
  if (lastId && list.some((s) => s.id === lastId) && !useAppStore.getState().activeSessionId) {
    await restoreSession(lastId).catch(() => {})
  }
}

async function flush(): Promise<void> {
  const st = useAppStore.getState()
  const id = st.activeSessionId
  if (!id) return
  const prev = st.sessions.find((s) => s.id === id)
  const meta: SessionMeta = {
    id,
    videoName: st.videoInfo?.name ?? prev?.videoName ?? '未知视频',
    videoSize: st.videoInfo?.sizeBytes ?? prev?.videoSize ?? 0,
    createdAt: prev?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
    messageCount: st.messages.length,
    videoInfo: st.videoInfo ?? prev?.videoInfo,
  }
  await Promise.all([
    db.saveSessionMeta(meta),
    db.saveMessages(id, st.messages),
    db.mergeSaveFrames(id, st.frames),
    db.saveMemoryEntries(id, memory.list()),
  ])
  useAppStore.getState().upsertSessionMeta(meta)
}

/**
 * Subscribe to store changes and debounce-write them to IndexedDB.
 * Frames are merge-written (union by id), so the in-memory cap never loses data.
 */
export function startAutosave(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  const unsub = useAppStore.subscribe((s, prev) => {
    if (!s.activeSessionId) return
    if (
      s.messages === prev.messages &&
      s.frames === prev.frames &&
      s.videoInfo === prev.videoInfo &&
      s.activeSessionId === prev.activeSessionId
    ) {
      return
    }
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      void flush().catch(() => {})
    }, 800)
  })
  return () => {
    if (timer) clearTimeout(timer)
    unsub()
  }
}