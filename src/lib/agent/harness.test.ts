import { describe, expect, it } from 'vitest'
import type { ModelMessage } from 'ai'
import { KEEP_IMAGE_BATCHES, pruneOldImages } from './harness'

function textMsg(text: string): ModelMessage {
  return { role: 'user', content: text }
}

function imageBatch(n: number): ModelMessage {
  return {
    role: 'user',
    content: [
      { type: 'text', text: `batch ${n} 的帧图：` },
      { type: 'image', image: 'AAAA', mediaType: 'image/jpeg' },
    ],
  }
}

describe('pruneOldImages', () => {
  it('leaves history untouched when image batches <= KEEP', () => {
    const msgs: ModelMessage[] = [textMsg('需求'), imageBatch(1), imageBatch(2)]
    const out = pruneOldImages(msgs)
    expect(out).toBe(msgs) // same reference, no copy
  })

  it('replaces older image parts with a text pointer, keeps the last KEEP batches', () => {
    const total = KEEP_IMAGE_BATCHES + 2
    const msgs: ModelMessage[] = [textMsg('需求'), ...Array.from({ length: total }, (_, i) => imageBatch(i + 1))]
    const out = pruneOldImages(msgs)

    for (let i = 1; i <= total; i++) {
      const m = out[i]
      const parts = m.content as Array<{ type: string; text?: string }>
      const images = parts.filter((p) => p.type === 'image')
      const placeholders = parts.filter(
        (p) => p.type === 'text' && typeof p.text === 'string' && p.text.includes('已从上下文省略'),
      )
      if (i <= total - KEEP_IMAGE_BATCHES) {
        expect(images.length).toBe(0)
        expect(placeholders.length).toBe(1)
      } else {
        expect(images.length).toBe(1)
        expect(placeholders.length).toBe(0)
      }
    }
    // 原始消息不被修改（返回新数组新对象）
    const first = msgs[1].content as Array<{ type: string }>
    expect(first.some((p) => p.type === 'image')).toBe(true)
  })

  it('does not touch non-image user messages', () => {
    const msgs: ModelMessage[] = [textMsg('a'), imageBatch(1), textMsg('b'), imageBatch(2), imageBatch(3), imageBatch(4)]
    const out = pruneOldImages(msgs)
    expect(out[0]).toBe(msgs[0])
    expect(out[2]).toBe(msgs[2])
  })
})