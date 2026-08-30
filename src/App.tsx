import { useState } from 'react'
import { useAppStore } from './store'
import { PROVIDER_PRESETS } from './lib/providers'
import { ProviderPanel } from './components/ProviderPanel'
import { VideoPanel } from './components/VideoPanel'
import { FrameGrid } from './components/FrameGrid'
import { ChatPanel } from './components/ChatPanel'

export default function App() {
  const [showProvider, setShowProvider] = useState(false)
  const activeProviderId = useAppStore((s) => s.activeProviderId)
  const running = useAppStore((s) => s.running)
  const providerName = PROVIDER_PRESETS[activeProviderId as keyof typeof PROVIDER_PRESETS]?.name ?? ''

  return (
    <div className="flex h-full flex-col bg-zinc-950 text-zinc-100">
      <header className="flex items-center gap-3 border-b border-zinc-800 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/15 text-sm">
            👁️
          </span>
          <div>
            <h1 className="text-sm font-semibold leading-tight">Argus</h1>
            <p className="text-[10px] leading-tight text-zinc-500">长视频理解 Agent Harness</p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {running && (
            <span className="flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
              运行中
            </span>
          )}
          <button
            onClick={() => setShowProvider(true)}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-amber-500 hover:text-amber-300"
          >
            ⚙️ {providerName}
          </button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1">
        <aside className="flex w-[300px] shrink-0 flex-col gap-3 border-r border-zinc-800 bg-zinc-950 p-3">
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
