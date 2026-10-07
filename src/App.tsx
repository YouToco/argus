import { lazy, Suspense, useEffect } from 'react'
import { useAppStore, useActiveProvider } from './store'
import { fetchCatalogPresets } from './lib/catalog'
import { bootstrapPersistence, startAutosave } from './lib/persistence'
import { VideoPanel } from './components/VideoPanel'
import { FrameGrid } from './components/FrameGrid'
import { ChatPanel } from './components/ChatPanel'
import { History, Monitor, Moon, Settings2, Sun } from 'lucide-react'
import { EyeIcon } from './components/icons'
import { useT } from './lib/i18n'
import { nextThemeMode, watchSystemTheme } from './lib/theme'

// dialogs are only needed on demand — keep cmdk & friends out of the first paint
const ProviderPanel = lazy(() => import('./components/ProviderPanel').then((m) => ({ default: m.ProviderPanel })))
const HistoryPanel = lazy(() => import('./components/HistoryPanel').then((m) => ({ default: m.HistoryPanel })))
const FrameLightbox = lazy(() => import('./components/FrameLightbox').then((m) => ({ default: m.FrameLightbox })))

export default function App() {
  const dialog = useAppStore((s) => s.dialog)
  const setDialog = useAppStore((s) => s.setDialog)
  const lightboxOpen = useAppStore((s) => s.lightbox !== null)
  const setCatalogStatus = useAppStore((s) => s.setCatalogStatus)

  useEffect(() => {
    setCatalogStatus('loading')
    fetchCatalogPresets()
      .then((list) => {
        useAppStore.getState().appendPresets(list)
        setCatalogStatus('ready')
      })
      .catch(() => setCatalogStatus('error'))
  }, [setCatalogStatus])

  // IndexedDB persistence: restore last session, then autosave on changes
  useEffect(() => {
    void bootstrapPersistence().catch(() => {})
    return startAutosave()
  }, [])

  useEffect(() => watchSystemTheme(() => useAppStore.getState().themeMode), [])

  return (
    <div className="relative flex h-full flex-col">
      <div className="bg-glow" aria-hidden="true" />
      <div className="bg-grid" aria-hidden="true" />

      <Header />

      <main className="relative z-10 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 lg:flex-row lg:overflow-hidden">
        <aside className="card flex shrink-0 flex-col lg:w-[360px] lg:overflow-hidden">
          <VideoPanel />
          <div className="scroll-thin min-h-0 flex-1 border-t border-line lg:overflow-y-auto">
            <FrameGrid />
          </div>
        </aside>
        <section className="card flex h-[85dvh] min-w-0 shrink-0 flex-col overflow-hidden lg:h-auto lg:min-h-0 lg:flex-1 lg:shrink">
          <ChatPanel />
        </section>
      </main>

      <Suspense fallback={null}>
        {dialog === 'provider' && <ProviderPanel onClose={() => setDialog(null)} />}
        {dialog === 'history' && <HistoryPanel onClose={() => setDialog(null)} />}
        {lightboxOpen && <FrameLightbox />}
      </Suspense>
    </div>
  )
}

function Header() {
  const t = useT()
  const running = useAppStore((s) => s.running)
  const lang = useAppStore((s) => s.lang)
  const setLang = useAppStore((s) => s.setLang)
  const themeMode = useAppStore((s) => s.themeMode)
  const setThemeMode = useAppStore((s) => s.setThemeMode)
  const setDialog = useAppStore((s) => s.setDialog)
  const catalogStatus = useAppStore((s) => s.catalogStatus)
  const { preset, config, ready } = useActiveProvider()

  const ThemeIcon = themeMode === 'system' ? Monitor : themeMode === 'light' ? Sun : Moon
  const themeLabel = t(themeMode === 'system' ? 'theme.system' : themeMode === 'light' ? 'theme.light' : 'theme.dark')

  return (
    <header className="relative z-10 flex items-center gap-3 border-b border-line bg-bg/75 px-4 py-2.5 backdrop-blur-md sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-accent text-accent-fg shadow-[0_6px_20px_-6px_var(--accent)]">
          <EyeIcon size={20} />
        </span>
        <div className="min-w-0 max-[359px]:hidden">
          <h1 className="truncate text-[17px] font-bold leading-tight tracking-tight">Argus</h1>
          <p className="hidden truncate text-xs text-fg-3 sm:block">{t('app.subtitle')}</p>
        </div>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
        {running && (
          <span className="chip mr-1 hidden border-accent-line bg-accent-soft text-accent-text md:inline-flex">
            <span className="status-dot h-1.5 w-1.5 rounded-full bg-accent" />
            {t('app.analyzing')}
          </span>
        )}

        {/* phones: one button that switches to the other language */}
        <button
          type="button"
          onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
          className="btn btn-ghost h-8 w-8 text-xs font-semibold sm:hidden"
          title={t('app.language')}
          aria-label={t('app.language')}
        >
          {lang === 'zh' ? 'EN' : '中'}
        </button>
        <div className="hidden rounded-lg border border-line p-0.5 sm:flex" role="group" aria-label={t('app.language')}>
          {(['zh', 'en'] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              aria-pressed={lang === l}
              className={`rounded-md px-2 py-1 text-xs font-semibold transition-colors ${
                lang === l ? 'bg-surface-3 text-fg' : 'text-fg-3 hover:text-fg'
              }`}
            >
              {l === 'zh' ? '中' : 'EN'}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setThemeMode(nextThemeMode(themeMode))}
          className="btn btn-ghost h-8 w-8"
          title={`${t('theme.label')}: ${themeLabel}`}
          aria-label={`${t('theme.label')}: ${themeLabel}`}
        >
          <ThemeIcon size={15} />
        </button>

        <button type="button" onClick={() => setDialog('history')} className="btn btn-ghost h-8 w-8 px-0 text-xs sm:w-auto sm:px-2.5" title={t('app.historyTip')}>
          <History size={15} />
          <span className="hidden sm:inline">{t('app.history')}</span>
        </button>

        <button
          type="button"
          onClick={() => setDialog('provider')}
          className={`btn h-8 max-w-[46vw] px-2 text-xs sm:px-3 ${ready ? 'btn-ghost' : 'btn-primary'}`}
          title={t('app.modelSettings')}
        >
          {ready ? (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ok" />
          ) : (
            <Settings2 size={14} className="shrink-0" />
          )}
          {ready ? (
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate font-semibold text-fg">{preset?.name ?? config.id}</span>
              <span className="hidden truncate font-mono text-[11px] font-normal text-fg-3 md:inline">{config.model}</span>
            </span>
          ) : (
            <span className="truncate">{t('app.setupModel')}</span>
          )}
          {catalogStatus === 'loading' && <span className="opacity-60">…</span>}
        </button>
      </div>
    </header>
  )
}
