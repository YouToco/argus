import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from 'cmdk'
import { fetchModels, testConnection } from '../lib/providers'
import type { ProviderPreset } from '../lib/providers'
import { useAppStore } from '../store'
import { CheckIcon, ChevronDownIcon, RefreshIcon, SearchIcon, XIcon } from './icons'

const BADGE_STYLE: Record<ProviderPreset['badge'], string> = {
  official: 'border-emerald-500/40 text-emerald-400',
  compatible: 'border-[#3d7fff]/50 text-[#5c93ff]',
  local: 'border-violet-500/40 text-violet-400',
  catalog: 'border-white/15 text-zinc-400',
}

const BADGE_LABEL: Record<ProviderPreset['badge'], string> = {
  official: '官方',
  compatible: '兼容',
  local: '本地',
  catalog: 'models.dev',
}

/** Substring filter that matches provider id or name (works for Chinese too). */
const providerFilter = (value: string, search: string, keywords?: string[]) => {
  const s = search.trim().toLowerCase()
  if (!s) return 1
  if (value.toLowerCase().includes(s)) return 1
  if (keywords?.some((k) => k.toLowerCase().includes(s))) return 1
  return 0
}

type ModelListState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; models: string[] }
  | { status: 'error'; error: string }

const popoverAnim = {
  initial: { opacity: 0, y: -6, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -6, scale: 0.98 },
  transition: { duration: 0.16, ease: [0.16, 1, 0.3, 1] as const },
}

/** Close popover on outside pointer down. */
function useOutsideClose(ref: React.RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return
    function onDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [ref, open, close])
}

// ---------------------------------------------------------------------------
// Provider dropdown — one-line trigger, searchable cmdk popover
// ---------------------------------------------------------------------------

function ProviderSelect({
  builtin,
  catalog,
  catalogStatus,
  activeId,
  onSelect,
  open,
  setOpen,
}: {
  builtin: ProviderPreset[]
  catalog: ProviderPreset[]
  catalogStatus: string
  activeId: string
  onSelect: (id: string) => void
  open: boolean
  setOpen: (v: boolean) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useOutsideClose(ref, open, () => setOpen(false))
  const activePreset = [...builtin, ...catalog].find((p) => p.id === activeId)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="input-line flex w-full items-center justify-between gap-3 rounded-md border border-white/10 bg-black px-3 py-2.5 text-left"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="truncate text-sm text-zinc-100">{activePreset?.name ?? '选择 provider'}</span>
          {activePreset && (
            <span className={`mono-label shrink-0 rounded-sm border px-1.5 py-0.5 ${BADGE_STYLE[activePreset.badge]}`}>
              {BADGE_LABEL[activePreset.badge]}
            </span>
          )}
        </span>
        <ChevronDownIcon size={14} className={`shrink-0 text-zinc-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            {...popoverAnim}
            className="absolute left-0 right-0 z-30 mt-1.5 overflow-hidden rounded-md border border-white/10 bg-[#0a0a0a] shadow-2xl shadow-black"
          >
            <Command shouldFilter filter={providerFilter} loop>
              <div className="flex items-center gap-2 border-b border-white/[0.08] px-3">
                <SearchIcon size={13} className="shrink-0 text-zinc-600" />
                <CommandInput
                  placeholder="搜索 provider…"
                  autoFocus
                  className="w-full bg-transparent py-2.5 font-mono text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
                />
              </div>
              <CommandList className="scroll-thin max-h-64 overflow-y-auto p-1">
                <CommandEmpty className="mono-label px-3 py-5 text-center text-zinc-600">no match</CommandEmpty>
                <CommandGroup
                  heading="常用"
                  className="text-xs text-zinc-500 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.18em] [&_[cmdk-group-heading]]:text-zinc-600"
                >
                  {builtin.map((p) => (
                    <ProviderItem key={p.id} preset={p} active={p.id === activeId} onSelect={(id) => { onSelect(id); setOpen(false) }} />
                  ))}
                </CommandGroup>
                {catalogStatus === 'loading' && (
                  <div className="mono-label px-3 py-3 text-zinc-600">loading models.dev…</div>
                )}
                {catalogStatus === 'ready' && catalog.length > 0 && (
                  <CommandGroup
                    heading={`更多 · models.dev (${catalog.length})`}
                    className="text-xs text-zinc-500 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.18em] [&_[cmdk-group-heading]]:text-zinc-600"
                  >
                    {catalog.map((p) => (
                      <ProviderItem key={p.id} preset={p} active={p.id === activeId} onSelect={(id) => { onSelect(id); setOpen(false) }} />
                    ))}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ProviderItem({
  preset,
  active,
  onSelect,
}: {
  preset: ProviderPreset
  active: boolean
  onSelect: (id: string) => void
}) {
  return (
    <CommandItem
      value={preset.id}
      keywords={[preset.name, preset.id]}
      onSelect={() => onSelect(preset.id)}
      className="mx-1 flex cursor-pointer items-center justify-between gap-2 rounded-sm px-3 py-2 text-sm text-zinc-300 outline-none transition-colors aria-[selected=true]:bg-[#3d7fff]/15 aria-[selected=true]:text-[#5c93ff]"
    >
      <span className="flex min-w-0 items-center gap-2">
        {active && <span className="h-1.5 w-1.5 shrink-0 bg-[#3d7fff]" />}
        <span className="truncate">{preset.name}</span>
      </span>
      <span className={`mono-label shrink-0 rounded-sm border px-1.5 py-0.5 ${BADGE_STYLE[preset.badge]}`}>
        {BADGE_LABEL[preset.badge]}
      </span>
    </CommandItem>
  )
}

// ---------------------------------------------------------------------------
// Model combobox — editable input + auto-fetched dropdown list
// ---------------------------------------------------------------------------

function ModelSelect({
  value,
  onChange,
  listState,
  canFetch,
  onOpen,
  visionModels,
  placeholder,
  open,
  setOpen,
}: {
  value: string
  onChange: (v: string) => void
  listState: ModelListState
  canFetch: boolean
  onOpen: () => void
  visionModels: string[]
  placeholder?: string
  open: boolean
  setOpen: (v: boolean) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useOutsideClose(ref, open, () => setOpen(false))

  const source = listState.status === 'ready' ? listState.models : []
  const q = value.trim().toLowerCase()
  const filtered = q ? source.filter((m) => m.toLowerCase().includes(q)) : source

  return (
    <div ref={ref} className="relative">
      <div className="flex">
        <input
          id="provider-model"
          name="provider-model"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => {
            setOpen(true)
            onOpen()
          }}
          placeholder={placeholder ?? '模型名'}
          autoComplete="off"
          spellCheck={false}
          className="input-line w-full rounded-l-md border border-r-0 border-white/10 bg-black px-3 py-2.5 font-mono text-sm text-zinc-100 outline-none placeholder:text-zinc-700"
        />
        <button
          type="button"
          onClick={() => {
            setOpen(!open)
            if (!open) onOpen()
          }}
          className="input-line flex items-center rounded-r-md border border-white/10 bg-black px-2.5 text-zinc-500 hover:text-zinc-200"
          aria-label="展开模型列表"
        >
          {listState.status === 'loading' ? (
            <RefreshIcon size={13} className="animate-spin" />
          ) : (
            <ChevronDownIcon size={14} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
          )}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            {...popoverAnim}
            className="absolute left-0 right-0 z-30 mt-1.5 overflow-hidden rounded-md border border-white/10 bg-[#0a0a0a] shadow-2xl shadow-black"
          >
            {listState.status === 'loading' && (
              <div className="mono-label flex items-center gap-2 px-3 py-3.5 text-zinc-500">
                <RefreshIcon size={11} className="animate-spin" />
                fetching models…
              </div>
            )}
            {listState.status === 'error' && (
              <div className="px-3 py-3 text-xs leading-relaxed text-red-400">
                模型列表拉取失败：{listState.error}
                {!canFetch && <span className="text-zinc-600">（该 provider 不支持自动拉取，可直接输入模型名）</span>}
              </div>
            )}
            {listState.status !== 'loading' && filtered.length > 0 && (
              <ul className="scroll-thin max-h-60 overflow-y-auto p-1">
                {filtered.map((m) => (
                  <li key={m}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(m)
                        setOpen(false)
                      }}
                      className="flex w-full items-center justify-between gap-3 rounded-sm px-3 py-2 text-left font-mono text-xs text-zinc-300 transition-colors hover:bg-[#3d7fff]/15 hover:text-[#5c93ff]"
                    >
                      <span className="truncate">{m}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        {visionModels.includes(m) && (
                          <span className="mono-label rounded-sm border border-[#3d7fff]/50 px-1.5 py-0.5 text-[#5c93ff]">vision</span>
                        )}
                        {m === value && <CheckIcon size={12} className="text-[#3d7fff]" />}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {listState.status === 'ready' && filtered.length === 0 && (
              <div className="mono-label px-3 py-3.5 text-zinc-600">no match · 直接回车使用当前输入</div>
            )}
            {listState.status === 'idle' && !canFetch && (
              <div className="mono-label px-3 py-3.5 text-zinc-600">该 provider 不支持拉取 · 手动输入模型名</div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function ProviderPanel({ onClose }: { onClose: () => void }) {
  const presets = useAppStore((s) => s.presets)
  const activeProviderId = useAppStore((s) => s.activeProviderId)
  const setActiveProvider = useAppStore((s) => s.setActiveProvider)
  const updateConfig = useAppStore((s) => s.updateConfig)
  const catalogStatus = useAppStore((s) => s.catalogStatus)

  const cfg = useAppStore((s) => s.configs[activeProviderId])

  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; latencyMs?: number; error?: string } | null>(null)
  const [modelList, setModelList] = useState<ModelListState>({ status: 'idle' })
  const [providerOpen, setProviderOpen] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)
  const fetchSeq = useRef(0)

  const preset = presets.find((p) => p.id === activeProviderId)
  const builtin = useMemo(() => presets.filter((p) => p.source === 'builtin'), [presets])
  const catalog = useMemo(() => presets.filter((p) => p.source === 'catalog'), [presets])

  const active = cfg ?? {
    id: activeProviderId,
    kind: preset?.transport ?? 'openai',
    apiKey: '',
    baseURL: preset?.defaultBaseURL ?? '',
    model: preset?.defaultModel ?? '',
  }

  const canFetchModels = active.kind === 'openai' && (preset?.needsApiKey === false || active.apiKey.trim().length > 0)

  const loadModels = useCallback(async () => {
    const seq = ++fetchSeq.current
    setModelList({ status: 'loading' })
    const res = await fetchModels(active, preset?.defaultBaseURL)
    if (seq !== fetchSeq.current) return // superseded by a newer fetch
    if (res.ok && res.models) setModelList({ status: 'ready', models: res.models })
    else setModelList({ status: 'error', error: res.error ?? '拉取失败' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.kind, active.apiKey, active.baseURL, preset?.defaultBaseURL])

  // auto-fetch model list once the key looks usable (debounced)
  useEffect(() => {
    if (!canFetchModels) {
      setModelList({ status: 'idle' })
      return
    }
    const t = setTimeout(() => {
      void loadModels()
    }, 600)
    return () => clearTimeout(t)
  }, [canFetchModels, loadModels])

  /** fetch on dropdown open if we have nothing yet */
  function onModelOpen() {
    if (canFetchModels && modelList.status === 'idle') void loadModels()
  }

  function onSelect(id: string) {
    setActiveProvider(id)
    setTestResult(null)
    setModelList({ status: 'idle' })
    setModelOpen(false)
  }

  async function onTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const r = await testConnection(active)
      setTestResult(r)
      if (r.ok && canFetchModels) void loadModels()
    } finally {
      setTesting(false)
    }
  }

  const visionCount = preset?.visionModels?.length ?? 0

  // Esc closes the innermost open layer first
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (modelOpen) {
        setModelOpen(false)
        return
      }
      if (providerOpen) {
        setProviderOpen(false)
        return
      }
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, modelOpen, providerOpen])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4 pt-[8vh] backdrop-blur-sm" onClick={onClose}>
      <motion.form
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-3xl rounded-md border border-white/10 bg-[#0a0a0a] p-6 shadow-2xl shadow-black"
        onSubmit={(e) => e.preventDefault()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="mono-label flex items-center gap-2 text-zinc-300">
            <span className="h-1.5 w-1.5 bg-[#3d7fff]" />
            model / provider://
          </h2>
          <button type="button" onClick={onClose} className="btn-ghost rounded-sm p-1.5">
            <XIcon size={12} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-x-5">
          {/* Provider */}
          <div className="col-span-2">
            <label className="mono-label mb-1.5 block text-zinc-500">provider</label>
            <ProviderSelect
              builtin={builtin}
              catalog={catalog}
              catalogStatus={catalogStatus}
              activeId={activeProviderId}
              onSelect={onSelect}
              open={providerOpen}
              setOpen={setProviderOpen}
            />
            {preset && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className={`mono-label rounded-sm border px-2 py-0.5 ${BADGE_STYLE[preset.badge]}`}>
                  {BADGE_LABEL[preset.badge]}
                </span>
                <span className="font-mono text-[11px] text-zinc-600">{preset.defaultBaseURL || '官方端点'}</span>
                {!preset.needsApiKey && <span className="mono-label text-zinc-600">· no key needed</span>}
                {visionCount > 0 && <span className="mono-label text-zinc-600">· {visionCount} vision</span>}
                {preset.id === 'ollama' && <span className="mono-label text-violet-400">· offline</span>}
              </div>
            )}
          </div>

          {/* API Key */}
          {preset?.needsApiKey !== false && (
            <div className="mt-4">
              <label htmlFor="provider-api-key" className="mono-label mb-1.5 block text-zinc-500">api key</label>
              <div className="flex gap-2">
                <input
                  id="provider-api-key"
                  name="provider-api-key"
                  type={showKey ? 'text' : 'password'}
                  value={active.apiKey}
                  onChange={(e) => {
                    updateConfig(activeProviderId, { apiKey: e.target.value })
                    setTestResult(null)
                  }}
                  placeholder="sk-… / Bearer token"
                  autoComplete="off"
                  spellCheck={false}
                  className="input-line flex-1 rounded-md border border-white/10 bg-black px-3 py-2.5 font-mono text-sm text-zinc-100 outline-none placeholder:text-zinc-700"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="btn-ghost mono-label shrink-0 rounded-md px-3"
                >
                  {showKey ? 'hide' : 'show'}
                </button>
              </div>
            </div>
          )}

          {/* Base URL */}
          <div className={`mt-4 ${preset?.needsApiKey === false ? 'col-span-2' : ''}`}>
            <label htmlFor="provider-base-url" className="mono-label mb-1.5 block text-zinc-500">base url</label>
            <input
              id="provider-base-url"
              name="provider-base-url"
              type="text"
              value={active.baseURL}
              onChange={(e) => {
                updateConfig(activeProviderId, { baseURL: e.target.value })
                setTestResult(null)
              }}
              placeholder={preset?.baseURLPlaceholder ?? '留空使用官方端点'}
              autoComplete="off"
              spellCheck={false}
              className="input-line w-full rounded-md border border-white/10 bg-black px-3 py-2.5 font-mono text-sm text-zinc-100 outline-none placeholder:text-zinc-700"
            />
          </div>

          {/* Model */}
          <div className="col-span-2 mt-4">
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="provider-model" className="mono-label text-zinc-500">model</label>
              {modelList.status === 'ready' && (
                <span className="mono-label text-[#5c93ff]">✓ {modelList.models.length} models fetched</span>
              )}
            </div>
            <ModelSelect
              value={active.model}
              onChange={(v) => {
                updateConfig(activeProviderId, { model: v })
                setTestResult(null)
              }}
              listState={modelList}
              canFetch={canFetchModels}
              onOpen={onModelOpen}
              visionModels={preset?.visionModels ?? []}
              placeholder={preset?.models[0] ?? '模型名'}
              open={modelOpen}
              setOpen={setModelOpen}
            />
          </div>

          {/* CORS note */}
          {preset?.corsNote && (
            <p className="col-span-2 mt-4 rounded-md border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-xs leading-relaxed text-zinc-500">
              {preset.corsNote}
            </p>
          )}

          {/* Test connection */}
          <div className="col-span-2 mt-5 flex items-center gap-3">
            <button
              type="button"
              onClick={onTest}
              disabled={testing || !active.model.trim() || (preset?.needsApiKey !== false && !active.apiKey.trim())}
              className="btn-primary rounded-md px-6 py-2.5 text-xs font-bold tracking-widest"
            >
              {testing ? 'TESTING…' : 'TEST CONNECTION'}
            </button>
            {testResult && (
              <motion.p
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className={`rounded-md border px-3 py-2 font-mono text-xs ${
                  testResult.ok
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                    : 'border-red-500/30 bg-red-500/10 text-red-400'
                }`}
              >
                {testResult.ok ? `✓ connected (${testResult.latencyMs}ms)` : `✗ ${testResult.error ?? '连接失败'}`}
              </motion.p>
            )}
          </div>
        </div>

        <p className="mt-5 border-t border-white/[0.06] pt-4 text-xs leading-relaxed text-zinc-600">
          密钥与配置只保存在本机浏览器 localStorage，不会上传到任何服务器；请求由浏览器直发你填写的端点。
          provider 列表来自 <span className="text-zinc-500">models.dev</span>（@ai-sdk），大部分走 OpenAI 兼容协议，Anthropic / Gemini 用各自官方 SDK。
        </p>
      </motion.form>
    </div>
  )
}