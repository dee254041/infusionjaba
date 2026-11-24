import { describe, expect, it } from 'vitest'
import { isStationOrderId, normalizeStationSlug, stationOrderId } from './slug'
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
      { shopId: 'westlands-bar', userId: 'u1', role: 'OWNER', name: 'Asha' },
      secret,
    )
    const session = await verifyStationToken(token, secret)
    expect(session?.shopId).toBe('westlands-bar')
    expect(session?.role).toBe('OWNER')
    expect(await verifyStationToken(token, 'other-secret')).toBeNull()
  })
})
