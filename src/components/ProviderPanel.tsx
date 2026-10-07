import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from 'cmdk'
import { Check, ChevronDown, CircleAlert, Eye, EyeOff, Info, PlugZap, RefreshCw, Search, Settings2, X } from 'lucide-react'
import { fetchModels } from '../lib/providers'
import type { ProviderPreset } from '../lib/providers'
import { useAppStore } from '../store'
import { useT, type I18nKey } from '../lib/i18n'
import { Modal } from './ui/Modal'

const BADGE_STYLE: Record<ProviderPreset['badge'], string> = {
  official: 'border-ok/30 bg-ok-soft text-ok',
  compatible: 'border-accent-line bg-accent-soft text-accent-text',
  local: 'border-violet-500/30 bg-violet-500/10 text-violet-500 dark:text-violet-300',
  catalog: 'border-line text-fg-3',
}

const GROUP_HEADING =
  '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-fg-3'

const POPOVER = 'pop-in absolute left-0 right-0 z-30 mt-1.5 overflow-hidden rounded-xl border border-line bg-elevated'
const POPOVER_SHADOW = { boxShadow: 'var(--shadow-pop)' }

const BADGE_KEYS: Record<ProviderPreset['badge'], I18nKey> = {
  official: 'provider.badge.official',
  compatible: 'provider.badge.compatible',
  local: 'provider.badge.local',
  catalog: 'provider.badge.catalog',
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
  const t = useT()
  const activePreset = [...builtin, ...catalog].find((p) => p.id === activeId)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="field flex items-center justify-between gap-3 px-3 py-2.5 text-left"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="truncate text-sm font-medium">{activePreset?.name ?? t('provider.select')}</span>
          {activePreset && <span className={`chip shrink-0 ${BADGE_STYLE[activePreset.badge]}`}>{t(BADGE_KEYS[activePreset.badge])}</span>}
        </span>
        <ChevronDown size={15} className={`shrink-0 text-fg-3 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className={POPOVER} style={POPOVER_SHADOW}>
          <Command shouldFilter filter={providerFilter} loop>
            <div className="flex items-center gap-2 border-b border-line px-3">
              <Search size={14} className="shrink-0 text-fg-3" />
              <CommandInput
                placeholder={t('provider.search')}
                autoFocus
                className="w-full bg-transparent py-2.5 text-sm text-fg outline-none placeholder:text-fg-4"
              />
            </div>
            <CommandList className="scroll-thin max-h-72 overflow-y-auto p-1">
              <CommandEmpty className="px-3 py-6 text-center text-xs text-fg-3">{t('common.noMatch')}</CommandEmpty>
              <CommandGroup heading={t('provider.groupBuiltin')} className={GROUP_HEADING}>
                {builtin.map((p) => (
                  <ProviderItem key={p.id} preset={p} active={p.id === activeId} onSelect={(id) => { onSelect(id); setOpen(false) }} />
                ))}
              </CommandGroup>
              {catalogStatus === 'loading' && (
                <div className="flex items-center gap-2 px-3 py-3 text-xs text-fg-3">
                  <RefreshCw size={12} className="animate-spin" />
                  {t('provider.catalogLoading')}
                </div>
              )}
              {catalogStatus === 'error' && <div className="px-3 py-3 text-xs text-fg-3">{t('provider.catalogError')}</div>}
              {catalogStatus === 'ready' && catalog.length > 0 && (
                <CommandGroup heading={t('provider.groupCatalog', { n: catalog.length })} className={GROUP_HEADING}>
                  {catalog.map((p) => (
                    <ProviderItem key={p.id} preset={p} active={p.id === activeId} onSelect={(id) => { onSelect(id); setOpen(false) }} />
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </div>
      )}
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
  const t = useT()
  return (
    <CommandItem
      value={preset.id}
      keywords={[preset.name, preset.id]}
      onSelect={() => onSelect(preset.id)}
      className="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm text-fg-2 outline-none transition-colors aria-[selected=true]:bg-accent-soft aria-[selected=true]:text-fg"
    >
      <span className="flex min-w-0 items-center gap-2">
        {active ? <Check size={14} className="shrink-0 text-accent-text" /> : <span className="w-3.5 shrink-0" />}
        <span className="truncate">{preset.name}</span>
      </span>
      <span className={`chip shrink-0 ${BADGE_STYLE[preset.badge]}`}>{t(BADGE_KEYS[preset.badge])}</span>
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
  const t = useT()

  const source = listState.status === 'ready' ? listState.models : []
  const q = value.trim().toLowerCase()
  const filtered = q ? source.filter((m) => m.toLowerCase().includes(q)) : source

  return (
    <div ref={ref} className="relative">
      <div className="field flex overflow-hidden">
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
          placeholder={placeholder ?? t('provider.modelPlaceholder')}
          autoComplete="off"
          spellCheck={false}
          className="w-full bg-transparent px-3 py-2.5 font-mono text-[13px] text-fg outline-none placeholder:text-fg-4"
        />
        <button
          type="button"
          onClick={() => {
            setOpen(!open)
            if (!open) onOpen()
          }}
          className="flex items-center border-l border-line px-2.5 text-fg-3 transition-colors hover:bg-surface-2 hover:text-fg"
          aria-label={t('provider.expandModels')}
        >
          {listState.status === 'loading' ? (
            <RefreshCw size={14} className="animate-spin" />
          ) : (
            <ChevronDown size={15} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
          )}
        </button>
      </div>

      {open && (
        <div className={POPOVER} style={POPOVER_SHADOW}>
          {listState.status === 'loading' && (
            <div className="flex items-center gap-2 px-3 py-3.5 text-xs text-fg-3">
              <RefreshCw size={12} className="animate-spin" />
              {t('provider.fetchingModels')}
            </div>
          )}
          {listState.status === 'error' && (
            <div className="px-3 py-3 text-xs leading-relaxed text-danger">
              {t('provider.listError', { msg: listState.error })}
              {!canFetch && <span className="text-fg-3">{t('provider.listNoFetch')}</span>}
            </div>
          )}
          {listState.status !== 'loading' && filtered.length > 0 && (
            <ul className="scroll-thin max-h-64 overflow-y-auto p-1">
              {filtered.map((m) => (
                <li key={m}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(m)
                      setOpen(false)
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left font-mono text-xs text-fg-2 transition-colors hover:bg-accent-soft hover:text-fg"
                  >
                    <span className="truncate">{m}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      {visionModels.includes(m) && (
                        <span className="chip border-accent-line bg-accent-soft font-sans text-accent-text">{t('provider.vision')}</span>
                      )}
                      {m === value && <Check size={13} className="text-accent-text" />}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {listState.status === 'ready' && filtered.length === 0 && (
            <div className="px-3 py-3.5 text-xs text-fg-3">{t('provider.listNoMatch')}</div>
          )}
          {listState.status === 'idle' && !canFetch && (
            <div className="px-3 py-3.5 text-xs text-fg-3">{t('provider.listUnsupported')}</div>
          )}
        </div>
      )}
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
  const lang = useAppStore((s) => s.lang)
  const t = useT()

  const cfg = useAppStore((s) => s.configs[activeProviderId])

  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; latencyMs?: number; error?: string; errorKey?: I18nKey } | null>(null)
  const [modelList, setModelList] = useState<ModelListState>({ status: 'idle' })
  const [providerOpen, setProviderOpen] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)
  const fetchSeq = useRef(0)

  const preset = presets.find((p) => p.id === activeProviderId)
  const builtin = useMemo(() => presets.filter((p) => p.source === 'builtin'), [presets])
  const catalog = useMemo(() => presets.filter((p) => p.source === 'catalog'), [presets])

  // the preset's transport is authoritative — saved configs may carry a stale
  // kind from before the openai-compatible split
  const active = cfg
    ? { ...cfg, kind: preset?.transport ?? cfg.kind }
    : {
        id: activeProviderId,
        kind: preset?.transport ?? 'openai',
        apiKey: '',
        baseURL: preset?.defaultBaseURL ?? '',
        model: preset?.defaultModel ?? '',
      }

  const canFetchModels = (active.kind === 'openai' || active.kind === 'openai-compatible') && (preset?.needsApiKey === false || active.apiKey.trim().length > 0)

  const loadModels = useCallback(async () => {
    const seq = ++fetchSeq.current
    setModelList({ status: 'loading' })
    const res = await fetchModels(active, preset?.defaultBaseURL)
    if (seq !== fetchSeq.current) return // superseded by a newer fetch
    if (res.ok && res.models) setModelList({ status: 'ready', models: res.models })
    else setModelList({ status: 'error', error: res.errorKey ? t(res.errorKey) : (res.error ?? t('provider.fetchFailed')) })
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
      const { testConnection } = await import('../lib/llm')
      const r = await testConnection(active)
      setTestResult(r)
      if (r.ok && canFetchModels) void loadModels()
    } finally {
      setTesting(false)
    }
  }

  const visionCount = preset?.visionModels?.length ?? 0

  return (
    <Modal
      title={t('provider.title')}
      icon={<Settings2 size={16} />}
      onClose={onClose}
      closeLabel={t('common.close')}
      className="max-w-2xl"
      onEscapeKeyDown={(e) => {
        // close the innermost open layer first, like the dropdowns expect
        if (modelOpen) {
          e.preventDefault()
          setModelOpen(false)
        } else if (providerOpen) {
          e.preventDefault()
          setProviderOpen(false)
        }
      }}
      footer={
        <p className="flex items-start gap-2 text-xs leading-relaxed text-fg-3">
          <Info size={14} className="mt-px shrink-0" />
          {t('provider.bottomNote')}
        </p>
      }
    >
      <form className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
        {/* Provider */}
        <div className="sm:col-span-2">
          <label className="label mb-1.5 block">{t('provider.provider')}</label>
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
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-3">
              <span className="font-mono text-[11.5px]">{preset.defaultBaseURL || t('provider.officialEndpoint')}</span>
              {!preset.needsApiKey && <span>· {t('provider.noKeyNeeded')}</span>}
              {visionCount > 0 && <span>· {t('provider.visionCount', { n: visionCount })}</span>}
              {preset.id === 'ollama' && <span className="text-violet-500 dark:text-violet-300">· {t('provider.offline')}</span>}
            </div>
          )}
        </div>

        {/* API Key */}
        {preset?.needsApiKey !== false && (
          <div>
            <label htmlFor="provider-api-key" className="label mb-1.5 block">
              API Key
            </label>
            <div className="field flex overflow-hidden">
              <input
                id="provider-api-key"
                name="provider-api-key"
                type={showKey ? 'text' : 'password'}
                value={active.apiKey}
                onChange={(e) => {
                  updateConfig(activeProviderId, { apiKey: e.target.value })
                  setTestResult(null)
                }}
                placeholder="sk-…"
                autoComplete="off"
                spellCheck={false}
                className="min-w-0 flex-1 bg-transparent px-3 py-2.5 font-mono text-[13px] text-fg outline-none placeholder:text-fg-4"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="flex items-center border-l border-line px-2.5 text-fg-3 transition-colors hover:bg-surface-2 hover:text-fg"
                aria-label={showKey ? t('provider.hideKey') : t('provider.showKey')}
                title={showKey ? t('provider.hideKey') : t('provider.showKey')}
              >
                {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
        )}

        {/* Base URL */}
        <div className={preset?.needsApiKey === false ? 'sm:col-span-2' : ''}>
          <label htmlFor="provider-base-url" className="label mb-1.5 block">
            Base URL
          </label>
          <input
            id="provider-base-url"
            name="provider-base-url"
            type="text"
            value={active.baseURL}
            onChange={(e) => {
              updateConfig(activeProviderId, { baseURL: e.target.value })
              setTestResult(null)
            }}
            placeholder={
              lang === 'en'
                ? (preset?.baseURLPlaceholderEn ?? preset?.baseURLPlaceholder ?? t('provider.baseUrlEmpty'))
                : (preset?.baseURLPlaceholder ?? t('provider.baseUrlEmpty'))
            }
            autoComplete="off"
            spellCheck={false}
            className="field px-3 py-2.5 font-mono text-[13px]"
          />
        </div>

        {/* Model */}
        <div className="sm:col-span-2">
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="provider-model" className="label">
              {t('provider.model')}
            </label>
            {modelList.status === 'ready' && (
              <span className="flex items-center gap-1 text-xs text-ok">
                <Check size={13} />
                {t('provider.modelsFetched', { n: modelList.models.length })}
              </span>
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
            placeholder={preset?.models[0] ?? t('provider.modelPlaceholder')}
            open={modelOpen}
            setOpen={setModelOpen}
          />
          <p className="mt-1.5 text-xs text-fg-3">{t('provider.visionHint')}</p>
        </div>

        {/* CORS note */}
        {preset?.corsNote && (
          <p className="flex items-start gap-2 rounded-lg border border-line bg-surface-2/70 px-3 py-2.5 text-xs leading-relaxed text-fg-2 sm:col-span-2">
            <CircleAlert size={14} className="mt-px shrink-0 text-fg-3" />
            {lang === 'en' && preset.corsNoteEn ? preset.corsNoteEn : preset.corsNote}
          </p>
        )}

        {/* Test connection */}
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <button
            type="button"
            onClick={onTest}
            disabled={testing || !active.model.trim() || (preset?.needsApiKey !== false && !active.apiKey.trim())}
            className="btn btn-primary h-9 px-4 text-[13px]"
          >
            {testing ? <RefreshCw size={14} className="animate-spin" /> : <PlugZap size={14} />}
            {testing ? t('provider.testing') : t('provider.test')}
          </button>
          {testResult && (
            <p
              className={`fade-in flex min-w-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs ${
                testResult.ok ? 'border-ok/30 bg-ok-soft text-ok' : 'border-danger/30 bg-danger-soft text-danger'
              }`}
            >
              {testResult.ok ? <Check size={14} className="shrink-0" /> : <X size={14} className="shrink-0" />}
              <span className="min-w-0 break-words">
                {testResult.ok
                  ? t('provider.connected', { ms: testResult.latencyMs ?? 0 })
                  : testResult.errorKey
                    ? t(testResult.errorKey)
                    : (testResult.error ?? t('provider.connectFailed'))}
              </span>
            </p>
          )}
        </div>
      </form>
    </Modal>
  )
}
