export type ProviderKind = 'openai' | 'openai-compatible' | 'anthropic' | 'google'

export interface ProviderConfig {
  id: string
  kind: ProviderKind
  apiKey: string
  baseURL: string
  model: string
}

export interface VideoFileInfo {
  name: string
  sizeBytes: number
  mimeType: string
  durationSec: number
  width: number
  height: number
  frameRate: number | null
  codec: string | null
  container: string | null
  bitrate: number | null
  hasAudio: boolean
}

export interface ExtractedFrame {
  id: string
  timeSec: number
  dataUrl: string
  width: number
  height: number
  /** which tool produced it (for the UI log) */
  source?: string
}

export interface ToolActivity {
  id: string
  toolName: string
  input: unknown
  status: 'running' | 'done' | 'error'
  summary?: string
  /** nested sub-agent tool activities get a deeper level */
  depth: number
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  /** frames to render as thumbnails under this message */
  frameIds?: string[]
  /** full tool activity trace (incl. sub-agent depth>0) for the collapsible process view */
  activities?: ToolActivity[]
  error?: boolean
  pending?: boolean
}
