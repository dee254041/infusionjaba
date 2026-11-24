import { describe, expect, it } from 'vitest'
import { CATHA_LOUNGE_SHOP_ID, SHOP_BUSINESS_COLLECTIONS_NOT_COPIED, SHOP_TEMPLATE_COLLECTIONS } from './constants'
import { mayAccessShop, mergeShopAssignment, pickActiveShopId, userIsStaffOfShop, userVisibleInShopDirectory } from './access'
import { globalDistributorOwnership, scopeAggregation, shopCollectionFilter, shopMatchClause, stampUpdate, withShopFilter } from './filter'
import { openActiveShopCookie, sealActiveShopCookie } from './cookie'
import { shopIdForPaymentCallback } from './payment-shop'
import { isPublicPaymentToken, publicPaymentStatus, shouldDeductStockOnCallback, createPublicPaymentToken } from './payment-status'
import { normalizeShopSlug, validateCreateShopInput } from './validate'
import { createShopScopedCollection, setShopScopeResolver } from './scoped-collection'

describe('shop filters', () => {
  it('keeps legacy rows on Catha Lounge only', () => {
    expect(shopMatchClause(CATHA_LOUNGE_SHOP_ID)).toEqual({
      $or: [{ shopId: CATHA_LOUNGE_SHOP_ID }, { shopId: { $exists: false } }, { shopId: null }],
    })
    expect(shopMatchClause('westlands')).toEqual({ shopId: 'westlands' })
  })

  it('ands the shop clause with the caller filter', () => {
    expect(withShopFilter({ id: 'P1' }, 'westlands')).toEqual({
      $and: [{ shopId: 'westlands' }, { id: 'P1' }],
    })
  })

  it('stamps updates so a payload cannot move a record', () => {
    expect(stampUpdate({ $set: { shopId: 'other', status: 'paid' } }, 'westlands')).toEqual({
      $set: { shopId: 'westlands', status: 'paid' },
    })
  })

  it('scopes aggregations before later stages', () => {
    const pipeline = scopeAggregation([{ $match: { status: 'paid' } }, { $count: 'n' }], 'westlands')
    expect(pipeline[0]).toEqual({ $match: { $and: [{ shopId: 'westlands' }, { status: 'paid' }] } })
  })
})

describe('shop access', () => {
  const catha = { shopId: CATHA_LOUNGE_SHOP_ID, status: 'active' }
  const other = { shopId: 'westlands', status: 'active' }
  const shops = [catha, other]

  it('keeps an admin inside the shops they are assigned to', () => {
    const admin = { role: 'ADMIN', status: 'ACTIVE', shopIds: [CATHA_LOUNGE_SHOP_ID] }
    expect(mayAccessShop(admin, catha)).toBe(true)
    expect(mayAccessShop(admin, other)).toBe(false)
    expect(pickActiveShopId(admin, shops, 'westlands')).toBe(CATHA_LOUNGE_SHOP_ID)
  })

  it('does not turn a shop admin into a super admin', () => {
    const admin = { role: 'ADMIN', status: 'ACTIVE', shopIds: ['westlands', CATHA_LOUNGE_SHOP_ID] }
    expect(admin.role).toBe('ADMIN')
    expect(pickActiveShopId(admin, shops, 'westlands')).toBe('westlands')
  })

  it('hides other shops from a worker', () => {
    const worker = { role: 'CASHIER', status: 'ACTIVE', shopIds: ['westlands'] }
    expect(userIsStaffOfShop(worker, CATHA_LOUNGE_SHOP_ID)).toBe(false)
    expect(userVisibleInShopDirectory(worker, CATHA_LOUNGE_SHOP_ID)).toBe(false)
    expect(userVisibleInShopDirectory(worker, 'westlands')).toBe(true)
    expect(shops.filter((shop) => mayAccessShop(worker, shop)).map((shop) => shop.shopId)).toEqual(['westlands'])
  })

  it('treats accounts without shopIds as Catha Lounge staff', () => {
    expect(userIsStaffOfShop({ role: 'CASHIER', status: 'ACTIVE' }, CATHA_LOUNGE_SHOP_ID)).toBe(true)
    expect(userIsStaffOfShop({ role: 'CASHIER', status: 'ACTIVE', shopIds: [] }, CATHA_LOUNGE_SHOP_ID)).toBe(false)
  })

  it('gives a new Google account no shop until an admin assigns one', () => {
    const pending = { role: 'PENDING', status: 'PENDING', shopIds: [] as string[] }
    expect(mayAccessShop(pending, catha)).toBe(false)
    expect(mayAccessShop(pending, other)).toBe(false)
    expect(pickActiveShopId(pending, shops, null)).toBeNull()
  })

  it('adds a shop without removing the current one or changing role', () => {
    expect(mergeShopAssignment([CATHA_LOUNGE_SHOP_ID], 'westlands')).toEqual([CATHA_LOUNGE_SHOP_ID, 'westlands'])
    expect(mergeShopAssignment(undefined, 'westlands')).toEqual([CATHA_LOUNGE_SHOP_ID, 'westlands'])
  })
})

describe('shop creation input', () => {
  it('rejects a duplicate of the Catha Lounge code and accepts a new code', () => {
    expect(validateCreateShopInput({ name: 'Westlands', slug: 'catha-lounge' }).ok).toBe(false)
    const parsed = validateCreateShopInput({ name: 'Westlands Bar', slug: 'Westlands Bar' })
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.value.slug).toBe('westlands-bar')
  })

  it('copies templates only', () => {
    expect(SHOP_TEMPLATE_COLLECTIONS).toEqual(['bar_categories', 'bar_volumes'])
    expect(SHOP_BUSINESS_COLLECTIONS_NOT_COPIED).toContain('orders')
    expect(SHOP_BUSINESS_COLLECTIONS_NOT_COPIED).toContain('bar_inventory')
    expect(SHOP_BUSINESS_COLLECTIONS_NOT_COPIED).toContain('mpesa_transactions')
    expect(normalizeShopSlug('Kilimani Branch')).toBe('kilimani-branch')
  })
})

describe('global distributor requests', () => {
  it('excludes Jaba requests from every shop query', () => {
    const filter = shopCollectionFilter('distributor_requests', { status: 'pending' }, CATHA_LOUNGE_SHOP_ID)
    expect(JSON.stringify(filter)).toContain('jaba_distributor')
    expect(JSON.stringify(filter)).toContain('global')
    expect(globalDistributorOwnership().shopId).toBe('global')
  })
})

describe('public payment status', () => {
  it('returns only a status and rejects short tokens', () => {
    const token = createPublicPaymentToken()
    expect(isPublicPaymentToken(token)).toBe(true)
    expect(isPublicPaymentToken('shop-b')).toBe(false)
    expect(publicPaymentStatus('COMPLETED')).toEqual({ status: 'COMPLETED' })
    expect(Object.keys(publicPaymentStatus('COMPLETED'))).toEqual(['status'])
  })

  it('does not deduct stock on a duplicate callback', () => {
    expect(shouldDeductStockOnCallback({ stockDeducted: false })).toBe(true)
    expect(shouldDeductStockOnCallback({ stockDeducted: true })).toBe(false)
    expect(shouldDeductStockOnCallback(null)).toBe(false)
  })
})

describe('payment shop attribution', () => {
  it('uses the transaction shop even when another shop is selected', () => {
    expect(shopIdForPaymentCallback({ shopId: 'westlands' }, CATHA_LOUNGE_SHOP_ID)).toBe('westlands')
    expect(shopIdForPaymentCallback({}, 'westlands')).toBe(CATHA_LOUNGE_SHOP_ID)
  })

  it('rejects a tampered active-shop cookie', () => {
    const token = sealActiveShopCookie(
      { shopId: 'westlands', userId: 'user-1', exp: Date.now() + 60_000 },
      'secret'
    )
    expect(openActiveShopCookie(token, 'secret')?.shopId).toBe('westlands')
    expect(openActiveShopCookie(token, 'other-secret')).toBeNull()
    expect(openActiveShopCookie(`${token}x`, 'secret')).toBeNull()
  })
})

describe('scoped collection', () => {
  it('keeps orders, products, and payments in the shop that created them', async () => {
    const docs: Record<string, unknown>[] = []
    const fake: any = {
      async insertOne(doc: Record<string, unknown>) {
        docs.push(doc)
        return { insertedId: docs.length }
      },
      async findOne(filter: any) {
        return docs.find((doc) => matches(doc, filter)) || null
      },
      find(filter: any) {
        const rows = docs.filter((doc) => matches(doc, filter))
        return {
          sort() {
            return this
          },
          async toArray() {
            return rows
          },
        }
      },
      async updateOne(filter: any, update: any) {
        const doc = docs.find((row) => matches(row, filter))
        if (!doc) return { matchedCount: 0 }
        Object.assign(doc, update.$set)
        return { matchedCount: 1 }
      },
      aggregate(pipeline: any[]) {
        return { async toArray() { return pipeline } }
      },
    }

    setShopScopeResolver(async () => ({ mode: 'shop', shopId: 'shop-a' }))
    const orders = createShopScopedCollection(fake, 'orders')
    await orders.insertOne({ id: 'P100', total: 500, shopId: 'shop-b' } as any)
    expect(docs[0].shopId).toBe('shop-a')

    setShopScopeResolver(async () => ({ mode: 'shop', shopId: 'shop-b' }))
    expect(await orders.findOne({ id: 'P100' })).toBeNull()
    expect(await orders.find({}).toArray()).toEqual([])

    setShopScopeResolver(async () => ({ mode: 'shop', shopId: 'shop-a' }))
    await orders.updateOne({ id: 'P100' }, { $set: { shopId: 'shop-b', total: 700 } })
    expect(docs[0]).toMatchObject({ shopId: 'shop-a', total: 700 })
    const pipeline = await orders.aggregate([{ $match: { id: 'P100' } }]).toArray()
    expect(pipeline[0].$match.$and[0]).toEqual({ shopId: 'shop-a' })

    const expenses = createShopScopedCollection(fake, 'bar_expenses')
    const suppliers = createShopScopedCollection(fake, 'bar_suppliers')
    setShopScopeResolver(async () => ({ mode: 'shop', shopId: 'shop-b' }))
    await expenses.insertOne({ kind: 'rent', amount: 10 } as any)
    await suppliers.insertOne({ name: 'Shop B Supplier' } as any)
    setShopScopeResolver(async () => ({ mode: 'shop', shopId: 'shop-a' }))
    expect(await expenses.find({ kind: 'rent' }).toArray()).toEqual([])
    expect(await suppliers.findOne({ name: 'Shop B Supplier' })).toBeNull()

    docs.push({ requestType: 'jaba_distributor', shopId: 'global', shopScope: 'global', name: 'Jaba applicant' })
    const requests = createShopScopedCollection(fake, 'distributor_requests')
    const visible = await requests.find({}).toArray()
    expect(visible.some((row) => row.requestType === 'jaba_distributor')).toBe(false)
  })
})

function matches(doc: Record<string, unknown>, filter: any): boolean {
  if (!filter || typeof filter !== 'object') return true
  if (Array.isArray(filter.$and)) return filter.$and.every((part: any) => matches(doc, part))
  if (Array.isArray(filter.$or)) return filter.$or.some((part: any) => matches(doc, part))
  return Object.entries(filter).every(([key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value) && '$exists' in (value as object)) {
      const exists = Object.prototype.hasOwnProperty.call(doc, key)
      return (value as { $exists: boolean }).$exists ? exists : !exists
    }
    if (value && typeof value === 'object' && !Array.isArray(value) && '$ne' in (value as object)) {
      return doc[key] !== (value as { $ne: unknown }).$ne
    }
    return doc[key] === value
  })
}
