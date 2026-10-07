import type { ModelMessage } from 'ai'
import type { ChatMessage } from '../../types'

/** how many earlier question/answer pairs a new question carries */
export const HISTORY_TURNS = 3
/** longer answers are clipped — the frames behind them are not resent anyway */
export const HISTORY_ANSWER_CHARS = 4000

/**
 * Earlier questions and answers in this session, as text only — the frames
 * behind them are long gone from context — so a follow-up like "the blue
 * square you mentioned" has something to resolve against. Failed or
 * unfinished answers are skipped. Type-only imports: this file must not pull
 * the AI SDK into the first load.
 */
export function priorTurns(messages: ChatMessage[]): ModelMessage[] {
  const turns: ModelMessage[][] = []
  for (let i = 0; i + 1 < messages.length; i++) {
    const [q, a] = [messages[i], messages[i + 1]]
    if (q.role !== 'user' || a.role !== 'assistant' || a.error || a.pending || !a.content.trim()) continue
    const answer = a.content.length > HISTORY_ANSWER_CHARS ? `${a.content.slice(0, HISTORY_ANSWER_CHARS)}…` : a.content
    turns.push([
      { role: 'user', content: q.content },
      { role: 'assistant', content: answer },
    ])
  }
  return turns.slice(-HISTORY_TURNS).flat()
}
