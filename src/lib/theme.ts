export type ThemeMode = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_KEY = 'argus:theme'

const media = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-color-scheme: dark)') : undefined

export function initialThemeMode(): ThemeMode {
  try {
    const v = localStorage.getItem(THEME_KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    /* storage may be unavailable */
  }
  return 'system'
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode !== 'system') return mode
  return media?.matches === false ? 'light' : 'dark'
}

/** Writes the resolved theme to <html data-theme> (index.html does the same pre-paint). */
export function applyTheme(mode: ThemeMode): void {
  const resolved = resolveTheme(mode)
  document.documentElement.dataset.theme = resolved
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#08090b' : '#f4f5f8')
}

/** Re-apply when the OS theme flips while the user is on "system". Returns an unsubscribe. */
export function watchSystemTheme(getMode: () => ThemeMode): () => void {
  if (!media) return () => {}
  const onChange = () => {
    if (getMode() === 'system') applyTheme('system')
  }
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

export function nextThemeMode(mode: ThemeMode): ThemeMode {
  return mode === 'system' ? 'light' : mode === 'light' ? 'dark' : 'system'
}
