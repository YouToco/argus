import { useCallback } from 'react'
import { useAppStore } from '../store'

export type Lang = 'zh' | 'en'

export const LANG_KEY = 'argus:lang'

/** Stored choice wins; otherwise infer from the browser language. */
export function initialLang(): Lang {
  try {
    const stored = localStorage.getItem(LANG_KEY)
    if (stored === 'zh' || stored === 'en') return stored
  } catch {
    /* storage may be unavailable */
  }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('zh')
    ? 'zh'
    : 'en'
}

const zh = {
  'app.tagline': '长视频理解',
  'app.historyTip': '历史记录（本地持久化）',

  'video.loading': '正在加载…',
  'video.reloadToContinue': '重新加载视频文件以继续分析',
  'video.dropHint': '点击或拖入本地视频（支持 MP4 / MKV / WebM / AVI 等）',
  'video.dropError': '请拖入视频文件',
  'video.loadFailed': '视频加载失败',
  'video.transcodeDownload': '正在下载内置转码器（ffmpeg.wasm，约 11MB，仅首次）…',
  'video.transcoding': '正在浏览器本地转码为 MP4… {pct}%（不上传）',
  'video.transcodeFailed': '浏览器无法直接解码该格式，内置转码也失败：{msg}',
  'video.transcodeDone': '转码完成，正在加载…',

  'info.name': '文件名',
  'info.size': '大小',
  'info.duration': '时长',
  'info.resolution': '分辨率',
  'info.fps': '帧率',
  'info.codec': '编码',
  'info.container': '容器',
  'info.bitrate': '码率',
  'info.audio': '音频',
  'info.audioYes': '有',

  'chat.needApiKey': '请先点击右上角「模型配置」填写 API Key',
  'chat.needModel': '请填写模型名称',
  'chat.needVideo': '请先在左侧加载一个视频文件',
  'chat.modelInitFailed': '模型初始化失败：{msg}',
  'chat.stopped': '（已停止）',
  'chat.runError': '❌ 出错：{msg}',
  'chat.corsHint':
    '若为 CORS / fetch 错误，通常是该端点不允许浏览器直连；请检查 baseURL 或改用支持浏览器直连的端点（见右上角配置说明）。',
  'chat.backToBottom': '回到底部',
  'chat.placeholder': '描述你要分析的需求，例如：数一下这段监控视频里一共有几个人 / 找出画面里的红色物品…',
  'chat.send': '发送',
  'chat.stop': '停止',
  'chat.thinking': '思考中…',
  'chat.thinkingInline': '思考中',
  'chat.calling': '正在调用',
  'chat.subagentSuffix': ' · 子代理',
  'chat.emptyDesc':
    '加载视频后，用一句话描述需求。agent 会自动了解视频信息、按需抽帧观察、记录状态，必要时派子代理细看长片段、放大确认细节。',
  'chat.errorMark': '（出错）',

  'process.working': '进行中 · {n} 步',
  'process.done': '过程 · {n} 步',
  'process.subagents': ' · {n} 子代理',
  'process.running': ' · {n} 运行中',
  'process.waiting': '等待中…',

  'frames.empty': '抽帧结果会显示在这里',

  'history.aria': '历史记录',
  'history.close': '关闭',
  'history.empty': '暂无历史记录',
  'history.confirmDelete': '确认删除',
  'history.cancel': '取消',
  'history.restore': '恢复',
  'history.deleteTip': '删除该记录',
  'history.wipeConfirm': '确认清空全部',
  'history.wipeAll': '清空全部',

  'provider.aria': '模型配置',
  'provider.close': '关闭',
  'provider.select': '选择 provider',
  'provider.search': '搜索 provider…',
  'provider.groupBuiltin': '常用',
  'provider.groupCatalog': '更多 · models.dev ({n})',
  'provider.modelPlaceholder': '模型名',
  'provider.expandModels': '展开模型列表',
  'provider.listError': '模型列表拉取失败：{msg}',
  'provider.listNoFetch': '（该 provider 不支持自动拉取，可直接输入模型名）',
  'provider.listNoMatch': 'no match · 直接回车使用当前输入',
  'provider.listUnsupported': '该 provider 不支持拉取 · 手动输入模型名',
  'provider.fetchFailed': '拉取失败',
  'provider.connectFailed': '连接失败',
  'provider.officialEndpoint': '官方端点',
  'provider.baseUrlEmpty': '留空使用官方端点',
  'provider.bottomNote':
    '密钥与配置只保存在本机浏览器 localStorage，不会上传到任何服务器；请求由浏览器直发你填写的端点。provider 列表来自 models.dev（@ai-sdk），大部分走 OpenAI 兼容协议，Anthropic / Gemini 用各自官方 SDK。',
  'provider.badge.official': '官方',
  'provider.badge.compatible': '兼容',
  'provider.badge.local': '本地',
  'provider.badge.catalog': 'models.dev',
  'provider.error.cors':
    '跨域/CORS 失败：该端点不允许浏览器直连。请检查 baseURL 或改用支持直连的 provider。',
  'provider.error.corsList': '跨域/CORS 失败：该端点不允许浏览器直连拉取列表。',
  'provider.error.unsupportedFetch': '该 provider 类型不支持拉取模型列表',
  'provider.error.noBaseUrl': '请先填写 Base URL',
  'provider.error.emptyModels': '端点返回了空模型列表',
} as const

export type I18nKey = keyof typeof zh

const en: Record<I18nKey, string> = {
  'app.tagline': 'long-video understanding',
  'app.historyTip': 'History (persisted locally)',

  'video.loading': 'Loading…',
  'video.reloadToContinue': 'Reload the video file to continue analysis',
  'video.dropHint': 'Click or drop a local video (MP4 / MKV / WebM / AVI…)',
  'video.dropError': 'Please drop a video file',
  'video.loadFailed': 'Failed to load video',
  'video.transcodeDownload': 'Downloading the built-in transcoder (ffmpeg.wasm, ~11MB, first time only)…',
  'video.transcoding': 'Transcoding to MP4 locally in your browser… {pct}% (never uploaded)',
  'video.transcodeFailed': "The browser can't decode this format and the built-in transcode also failed: {msg}",
  'video.transcodeDone': 'Transcode complete, loading…',

  'info.name': 'Name',
  'info.size': 'Size',
  'info.duration': 'Duration',
  'info.resolution': 'Resolution',
  'info.fps': 'Frame rate',
  'info.codec': 'Codec',
  'info.container': 'Container',
  'info.bitrate': 'Bitrate',
  'info.audio': 'Audio',
  'info.audioYes': 'Yes',

  'chat.needApiKey': 'Open the model settings (top right) and enter an API key first',
  'chat.needModel': 'Please enter a model name',
  'chat.needVideo': 'Load a video file on the left first',
  'chat.modelInitFailed': 'Failed to initialize the model: {msg}',
  'chat.stopped': '(stopped)',
  'chat.runError': '❌ Error: {msg}',
  'chat.corsHint':
    'If this is a CORS / fetch error, the endpoint usually does not allow direct browser access — check the baseURL or use an endpoint that supports direct browser access (see the settings panel, top right).',
  'chat.backToBottom': 'Back to bottom',
  'chat.placeholder':
    'Describe what you want to analyze, e.g. count how many people appear in this surveillance video / find red objects in the scene…',
  'chat.send': 'Send',
  'chat.stop': 'Stop',
  'chat.thinking': 'thinking…',
  'chat.thinkingInline': 'thinking',
  'chat.calling': 'calling',
  'chat.subagentSuffix': ' · subagent',
  'chat.emptyDesc':
    'Load a video, then describe your goal in one sentence. The agent learns the video metadata, extracts frames on demand, keeps notes, and can spawn subagents to scan long segments or zoom into details.',
  'chat.errorMark': '(error)',

  'process.working': 'working · {n} steps',
  'process.done': 'process · {n} steps',
  'process.subagents': ' · {n} subagent',
  'process.running': ' · {n} running',
  'process.waiting': 'waiting…',

  'frames.empty': 'Frames extracted by the agent appear here',

  'history.aria': 'History',
  'history.close': 'Close',
  'history.empty': 'No history yet',
  'history.confirmDelete': 'Confirm delete',
  'history.cancel': 'Cancel',
  'history.restore': 'Restore',
  'history.deleteTip': 'Delete this record',
  'history.wipeConfirm': 'Confirm wipe all',
  'history.wipeAll': 'Wipe all',

  'provider.aria': 'Model settings',
  'provider.close': 'Close',
  'provider.select': 'Select a provider',
  'provider.search': 'Search providers…',
  'provider.groupBuiltin': 'Curated',
  'provider.groupCatalog': 'More · models.dev ({n})',
  'provider.modelPlaceholder': 'Model name',
  'provider.expandModels': 'Expand model list',
  'provider.listError': 'Failed to fetch the model list: {msg}',
  'provider.listNoFetch': "(This provider doesn't support auto-fetch — enter a model name manually)",
  'provider.listNoMatch': 'no match · press Enter to use the current input',
  'provider.listUnsupported': "This provider doesn't support fetching · enter a model name manually",
  'provider.fetchFailed': 'Fetch failed',
  'provider.connectFailed': 'Connection failed',
  'provider.officialEndpoint': 'official endpoint',
  'provider.baseUrlEmpty': 'Leave empty for the official endpoint',
  'provider.bottomNote':
    'Keys and configs are stored only in this browser\u2019s localStorage and are never uploaded to any server; requests go directly from your browser to the endpoint you provide. The provider list comes from models.dev (@ai-sdk) — most use the OpenAI-compatible protocol, while Anthropic / Gemini use their official SDKs.',
  'provider.badge.official': 'official',
  'provider.badge.compatible': 'compatible',
  'provider.badge.local': 'local',
  'provider.badge.catalog': 'models.dev',
  'provider.error.cors':
    'CORS failure: this endpoint does not allow direct browser access. Check the baseURL or switch to a provider that supports direct access.',
  'provider.error.corsList': 'CORS failure: this endpoint does not allow fetching the model list from a browser.',
  'provider.error.unsupportedFetch': 'This provider type does not support fetching the model list',
  'provider.error.noBaseUrl': 'Enter a Base URL first',
  'provider.error.emptyModels': 'The endpoint returned an empty model list',
}

const dicts: Record<Lang, Record<I18nKey, string>> = { zh, en }

export type TParams = Record<string, string | number>

export function translate(lang: Lang, key: I18nKey, params?: TParams): string {
  const s = dicts[lang][key] ?? zh[key] ?? key
  if (!params) return s
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m))
}

/** React hook: re-renders on language switch, returns a t(key, params?) translator. */
export function useT() {
  const lang = useAppStore((s) => s.lang)
  return useCallback((key: I18nKey, params?: TParams) => translate(lang, key, params), [lang])
}
