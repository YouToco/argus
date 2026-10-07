/**
 * Timestamps the agent writes in answers — "24.8s", "25 秒", "1:05", "0:01:05",
 * "1m30.5s", "1h02m3s" (the format `formatTime` produces) — so the UI can turn
 * them into seek links. Kept deliberately conservative: aspect ratios (16:9),
 * bitrates (386 kbps), frame rates (10fps) and durations like "500ms" don't match.
 */
export const TIMESTAMP_RE =
  /(?<![\w.:])(?:\d+h)?\d+m\d+(?:\.\d+)?s(?![a-zA-Z])|(?<![\w.:])\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?(?![\d:])|(?<![\w.±])\d+(?:\.\d+)?\s?(?:s|秒)(?![a-zA-Z])/g

/** seconds for a string matched by TIMESTAMP_RE, or null if it isn't one */
export function parseTimestamp(s: string): number | null {
  let m = /^(?:(\d+)h)?(\d+)m(\d+(?:\.\d+)?)s$/.exec(s)
  if (m) return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3])
  m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?(\.\d+)?$/.exec(s)
  if (m) {
    const frac = m[4] ? Number(m[4]) : 0
    return m[3] !== undefined
      ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + frac
      : Number(m[1]) * 60 + Number(m[2]) + frac
  }
  m = /^(\d+(?:\.\d+)?)\s?(?:s|秒)$/.exec(s)
  if (m) return Number(m[1])
  return null
}

/**
 * A long run can leave hundreds of evidence frames, in extraction order — the
 * coarse first pass up front. Put the frame nearest each moment the answer
 * cites first (in the order cited, within `tolerance` seconds), then the rest
 * by time. `cited` is how many lead.
 */
export function citedFirst<F extends { timeSec: number }>(frames: F[], answer: string, tolerance = 1): { frames: F[]; cited: number } {
  const cited: F[] = []
  for (const m of answer.matchAll(TIMESTAMP_RE)) {
    const t = parseTimestamp(m[0])
    if (t === null) continue
    let best: F | undefined
    for (const f of frames) if (!best || Math.abs(f.timeSec - t) < Math.abs(best.timeSec - t)) best = f
    if (best && Math.abs(best.timeSec - t) <= tolerance && !cited.includes(best)) cited.push(best)
  }
  const rest = frames.filter((f) => !cited.includes(f)).sort((a, b) => a.timeSec - b.timeSec)
  return { frames: [...cited, ...rest], cited: cited.length }
}
