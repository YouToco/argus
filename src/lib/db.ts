import { clear, createStore, del, get, keys, set } from 'idb-keyval'
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { ExtractedFrame, VideoFileInfo } from '../types'
import { dataUrlToBlob } from './frames'

/**
 * local-first persistence for analysis sessions.
 *
 * Two stores:
 * - `argus/kv` (idb-keyval): session meta, messages, memory entries — small payloads
 * - `argus-frames` (idb): one record per frame, keyed [sessionId, frameId]
 *
 * Frames used to be merge-saved as one giant array; on long analyses that meant
 * re-serializing tens of MB on every autosave. Per-frame records make saves O(new frames).
 */
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

interface FramesDB extends DBSchema {
  frames: {
    key: [sessionId: string, frameId: string]
    /** dataUrl only exists on pre-Blob legacy records (migrated on read) */
    value: ExtractedFrame & { sessionId: string; dataUrl?: string }
    indexes: { 'by-session': string }
  }
}

const framesDbPromise: Promise<IDBPDatabase<FramesDB>> = openDB<FramesDB>('argus-frames', 1, {
  upgrade(db) {
    const store = db.createObjectStore('frames', { keyPath: ['sessionId', 'id'] })
    store.createIndex('by-session', 'sessionId')
  },
})

/** frame ids already persisted per session — keeps autosave incremental */
const savedFrameIds = new Map<string, Set<string>>()

function savedIds(sessionId: string): Set<string> {
  let s = savedFrameIds.get(sessionId)
  if (!s) {
    s = new Set<string>()
    savedFrameIds.set(sessionId, s)
  }
  return s
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

/** persist only frames that were not saved yet for this session */
export async function mergeSaveFrames(sessionId: string, frames: ExtractedFrame[]): Promise<void> {
  if (frames.length === 0) return
  const saved = savedIds(sessionId)
  const fresh = frames.filter((f) => !saved.has(f.id))
  if (fresh.length === 0) return
  const db = await framesDbPromise
  const tx = db.transaction('frames', 'readwrite')
  await Promise.all([...fresh.map((f) => tx.store.put({ ...f, sessionId })), tx.done])
  for (const f of fresh) saved.add(f.id)
}

/** one-time migration: legacy sessions stored frames as a single array in kv */
async function backfillLegacyFrames(sessionId: string): Promise<ExtractedFrame[]> {
  const legacy = (await get(K.frames(sessionId), kv)) as ExtractedFrame[] | undefined
  if (!legacy || legacy.length === 0) return []
  const db = await framesDbPromise
  const tx = db.transaction('frames', 'readwrite')
  await Promise.all([...legacy.map((f) => tx.store.put({ ...f, sessionId })), tx.done])
  const saved = savedIds(sessionId)
  for (const f of legacy) saved.add(f.id)
  await del(K.frames(sessionId), kv)
  return migrateLegacyDataUrls(sessionId, legacy as Array<ExtractedFrame & { sessionId: string; dataUrl?: string }>)
}

/** pre-Blob records stored the frame as a base64 dataUrl — upgrade in place */
async function migrateLegacyDataUrls(
  sessionId: string,
  list: Array<ExtractedFrame & { sessionId: string; dataUrl?: string }>,
): Promise<ExtractedFrame[]> {
  const legacy = list.filter((f) => !(f.blob instanceof Blob) && typeof f.dataUrl === 'string')
  const out = list.map((f) => {
    if (f.blob instanceof Blob) return f
    const blob = dataUrlToBlob(f.dataUrl as string)
    const nf: ExtractedFrame & { sessionId: string } = {
      id: f.id,
      timeSec: f.timeSec,
      blob,
      width: f.width,
      height: f.height,
      source: f.source,
      sessionId,
    }
    return nf
  })
  if (legacy.length > 0) {
    const db = await framesDbPromise
    const tx = db.transaction('frames', 'readwrite')
    await Promise.all([
      ...out.filter((f) => legacy.some((l) => l.id === f.id)).map((f) => tx.store.put(f)),
      tx.done,
    ])
  }
  return out
}

export async function loadFrames(sessionId: string): Promise<ExtractedFrame[]> {
  const db = await framesDbPromise
  const list = await db.getAllFromIndex('frames', 'by-session', sessionId)
  if (list.length > 0) {
    const saved = savedIds(sessionId)
    for (const f of list) saved.add(f.id)
    return migrateLegacyDataUrls(sessionId, list)
  }
  return backfillLegacyFrames(sessionId)
}

export async function loadFrameById(sessionId: string, frameId: string): Promise<ExtractedFrame | undefined> {
  const db = await framesDbPromise
  const direct = await db.get('frames', [sessionId, frameId])
  if (direct) {
    const [migrated] = await migrateLegacyDataUrls(sessionId, [direct])
    return migrated
  }
  // may still live in the legacy array store (or not exist at all)
  const all = await loadFrames(sessionId)
  return all.find((f) => f.id === frameId)
}

export async function saveMemoryEntries<T>(id: string, entries: T): Promise<void> {
  await set(K.memory(id), entries, kv)
}

export async function loadMemoryEntries<T>(id: string): Promise<T[] | undefined> {
  return (await get(K.memory(id), kv)) as T[] | undefined
}

export async function deleteSession(id: string): Promise<void> {
  const db = await framesDbPromise
  const tx = db.transaction('frames', 'readwrite')
  const frameKeys = await tx.store.index('by-session').getAllKeys(id)
  await Promise.all([...frameKeys.map((k) => tx.store.delete(k)), tx.done])
  savedFrameIds.delete(id)
  await Promise.all([del(K.meta(id), kv), del(K.messages(id), kv), del(K.frames(id), kv), del(K.memory(id), kv)])
}

export async function clearAllSessions(): Promise<void> {
  const db = await framesDbPromise
  await db.clear('frames')
  savedFrameIds.clear()
  await clear(kv)
}