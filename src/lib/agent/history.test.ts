import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '../../types'
import { HISTORY_ANSWER_CHARS, HISTORY_TURNS, priorTurns } from './history'

const q = (content: string): ChatMessage => ({ id: content, role: 'user', content })
const a = (content: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({ id: content, role: 'assistant', content, ...extra })

describe('prior turns for a follow-up', () => {
  it('carries earlier question/answer pairs as text', () => {
    expect(priorTurns([q('what happens?'), a('a blue square at 100.0s')])).toEqual([
      { role: 'user', content: 'what happens?' },
      { role: 'assistant', content: 'a blue square at 100.0s' },
    ])
  })

  it('skips failed, unfinished and empty answers', () => {
    const msgs = [q('q1'), a('❌ error', { error: true }), q('q2'), a('', { pending: true }), q('q3'), a('  '), q('q4'), a('ok')]
    expect(priorTurns(msgs).map((m) => m.content)).toEqual(['q4', 'ok'])
  })

  it('keeps only the latest turns and clips long answers', () => {
    const msgs = Array.from({ length: HISTORY_TURNS + 2 }, (_, i) => [q(`q${i}`), a(`a${i}`)]).flat()
    expect(priorTurns(msgs)).toHaveLength(HISTORY_TURNS * 2)
    expect(priorTurns(msgs)[0].content).toBe('q2')
    const long = priorTurns([q('q'), a('x'.repeat(HISTORY_ANSWER_CHARS + 50))])[1].content as string
    expect(long).toHaveLength(HISTORY_ANSWER_CHARS + 1)
  })
})
