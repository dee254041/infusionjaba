import { describe, expect, it } from 'vitest'
import { decideShopAccess } from './access'

describe('shop access', () => {
  it('lets the super admin into Catha and any shop', () => {
    expect(decideShopAccess({ requestedShopId: 'catha', isSuper: true, assignment: null }).ok).toBe(true)
    expect(decideShopAccess({ requestedShopId: 'westlands', isSuper: true, assignment: null }).role).toBe('SUPER')
  })

  it('blocks a person who is not assigned, including a Catha admin', () => {
    expect(decideShopAccess({ requestedShopId: 'westlands', isSuper: false, assignment: null }).ok).toBe(false)
    expect(decideShopAccess({ requestedShopId: 'catha', isSuper: false, assignment: 'ADMIN' }).ok).toBe(false)
  })

  it('lets an assigned admin into that shop only, and blocks staff from admin pages', () => {
    expect(decideShopAccess({ requestedShopId: 'westlands', isSuper: false, assignment: 'ADMIN' }).role).toBe('ADMIN')
    expect(
      decideShopAccess({ requestedShopId: 'westlands', isSuper: false, assignment: 'STAFF', minimum: 'ADMIN' }).ok,
    ).toBe(false)
    expect(decideShopAccess({ requestedShopId: 'westlands', isSuper: false, assignment: 'STAFF' }).role).toBe('STAFF')
  })
})
