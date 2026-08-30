import { useState } from 'react'
import { PROVIDER_PRESETS } from '../lib/providers'
import type { ProviderKind } from '../types'
import { useAppStore } from '../store'

export function ProviderPanel({ onClose }: { onClose: () => void }) {
  const providers = useAppStore((s) => s.providers)
  const activeProviderId = useAppStore((s) => s.activeProviderId)
  const setActiveProvider = useAppStore((s) => s.setActiveProvider)
  const updateProvider = useAppStore((s) => s.updateProvider)
  const [showKey, setShowKey] = useState(false)

  const kinds = Object.keys(PROVIDER_PRESETS) as ProviderKind[]
  const active = providers.find((p) => p.id === activeProviderId) ?? providers[0]
  const preset = PROVIDER_PRESETS[active.kind]

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[10vh]" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-100">模型 / Provider 配置</h2>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200">
            ✕
          </button>
        </div>

        <div className="mb-4 flex gap-1 rounded-lg bg-zinc-900 p-1">
          {kinds.map((k) => (
            <button
              key={k}
              onClick={() => setActiveProvider(k)}
              className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition ${
                active.kind === k ? 'bg-amber-500/20 text-amber-300' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {PROVIDER_PRESETS[k].name}
            </button>
          ))}
        </div>

        <label className="mb-1 block text-xs text-zinc-400">API Key</label>
        <div className="mb-3 flex gap-2">
          <input
            type={showKey ? 'text' : 'password'}
            value={active.apiKey}
            onChange={(e) => updateProvider(active.id, { apiKey: e.target.value })}
            placeholder="sk-… / AIza…"
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

        <label className="mb-1 block text-xs text-zinc-400">Base URL</label>
        <input
          type="text"
          value={active.baseURL}
          onChange={(e) => updateProvider(active.id, { baseURL: e.target.value })}
          placeholder={preset.baseURLPlaceholder}
          autoComplete="off"
          spellCheck={false}
          className="mb-3 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500"
        />

        <label className="mb-1 block text-xs text-zinc-400">模型</label>
        <input
          type="text"
          value={active.model}
          onChange={(e) => updateProvider(active.id, { model: e.target.value })}
          placeholder={preset.modelHint}
          autoComplete="off"
          spellCheck={false}
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500"
        />

        <p className="mt-3 text-xs leading-relaxed text-zinc-500">{preset.corsNote}</p>
        <p className="mt-2 text-xs leading-relaxed text-zinc-600">
          密钥与配置只保存在本机浏览器 localStorage，不会上传到任何服务器；请求由浏览器直发你填写的端点。
        </p>
      </div>
    </div>
  )
}
