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
  'app.historyTip': '历史记录（本地持久化）',

  'video.loading': '正在加载…',
  'video.reloadToContinue': '重新载入 {name} 以继续分析',
  'video.dropHint': '拖入或点击选择本地视频',
  'video.dropError': '请拖入视频文件',
  'video.loadFailed': '视频加载失败',
  'video.transcodeDownload': '正在下载内置转码器（ffmpeg.wasm，约 11MB，仅首次）…',
  'video.transcoding': '正在浏览器本地转码为 MP4… {pct}%（不上传）',
  'video.transcodeFailed': '浏览器无法直接解码该格式，内置转码也失败：{msg}',
  'video.transcodeDone': '转码完成，正在加载…',

  'info.size': '大小',
  'info.duration': '时长',
  'info.resolution': '分辨率',
  'info.fps': '帧率',
  'info.codec': '编码',
  'info.container': '容器',
  'info.bitrate': '码率',
  'info.audio': '音频',
  'info.audioYes': '有',

  'chat.needApiKey': '请先在右上角「配置模型」里填写 API Key',
  'chat.needModel': '请填写模型名称',
  'chat.needVideo': '请先在左侧载入一个视频',
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

  'process.working': '正在分析',
  'process.done': '工作过程',
  'process.subagents': ' · {n} 个子代理步骤',
  'process.running': ' · {n} 个进行中',
  'process.waiting': '等待中…',

  'frames.empty': 'agent 抽取的关键帧会出现在这里，点击可放大查看',

  'history.empty': '还没有分析记录',
  'history.confirmDelete': '确认删除',
  'history.cancel': '取消',
  'history.restore': '恢复',
  'history.deleteTip': '删除该记录',
  'history.wipeConfirm': '确认清空全部',
  'history.wipeAll': '清空全部',

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

  'app.subtitle': '长视频理解 · 视频不出浏览器',
  'app.analyzing': '分析中',
  'app.history': '历史',
  'app.language': '界面语言',
  'app.modelSettings': '模型配置',
  'app.setupModel': '配置模型',

  'theme.label': '主题',
  'theme.system': '跟随系统',
  'theme.light': '浅色',
  'theme.dark': '深色',

  'common.close': '关闭',
  'common.noMatch': '没有匹配项',

  'video.title': '视频',
  'video.formats': 'MP4 · MOV · MKV · WebM · AVI 等，文件不会离开浏览器',
  'video.trySample': '没有视频？用示例视频试试',
  'video.sampleLoading': '正在下载示例视频…',
  'video.replace': '更换',
  'video.replaceTip': '换一个视频（开始新的分析）',
  'video.closeTip': '关闭视频并清空当前分析',
  'video.dropToReplace': '松开即可换成这个视频',

  'player.play': '播放',
  'player.pause': '暂停',
  'player.mute': '静音',
  'player.unmute': '取消静音',
  'player.timeline': '播放进度',
  'player.markers': '{n} 处已查看',

  'info.audioNo': '无',
  'info.ready': '已就绪',
  'info.detached': '文件未载入',
  'info.detachedNote': '已恢复元数据，帧与记忆都还在；重新载入同一文件即可继续。',

  'empty.title': '让 Argus 帮你看视频',
  'empty.step1': '配置模型',
  'empty.step1Desc': '填入任意 provider 的 API Key，推荐带视觉能力的模型。',
  'empty.step1Done': '已连接 {name}',
  'empty.step1Action': '去配置',
  'empty.step2': '载入视频',
  'empty.step2Desc': '在左侧拖入本地视频，或先用示例视频体验。',
  'empty.step2Done': '视频已就绪，可以在左侧预览。',
  'empty.step3': '描述需求',
  'empty.step3Desc': '一句话说清要找什么，结论会附上关键帧和时间戳。',
  'empty.tryAsking': '可以这样问',

  'example.timeline': '概述视频内容，按时间列出关键事件',
  'example.count': '画面里一共出现过几个人？',
  'example.find': '红色物品第一次出现在什么时候？',
  'example.text': '画面里有没有文字？读出来并标出时间',

  'chat.placeholderNoVideo': '先在左侧载入视频，再描述你要分析的需求…',
  'chat.restored': '已从本地历史恢复 · 重新载入 {name} 以继续分析',
  'chat.evidence': '证据帧 · {n}',
  'chat.sendKey': '发送',
  'chat.newlineKey': '换行',

  'process.steps': '{n} 步',
  'process.errors': '{n} 个出错',
  'process.sub': '子代理',
  'process.input': '输入',
  'process.result': '结果',

  'frames.title': '抽帧',
  'frames.open': '查看 {time} 的帧',

  'lightbox.prev': '上一帧',
  'lightbox.next': '下一帧',
  'lightbox.jump': '跳到此刻',
  'lightbox.missing': '这帧已不在内存中',

  'history.title': '历史记录',
  'history.emptyDesc': '每次分析都会自动保存在本机浏览器里。',
  'history.active': '当前',
  'history.msgs': '{n} 条消息',
  'history.restoring': '恢复中…',
  'history.storageNote': '保存在浏览器 IndexedDB，不会上传',

  'provider.title': '模型配置',
  'provider.provider': '服务商',
  'provider.model': '模型',
  'provider.showKey': '显示密钥',
  'provider.hideKey': '隐藏密钥',
  'provider.test': '测试连接',
  'provider.testing': '测试中…',
  'provider.connected': '已连接 · {ms}ms',
  'provider.modelsFetched': '已拉取 {n} 个模型',
  'provider.fetchingModels': '正在拉取模型列表…',
  'provider.catalogLoading': '正在加载 models.dev 目录…',
  'provider.catalogError': 'models.dev 目录加载失败，仅显示常用服务商',
  'provider.noKeyNeeded': '无需密钥',
  'provider.visionCount': '{n} 个视觉模型',
  'provider.offline': '可离线',
  'provider.vision': '视觉',
  'provider.visionHint': '需要能看图的视觉模型，纯文本模型看不到抽出的帧。',
} as const

export type I18nKey = keyof typeof zh

const en: Record<I18nKey, string> = {
  'app.historyTip': 'History (persisted locally)',

  'video.loading': 'Loading…',
  'video.reloadToContinue': 'Reload {name} to continue',
  'video.dropHint': 'Drop a video here or click to browse',
  'video.dropError': 'Please drop a video file',
  'video.loadFailed': 'Failed to load video',
  'video.transcodeDownload': 'Downloading the built-in transcoder (ffmpeg.wasm, ~11MB, first time only)…',
  'video.transcoding': 'Transcoding to MP4 locally in your browser… {pct}% (never uploaded)',
  'video.transcodeFailed': "The browser can't decode this format and the built-in transcode also failed: {msg}",
  'video.transcodeDone': 'Transcode complete, loading…',

  'info.size': 'Size',
  'info.duration': 'Duration',
  'info.resolution': 'Resolution',
  'info.fps': 'Frame rate',
  'info.codec': 'Codec',
  'info.container': 'Container',
  'info.bitrate': 'Bitrate',
  'info.audio': 'Audio',
  'info.audioYes': 'Yes',

  'chat.needApiKey': 'Open “Set up model” (top right) and enter an API key first',
  'chat.needModel': 'Please enter a model name',
  'chat.needVideo': 'Load a video on the left first',
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

  'process.working': 'Analyzing',
  'process.done': 'Process',
  'process.subagents': ' · {n} subagent steps',
  'process.running': ' · {n} running',
  'process.waiting': 'waiting…',

  'frames.empty': 'Frames the agent extracts appear here — click one to enlarge',

  'history.empty': 'No analyses yet',
  'history.confirmDelete': 'Confirm delete',
  'history.cancel': 'Cancel',
  'history.restore': 'Restore',
  'history.deleteTip': 'Delete this record',
  'history.wipeConfirm': 'Confirm wipe all',
  'history.wipeAll': 'Wipe all',

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

  'app.subtitle': 'Long-video understanding · your video never leaves the browser',
  'app.analyzing': 'Analyzing',
  'app.history': 'History',
  'app.language': 'Interface language',
  'app.modelSettings': 'Model settings',
  'app.setupModel': 'Set up model',

  'theme.label': 'Theme',
  'theme.system': 'System',
  'theme.light': 'Light',
  'theme.dark': 'Dark',

  'common.close': 'Close',
  'common.noMatch': 'No matches',

  'video.title': 'Video',
  'video.formats': 'MP4 · MOV · MKV · WebM · AVI… the file never leaves your browser',
  'video.trySample': 'No video handy? Try the sample',
  'video.sampleLoading': 'Downloading the sample video…',
  'video.replace': 'Replace',
  'video.replaceTip': 'Open another video (starts a new analysis)',
  'video.closeTip': 'Close the video and clear this analysis',
  'video.dropToReplace': 'Drop to switch to this video',

  'player.play': 'Play',
  'player.pause': 'Pause',
  'player.mute': 'Mute',
  'player.unmute': 'Unmute',
  'player.timeline': 'Playback position',
  'player.markers': '{n} inspected',

  'info.audioNo': 'None',
  'info.ready': 'Ready',
  'info.detached': 'File not loaded',
  'info.detachedNote': 'Metadata restored; frames and notes are intact. Reload the same file to continue.',

  'empty.title': 'Let Argus watch it for you',
  'empty.step1': 'Set up a model',
  'empty.step1Desc': 'Paste an API key for any provider — a vision-capable model is recommended.',
  'empty.step1Done': 'Connected to {name}',
  'empty.step1Action': 'Set up',
  'empty.step2': 'Load a video',
  'empty.step2Desc': 'Drop a local video on the left, or try the sample first.',
  'empty.step2Done': 'Video ready — preview it on the left.',
  'empty.step3': 'Ask',
  'empty.step3Desc': 'Say what to look for in one sentence; answers come with key frames and timestamps.',
  'empty.tryAsking': 'Try asking',

  'example.timeline': 'Summarize the video as a timeline of key events',
  'example.count': 'How many people appear in total?',
  'example.find': 'When does a red object first appear?',
  'example.text': 'Is there any text on screen? Read it out with timestamps',

  'chat.placeholderNoVideo': 'Load a video on the left, then describe what to analyze…',
  'chat.restored': 'Restored from local history · reload {name} to continue',
  'chat.evidence': 'Evidence frames · {n}',
  'chat.sendKey': 'send',
  'chat.newlineKey': 'new line',

  'process.steps': '{n} steps',
  'process.errors': '{n} failed',
  'process.sub': 'sub',
  'process.input': 'Input',
  'process.result': 'Result',

  'frames.title': 'Frames',
  'frames.open': 'View frame at {time}',

  'lightbox.prev': 'Previous frame',
  'lightbox.next': 'Next frame',
  'lightbox.jump': 'Jump to this moment',
  'lightbox.missing': 'This frame is no longer in memory',

  'history.title': 'History',
  'history.emptyDesc': 'Every analysis is saved automatically in this browser.',
  'history.active': 'Current',
  'history.msgs': '{n} messages',
  'history.restoring': 'Restoring…',
  'history.storageNote': 'Stored in browser IndexedDB · never uploaded',

  'provider.title': 'Model settings',
  'provider.provider': 'Provider',
  'provider.model': 'Model',
  'provider.showKey': 'Show key',
  'provider.hideKey': 'Hide key',
  'provider.test': 'Test connection',
  'provider.testing': 'Testing…',
  'provider.connected': 'Connected · {ms}ms',
  'provider.modelsFetched': '{n} models fetched',
  'provider.fetchingModels': 'Fetching models…',
  'provider.catalogLoading': 'Loading the models.dev catalog…',
  'provider.catalogError': 'Couldn\u2019t load models.dev — showing curated providers only',
  'provider.noKeyNeeded': 'no key needed',
  'provider.visionCount': '{n} vision models',
  'provider.offline': 'works offline',
  'provider.vision': 'vision',
  'provider.visionHint': 'Use a vision model — text-only models can\u2019t see the extracted frames.',
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
