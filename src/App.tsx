import { useEffect, useState } from 'react'
import { useAppStore, getPreset } from './store'
import { fetchCatalogPresets } from './lib/catalog'
import { ProviderPanel } from './components/ProviderPanel'
import { VideoPanel } from './components/VideoPanel'
import { FrameGrid } from './components/FrameGrid'
import { ChatPanel } from './components/ChatPanel'

export default function App() {
  const [showProvider, setShowProvider] = useState(false)
  const activeProviderId = useAppStore((s) => s.activeProviderId)
  const running = useAppStore((s) => s.running)
  const providerName = getPreset(activeProviderId)?.name ?? ''
  const hasVideo = useAppStore((s) => !!s.session)

  useEffect(() => {
    // load the models.dev provider catalog (cached; best-effort)
    setCatalogStatus('loading')
    fetchCatalogPresets()
      .then((list) => {
        useAppStore.getState().appendPresets(list)
        setCatalogStatus('ready')
      })
      .catch(() => setCatalogStatus('error'))
  }, [])

  const [catalogStatus, setCatalogStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-zinc-800/70 bg-zinc-950/60 px-4 py-2.5 backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/25 to-orange-600/10 text-lg shadow-inner ring-1 ring-amber-500/20">
            👁️
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold leading-tight tracking-tight text-zinc-100">Argus</h1>
              <span className="rounded-full bg-zinc-800/80 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
                长视频理解
              </span>
            </div>
            <p className="text-[11px] leading-tight text-zinc-500">前端本地 · 多 provider Agent Harness</p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {running && (
            <span className="flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
              分析中
            </span>
          )}
          <button
            onClick={() => setShowProvider(true)}
            className="group flex items-center gap-1.5 rounded-lg border border-zinc-700/80 bg-zinc-900/60 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-amber-500/60 hover:text-amber-300"
          >
            <span className="text-sm leading-none">⚙️</span>
            <span className="font-medium">{providerName}</span>
            {catalogStatus === 'loading' && <span className="text-zinc-600">· 载入目录…</span>}
            <span className="hidden text-zinc-500 sm:inline">
              {hasVideo ? '· 已加载视频' : '· 待加载视频'}
            </span>
          </button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1">
        <aside className="flex w-[300px] shrink-0 flex-col gap-3 border-r border-zinc-800/70 bg-zinc-950/40 p-3">
          <VideoPanel />
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
            <FrameGrid />
          </div>
        </aside>
        <section className="min-w-0 flex-1">
          <ChatPanel />
        </section>
      </main>

      {showProvider && <ProviderPanel onClose={() => setShowProvider(false)} />}
    </div>
  )
}
