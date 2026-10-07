import { describe, expect, it } from 'vitest'
import { parseTimestamp, TIMESTAMP_RE } from './timestamps'

const find = (s: string) => [...s.matchAll(TIMESTAMP_RE)].map((m) => m[0])

describe('timestamp links', () => {
  it('finds the formats answers actually use', () => {
    expect(find('约 10s–25s，24.8s 仍在右侧')).toEqual(['10s', '25s', '24.8s'])
    expect(find('第 3 秒出现，2:59 结束')).toEqual(['3 秒', '2:59'])
    expect(find('at 1m30.5s and 1h02m3s')).toEqual(['1m30.5s', '1h02m3s'])
    expect(find('0:01:05 red car')).toEqual(['0:01:05'])
  })

  it('ignores look-alikes', () => {
    expect(find('16:9 画幅，386 kbps，10fps，500ms 延迟，H.264')).toEqual([])
    expect(find('v1:30 abc12s，精度 ±1 秒')).toEqual([])
  })

  it('parses to seconds', () => {
    expect(parseTimestamp('24.8s')).toBe(24.8)
    expect(parseTimestamp('25 秒')).toBe(25)
    expect(parseTimestamp('2:59')).toBe(179)
    expect(parseTimestamp('0:01:05')).toBe(65)
    expect(parseTimestamp('1m30.5s')).toBe(90.5)
    expect(parseTimestamp('1h02m3s')).toBe(3723)
    expect(parseTimestamp('hello')).toBeNull()
  })
})
