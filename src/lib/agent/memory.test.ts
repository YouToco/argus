import { describe, expect, it } from 'vitest'
import { MemoryStore } from './memory'

describe('MemoryStore', () => {
  it('remembers and recalls by topic / time range / query', () => {
    const m = new MemoryStore()
    m.remember(0, 10, '人数', '空停车场，3 辆车')
    m.remember(10, 20, '人数', '2 人走过')
    m.remember(10, 20, '车辆', '1 辆红车离开')

    expect(m.recall({}).length).toBe(3)
    expect(m.recall({ topic: '人数' }).length).toBe(2)
    expect(m.recall({ timeRange: [5, 15] }).length).toBe(3)
    expect(m.recall({ timeRange: [0, 5] }).length).toBe(1)
    expect(m.recall({ query: '红车' }).length).toBe(1)
    expect(m.recall({ query: '不存在' }).length).toBe(0)
  })

  it('overwrites the same (topic, range) entry instead of duplicating', () => {
    const m = new MemoryStore()
    m.remember(0, 10, '人数', '第一次结论')
    m.remember(0, 10, '人数', '更新后的结论')
    const list = m.recall({ topic: '人数' })
    expect(list.length).toBe(1)
    expect(list[0].notes).toBe('更新后的结论')
  })

  it('restore() replaces state (session hydration)', () => {
    const m = new MemoryStore()
    m.remember(0, 5, 'a', 'x')
    m.restore([{ id: 'mem-9', startSec: 60, endSec: 70, topic: '事件', notes: '持久化的记忆' }])
    const list = m.list()
    expect(list.length).toBe(1)
    expect(list[0].topic).toBe('事件')
    // 新增不应与恢复的 id 冲突
    const added = m.remember(80, 90, '事件', '新记忆')
    expect(added.id).not.toBe('mem-9')
  })
})