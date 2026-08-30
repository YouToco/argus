import { useState } from 'react'
import { PROVIDER_PRESETS, getPreset, testConnection } from '../lib/providers'
import type { ProviderConfig } from '../types'
import { useAppStore } from '../store'

const BADGE_STYLE: Record<string, string> = {
  official: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  compatible: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  local: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
}

const BADGE_LABEL: Record<string, string> = {
  official: '官方',
  compatible: '兼容端点',
  local: '本地',
}

export function ProviderPanel({ onClose }: { onClose: () => void }) {
  const providers = useAppStore((s) => s.providers)
  const activeProviderId = useAppStore((s) => s.activeProviderId)
  const setActiveProvider = useAppStore((s) => s.setActiveProvider)
  const updateProvider = useAppStore((s) => s.updateProvider)

  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; latencyMs?: number; error?: string } | null>(null)

  const active = providers.find((p) => p.id === activeProviderId) ?? providers[0]
  const preset = getPreset(active.id)

  function onSelect(id: string) {
    setActiveProvider(id)
    setTestResult(null)
  }

  async function onTest() {
    const cfg = providers.find((p) => p.id === activeProviderId) ?? providers[0]
    setTesting(true)
    setTestResult(null)
    try {
      setTestResult(await testConnection(cfg))
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[8vh]" onClick={onClose}>
      <div
        className="w-full max-w-xl rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-100">模型 / Provider</h2>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200">
            ✕
          </button>
        </div>

        {/* Provider selector */}
        <label className="mb-1 block text-xs text-zinc-400">Provider</label>
        <div className="mb-4">
          <select
            id="provider-select"
            name="provider-select"
            value={active.id}
            onChange={(e) => onSelect(e.target.value)}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500"
          >
            {PROVIDER_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </select>

          {preset && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className={`rounded-full border px-2 py-0.5 ${BADGE_STYLE[preset.badge]}`}>
                {BADGE_LABEL[preset.badge]}
              </span>
              <span className="text-zinc-500">默认端点：{preset.defaultBaseURL || '官方'}</span>
              {!preset.needsApiKey && <span className="text-zinc-500">· 无需 API Key</span>}
            </div>
          )}
        </div>

        {/* API Key */}
        {preset?.needsApiKey !== false && (
          <>
            <label className="mb-1 block text-xs text-zinc-400">API Key</label>
            <div className="mb-3 flex gap-2">
              <input
                id="provider-api-key"
                name="provider-api-key"
                type={showKey ? 'text' : 'password'}
                value={active.apiKey}
                onChange={(e) => {
                  updateProvider(active.id, { apiKey: e.target.value })
                  setTestResult(null)
                }}
                placeholder="sk-… / AIza… / Bearer token"
                autoComplete="off"
                spellCheck={false}
                className="flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500"
              />
              <button
                onClick={() => setShowKey((v) => !v)}
                className="rounded-md border border-zinc-700 px-3 text-xs text-zinc-400 hover:bg-zinc-800"
              >
                {showKey ? '隐藏' : '显示'}
              </button>
            </div>
          </>
        )}

        {/* Base URL */}
        <label className="mb-1 block text-xs text-zinc-400">Base URL</label>
        <input
          id="provider-base-url"
          name="provider-base-url"
          type="text"
          value={active.baseURL}
          onChange={(e) => {
            updateProvider(active.id, { baseURL: e.target.value })
            setTestResult(null)
          }}
          placeholder={preset?.baseURLPlaceholder ?? '留空使用官方端点'}
          autoComplete="off"
          spellCheck={false}
          className="mb-3 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500"
        />

        {/* Model */}
        <label className="mb-1 block text-xs text-zinc-400">模型</label>
        <input
          id="provider-model"
          name="provider-model"
          list="provider-model-options"
          type="text"
          value={active.model}
          onChange={(e) => {
            updateProvider(active.id, { model: e.target.value })
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
        <p className="mt-1 text-xs text-zinc-500">可从下拉建议中选择，或输入自定义模型名</p>

        {/* CORS note */}
        {preset?.corsNote && (
          <p className="mt-3 rounded-md bg-zinc-900/60 px-3 py-2 text-xs leading-relaxed text-zinc-400">
            {preset.corsNote}
          </p>
        )}

        {/* Test connection */}
        <button
          onClick={onTest}
          disabled={testing || !active.model.trim()}
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
            {testResult.ok
              ? `✅ 连接成功（${testResult.latencyMs}ms）`
              : `❌ ${testResult.error ?? '连接失败'}`}
          </p>
        )}

        <p className="mt-3 text-xs leading-relaxed text-zinc-600">
          密钥与配置只保存在本机浏览器 localStorage，不会上传到任何服务器；请求由浏览器直发你填写的端点。
          列出的大多数 provider 走 OpenAI 兼容协议（同一 SDK），Anthropic / Gemini 用各自官方 SDK。
        </p>
      </div>
    </div>
  )
}
