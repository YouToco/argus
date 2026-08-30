export interface MemoryEntry {
  id: string
  startSec: number
  endSec: number
  topic: string
  notes: string
}

/**
 * The "state tool" store. The agent records what it has already observed for a
 * time range so long-video analysis doesn't overflow the context window. It is
 * intentionally simple: append/overwrite notes keyed by (time range, topic).
 */
export class MemoryStore {
  private entries: MemoryEntry[] = []
  private seq = 0

  remember(startSec: number, endSec: number, topic: string, notes: string): MemoryEntry {
    const key = `${topic}::${Math.round(startSec * 10)}-${Math.round(endSec * 10)}`
    const existing = this.entries.find(
      (e) =>
        e.topic === topic &&
        Math.abs(e.startSec - startSec) < 1e-3 &&
        Math.abs(e.endSec - endSec) < 1e-3,
    )
    if (existing) {
      existing.notes = notes
      return existing
    }
    this.seq += 1
    const entry: MemoryEntry = {
      id: `mem-${this.seq}`,
      startSec,
      endSec,
      topic,
      notes,
    }
    this.entries.push(entry)
    return entry
  }

  recall(opts: { topic?: string; timeRange?: [number, number]; query?: string }): MemoryEntry[] {
    let list = [...this.entries]
    if (opts.topic) {
      const t = opts.topic.toLowerCase()
      list = list.filter((e) => e.topic.toLowerCase().includes(t))
    }
    if (opts.timeRange) {
      const [a, b] = opts.timeRange
      list = list.filter((e) => e.endSec >= a && e.startSec <= b)
    }
    if (opts.query) {
      const q = opts.query.toLowerCase()
      list = list.filter(
        (e) => e.notes.toLowerCase().includes(q) || e.topic.toLowerCase().includes(q),
      )
    }
    return list.sort((a, b) => a.startSec - b.startSec)
  }

  list(): MemoryEntry[] {
    return [...this.entries].sort((a, b) => a.startSec - b.startSec)
  }

  clear(): void {
    this.entries = []
  }
}

export const memory = new MemoryStore()
