import { describe, expect, it } from 'vitest'
import { allocateStationId, isStationOrderId, normalizeStationSlug, stationOrderId } from './slug'
import { signStationToken, verifyStationToken } from './token'

describe('station slug', () => {
  it('accepts a normal shop address', () => {
    expect(normalizeStationSlug('Westlands Bar')).toBe('westlands-bar')
  })

  it('rejects names that would collide with the live site', () => {
    expect(normalizeStationSlug('catha')).toBeNull()
    expect(normalizeStationSlug('menu')).toBeNull()
    expect(normalizeStationSlug('table')).toBeNull()
    expect(normalizeStationSlug('ab')).toBeNull()
  })

  it('builds a unique id from the shop name', () => {
    const first = allocateStationId('Westlands Bar', new Set())
    const second = allocateStationId('Westlands Bar', new Set([first]))
    expect(first.startsWith('westlands-bar-')).toBe(true)
    expect(second).not.toBe(first)
    expect(allocateStationId('Catha', new Set()).startsWith('shop-')).toBe(true)
  })

  it('marks station orders so they never match a Catha order', () => {
    const id = stationOrderId('westlands-bar')
    expect(isStationOrderId(id)).toBe(true)
    expect(id.startsWith('stn_westlands-bar_')).toBe(true)
  })
})

describe('station session token', () => {
  it('round-trips and rejects another shop', async () => {
    const secret = 'test-station-secret'
    const token = await signStationToken(
      { shopId: 'westlands-bar', userId: 'u1', role: 'ADMIN', name: 'Asha' },
      secret,
    )
    const session = await verifyStationToken(token, secret)
    expect(session?.shopId).toBe('westlands-bar')
    expect(session?.role).toBe('ADMIN')
    expect(await verifyStationToken(token, 'other-secret')).toBeNull()
  })
})
