import { useEffect, useState } from 'react'
import { useAppStore, getPreset } from './store'
import { fetchCatalogPresets } from './lib/catalog'
import { bootstrapPersistence, startAutosave } from './lib/persistence'
import { ProviderPanel } from './components/ProviderPanel'
import { HistoryPanel } from './components/HistoryPanel'
import { VideoPanel } from './components/VideoPanel'
import { FrameGrid } from './components/FrameGrid'
import { ChatPanel } from './components/ChatPanel'
import { History, Settings } from 'lucide-react'
import { EyeIcon } from './components/icons'

export default function App() {
  const [showProvider, setShowProvider] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const activeProviderId = useAppStore((s) => s.activeProviderId)
  const running = useAppStore((s) => s.running)
  const providerName = getPreset(activeProviderId)?.name ?? ''
  const hasVideo = useAppStore((s) => !!s.session)
  const catalogStatus = useAppStore((s) => s.catalogStatus)
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

  return (
    <div className="relative flex h-full flex-col">
      <div className="bg-glow" aria-hidden="true" />
      <div className="bg-grid" aria-hidden="true" />

      <header className="relative z-10 flex items-center gap-4 border-b border-white/[0.08] bg-black/70 px-5 py-3 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[#3d7fff] text-black">
            <EyeIcon size={20} />
          </span>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-extrabold tracking-tighter text-white">Argus</h1>
              <span className="mono-label rounded-sm border border-white/15 px-2 py-0.5 text-zinc-400">
                长视频理解
              </span>
            </div>
            <p className="mono-label mt-0.5 text-zinc-600">frontend-local · multi-provider agent harness</p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-3">
          {running && (
            <span className="mono-label flex items-center gap-2 text-[#5c93ff]">
              <span className="status-dot h-1.5 w-1.5 rounded-full bg-[#3d7fff]" />
              analyzing
            </span>
          )}
          <button
            onClick={() => setShowHistory(true)}
            className="btn-ghost flex items-center gap-2 rounded-md px-3 py-2 text-xs"
            title="历史记录（本地持久化）"
          >
            <History size={14} />
            <span className="mono-label hidden sm:inline">history</span>
          </button>
          <button
            onClick={() => setShowProvider(true)}
            className="btn-primary flex items-center gap-2 rounded-md px-4 py-2 text-xs font-bold"
          >
            <Settings size={14} />
            <span>{providerName}</span>
            {catalogStatus === 'loading' && <span className="opacity-60">· …</span>}
            <span className="hidden opacity-60 sm:inline">{hasVideo ? '· video loaded' : '· no video'}</span>
          </button>
        </div>
      </header>

      <main className="relative z-10 flex min-h-0 flex-1 gap-3 p-3">
        <aside className="card flex w-[320px] shrink-0 flex-col gap-4 overflow-hidden p-4">
          <VideoPanel />
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto border-t border-white/[0.06] pt-3">
            <FrameGrid />
          </div>
        </aside>
        <section className="card min-w-0 flex-1 overflow-hidden">
          <ChatPanel />
        </section>
      </main>

      {showProvider && <ProviderPanel onClose={() => setShowProvider(false)} />}
      {showHistory && <HistoryPanel onClose={() => setShowHistory(false)} />}
    </div>
  )
}