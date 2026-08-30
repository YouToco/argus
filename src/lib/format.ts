export function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '-'
  const s = Math.floor(sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
  return `${m}:${String(r).padStart(2, '0')}`
}

export function formatTime(sec: number): string {
  if (!Number.isFinite(sec)) return '-'
  if (sec < 60) return `${sec.toFixed(1)}s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (m < 60) return `${m}m${s.toFixed(1)}s`
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${h}h${String(mm).padStart(2, '0')}m${Math.round(s)}s`
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '-'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = bytes
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`
}

export function formatBitrate(bps: number | null): string {
  if (!bps || !Number.isFinite(bps)) return '-'
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`
  if (bps >= 1000) return `${(bps / 1000).toFixed(0)} kbps`
  return `${bps} bps`
}

export function formatFps(fps: number | null): string {
  if (!fps || !Number.isFinite(fps)) return '-'
  return `${fps.toFixed(fps < 10 ? 2 : 1)} fps`
}
