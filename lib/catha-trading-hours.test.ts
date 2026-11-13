import { describe, expect, it } from 'vitest'
import { evaluateLoungeTradingHours } from '@/lib/catha-trading-hours'

describe('evaluateLoungeTradingHours', () => {
  it('allows a sale during opening hours', () => {
    const status = evaluateLoungeTradingHours('08:00', '23:00', new Date('2026-11-13T07:00:00.000Z'))
    expect(status.open).toBe(true)
  })

  it('blocks after closing until the next opening', () => {
    const afterClose = evaluateLoungeTradingHours('08:00', '23:00', new Date('2026-11-13T20:30:00.000Z'))
    expect(afterClose.open).toBe(false)
    expect(afterClose.message).toMatch(/08:00/)

    const beforeOpen = evaluateLoungeTradingHours('08:00', '23:00', new Date('2026-11-13T04:30:00.000Z'))
    expect(beforeOpen.open).toBe(false)
  })

  it('stays open after closing when the lock is turned off', () => {
    const status = evaluateLoungeTradingHours('08:00', '23:00', new Date('2026-11-13T20:30:00.000Z'), false)
    expect(status.open).toBe(true)
  })
})
