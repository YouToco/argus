import { useMemo, useState } from 'react'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from 'cmdk'
import { testConnection } from '../lib/providers'
import type { ProviderPreset } from '../lib/providers'
import { useAppStore } from '../store'

const BADGE_STYLE: Record<ProviderPreset['badge'], string> = {
  official: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  compatible: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  local: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  catalog: 'bg-zinc-600/30 text-zinc-300 border-zinc-600/40',
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

  function onSelect(id: string) {
    setActiveProvider(id)
    setTestResult(null)
  }

  async function onTest() {
    setTesting(true)
    setTestResult(null)
    try {
      setTestResult(await testConnection(active))
    } finally {
      setTesting(false)
    }
  }

  const visionCount = preset?.visionModels?.length ?? 0

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[6vh] overflow-y-auto" onClick={onClose}>
      <form
        className="w-full max-w-xl rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl"
        onSubmit={(e) => e.preventDefault()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-100">模型 / Provider</h2>
          <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200">
            ✕
          </button>
        </div>

        {/* Searchable combobox (search inside the dropdown) */}
        <label className="mb-1 block text-xs text-zinc-400">Provider</label>
        <Command shouldFilter filter={providerFilter} loop className="overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900">
          <div className="flex items-center gap-2 border-b border-zinc-800 px-3">
            <span className="text-zinc-500">🔍</span>
            <CommandInput
              id="provider-search"
              name="provider-search"
              placeholder={`搜索 provider…（当前：${preset?.name ?? ''}）`}
              autoFocus
              className="w-full bg-transparent py-2.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
            />
          </div>
          <CommandList className="scroll-thin max-h-[300px] overflow-y-auto p-1">
            <CommandEmpty className="px-3 py-6 text-center text-sm text-zinc-500">
              没有匹配的 provider
            </CommandEmpty>

            <CommandGroup
              heading="常用"
              className="text-xs text-zinc-500 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-zinc-500"
            >
              {builtin.map((p) => (
                <ProviderItem key={p.id} preset={p} active={p.id === activeProviderId} onSelect={onSelect} />
              ))}
            </CommandGroup>

            {catalogStatus === 'loading' && (
              <div className="px-3 py-3 text-xs text-zinc-500">正在载入 models.dev 目录…</div>
            )}

            {catalogStatus === 'error' && (
              <div className="mx-1 my-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-300">
                ⚠️ models.dev 目录不可用（离线 / 未加载）。仅显示内置 provider；本地 <b>Ollama</b> 仍可离线使用。
              </div>
            )}

            {catalogStatus === 'ready' && catalog.length > 0 && (
              <CommandGroup
                heading={`更多 provider · models.dev (${catalog.length})`}
                className="text-xs text-zinc-500 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-zinc-500"
              >
                {catalog.map((p) => (
                  <ProviderItem key={p.id} preset={p} active={p.id === activeProviderId} onSelect={onSelect} />
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>

        {preset && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded-full border px-2 py-0.5 ${BADGE_STYLE[preset.badge]}`}>
              {BADGE_LABEL[preset.badge]}
            </span>
            <span className="text-zinc-500">默认端点：{preset.defaultBaseURL || '官方'}</span>
            {!preset.needsApiKey && <span className="text-zinc-500">· 无需 API Key</span>}
            {visionCount > 0 && <span className="text-zinc-500">· {visionCount} 个视觉模型 👁️</span>}
            {preset.id === 'ollama' && <span className="text-violet-300">· 离线可用</span>}
          </div>
        )}

        {/* API Key */}
        {preset?.needsApiKey !== false && (
          <>
            <label htmlFor="provider-api-key" className="mb-1 mt-4 block text-xs text-zinc-400">API Key</label>
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
                placeholder="sk-… / AIza… / Bearer token"
                autoComplete="off"
                spellCheck={false}
                className="flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="rounded-md border border-zinc-700 px-3 text-xs text-zinc-400 hover:bg-zinc-800"
              >
                {showKey ? '隐藏' : '显示'}
              </button>
            </div>
          </>
        )}

        {/* Base URL */}
        <label htmlFor="provider-base-url" className="mb-1 mt-4 block text-xs text-zinc-400">Base URL</label>
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
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500"
        />

        {/* Model */}
        <label htmlFor="provider-model" className="mb-1 mt-4 block text-xs text-zinc-400">模型</label>
        <input
          id="provider-model"
          name="provider-model"
          list="provider-model-options"
          type="text"
          value={active.model}
          onChange={(e) => {
            updateConfig(activeProviderId, { model: e.target.value })
            setTestResult(null)
          }}
          placeholder={preset?.models[0] ?? '模型名'}
          autoComplete="off"
          spellCheck={false}
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500"
        />
        {preset && preset.models.length > 0 && (
          <datalist id="provider-model-options">
            {preset.models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        )}
        <p className="mt-1 text-xs text-zinc-500">
          可从下拉建议中选择，或输入自定义模型名
          {preset?.visionModels && preset.visionModels.length > 0 && (
            <span className="text-zinc-400"> · 👁️ 视觉模型已优先：{preset.visionModels.slice(0, 3).join(' / ')}{preset.visionModels.length > 3 ? '…' : ''}</span>
          )}
        </p>

        {/* CORS note */}
        {preset?.corsNote && (
          <p className="mt-3 rounded-md bg-zinc-900/60 px-3 py-2 text-xs leading-relaxed text-zinc-400">
            {preset.corsNote}
          </p>
        )}

        {/* Test connection */}
        <button
          type="button"
          onClick={onTest}
          disabled={testing || !active.model.trim() || (preset?.needsApiKey !== false && !active.apiKey.trim())}
          className="mt-3 w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {testing ? '测试中…' : '测试连接'}
        </button>
        {testResult && (
          <p
            className={`mt-2 rounded-md px-3 py-2 text-xs leading-relaxed ${
              testResult.ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-400'
            }`}
          >
            {testResult.ok ? `✅ 连接成功（${testResult.latencyMs}ms）` : `❌ ${testResult.error ?? '连接失败'}`}
          </p>
        )}

        <p className="mt-3 text-xs leading-relaxed text-zinc-600">
          密钥与配置只保存在本机浏览器 localStorage，不会上传到任何服务器；请求由浏览器直发你填写的端点。
          provider 列表来自 <span className="text-zinc-500">models.dev</span>（@ai-sdk），大部分走 OpenAI 兼容协议，Anthropic / Gemini 用各自官方 SDK。
        </p>
      </form>
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
      className="mx-1 flex cursor-pointer items-center justify-between gap-2 rounded-md px-3 py-2 text-sm text-zinc-200 outline-none transition aria-selected:bg-amber-500/15 aria-selected:text-amber-200 data-[selected]:bg-amber-500/15"
    >
      <span className="flex min-w-0 items-center gap-2">
        {active && <span className="text-amber-400">●</span>}
        <span className="truncate">{preset.name}</span>
      </span>
      <span className={`shrink-0 rounded-full border px-1.5 py-0 text-[10px] leading-4 ${BADGE_STYLE[preset.badge]}`}>
        {BADGE_LABEL[preset.badge]}
      </span>
    </CommandItem>
  )
}
