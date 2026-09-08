import { clear, createStore, del, get, keys, set } from 'idb-keyval'
import type { VideoFileInfo } from '../types'

/** local-first persistence for analysis sessions (IndexedDB). */
const kv = createStore('argus', 'kv')

export interface SessionMeta {
  id: string
  videoName: string
  videoSize: number
  createdAt: number
  updatedAt: number
  messageCount: number
  videoInfo?: VideoFileInfo
}

const K = {
  meta: (id: string) => `session:${id}:meta`,
  messages: (id: string) => `session:${id}:messages`,
  frames: (id: string) => `session:${id}:frames`,
  memory: (id: string) => `session:${id}:memory`,
}

export async function saveSessionMeta(meta: SessionMeta): Promise<void> {
  await set(K.meta(meta.id), meta, kv)
}

export async function listSessions(): Promise<SessionMeta[]> {
  const ks = (await keys(kv)) as IDBValidKey[]
  const metas: SessionMeta[] = []
  for (const k of ks) {
    if (typeof k === 'string' && k.startsWith('session:') && k.endsWith(':meta')) {
      const m = (await get(k, kv)) as SessionMeta | undefined
      if (m) metas.push(m)
    }
  }
  return metas.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function saveMessages<T>(id: string, messages: T): Promise<void> {
  await set(K.messages(id), messages, kv)
}

export async function loadMessages<T>(id: string): Promise<T | undefined> {
  return (await get(K.messages(id), kv)) as T | undefined
}

/** merge-write: new frames are unioned with what's already persisted (by id). */
export async function mergeSaveFrames<T extends { id: string }>(id: string, frames: T[]): Promise<void> {
  if (frames.length === 0) return
  const existing = ((await get(K.frames(id), kv)) as T[] | undefined) ?? []
  const map = new Map<string, T>()
  for (const f of existing) map.set(f.id, f)
  for (const f of frames) map.set(f.id, f)
  await set(K.frames(id), [...map.values()], kv)
}

export async function loadFrames<T>(id: string): Promise<T[] | undefined> {
  return (await get(K.frames(id), kv)) as T[] | undefined
}

export async function loadFrameById<T extends { id: string }>(id: string, frameId: string): Promise<T | undefined> {
  const frames = ((await loadFrames<T>(id)) ?? []) as T[]
  return frames.find((f) => f.id === frameId)
}

export async function saveMemoryEntries<T>(id: string, entries: T): Promise<void> {
  await set(K.memory(id), entries, kv)
}

export async function loadMemoryEntries<T>(id: string): Promise<T[] | undefined> {
  return (await get(K.memory(id), kv)) as T[] | undefined
}

export async function deleteSession(id: string): Promise<void> {
  await Promise.all([del(K.meta(id), kv), del(K.messages(id), kv), del(K.frames(id), kv), del(K.memory(id), kv)])
}

export async function clearAllSessions(): Promise<void> {
  await clear(kv)
}