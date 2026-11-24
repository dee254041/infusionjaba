import { describe, expect, it } from 'vitest'
import { CATHA_LOUNGE_SHOP_ID } from './constants'
import { userIsStaffOfShop } from './access'
import {
  canReviewPendingForShop,
  effectiveRoleForShop,
  isUnassignedPending,
  normalizeShopMemberships,
} from './membership'

describe('pending shop approval', () => {
  it('keeps a new signup out of every shop until approval', () => {
    const pending = {
      role: 'PENDING',
      status: 'PENDING',
      shopIds: [] as string[],
      shopMemberships: [] as { shopId: string; role: 'STAFF' | 'ADMIN' }[],
      requestedShopId: CATHA_LOUNGE_SHOP_ID,
    }
    expect(isUnassignedPending(pending)).toBe(true)
    expect(userIsStaffOfShop(pending, CATHA_LOUNGE_SHOP_ID)).toBe(false)
    expect(effectiveRoleForShop(pending, CATHA_LOUNGE_SHOP_ID)).toBe('PENDING')
    expect(effectiveRoleForShop(pending, 'shop-b')).toBe('PENDING')
  })

  it('applies a different role in each approved shop', () => {
    const user = {
      role: 'ADMIN',
      status: 'ACTIVE',
      shopMemberships: [
        { shopId: CATHA_LOUNGE_SHOP_ID, role: 'STAFF' as const },
        { shopId: 'shop-b', role: 'ADMIN' as const },
      ],
    }
    expect(effectiveRoleForShop(user, CATHA_LOUNGE_SHOP_ID)).toBe('CASHIER')
    expect(effectiveRoleForShop(user, 'shop-b')).toBe('ADMIN')
    expect(effectiveRoleForShop(user, 'shop-c')).toBe('PENDING')
    expect(userIsStaffOfShop(user, 'shop-c')).toBe(false)
  })

  it('shows every pending request to a super admin and only the requested shop to a shop admin', () => {
    const signup = { requestedShopId: CATHA_LOUNGE_SHOP_ID }
    expect(canReviewPendingForShop({ role: 'SUPER_ADMIN', status: 'ACTIVE' }, signup.requestedShopId)).toBe(true)
    expect(
      canReviewPendingForShop(
        { role: 'ADMIN', status: 'ACTIVE', shopMemberships: [{ shopId: 'shop-b', role: 'ADMIN' }] },
        signup.requestedShopId
      )
    ).toBe(false)
    expect(
      canReviewPendingForShop(
        { role: 'ADMIN', status: 'ACTIVE', shopMemberships: [{ shopId: CATHA_LOUNGE_SHOP_ID, role: 'ADMIN' }] },
        signup.requestedShopId
      )
    ).toBe(true)
  })

  it('drops a shop that is no longer selected', () => {
    const next = normalizeShopMemberships([
      { shopId: 'shop-b', role: 'ADMIN' },
      { shopId: 'shop-b', role: 'STAFF' },
    ])
    expect(next).toEqual([{ shopId: 'shop-b', role: 'ADMIN' }])
  })
})
