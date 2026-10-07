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
