import { CATHA_LOUNGE_SHOP_ID, GLOBAL_RECORD_SCOPE, GLOBAL_RECORD_SHOP_ID } from './constants'

/**
 * Catha Lounge also matches rows that have not been backfilled yet.
 * Every other shop matches only its own shopId, so legacy rows cannot leak sideways.
 */
export function shopMatchClause(shopId: string): Record<string, unknown> {
  if (shopId === CATHA_LOUNGE_SHOP_ID) {
    return {
      $or: [{ shopId: CATHA_LOUNGE_SHOP_ID }, { shopId: { $exists: false } }, { shopId: null }],
    }
  }
  return { shopId }
}

export function withShopFilter(filter: unknown, shopId: string): Record<string, unknown> {
  const clause = shopMatchClause(shopId)
  if (!filter || typeof filter !== 'object' || Array.isArray(filter) || Object.keys(filter as object).length === 0) {
    return clause
  }
  return { $and: [clause, filter as Record<string, unknown>] }
}

/** Shop queries never include formally global records, even before backfill. */
export function shopCollectionFilter(collectionName: string, filter: unknown, shopId: string): Record<string, unknown> {
  const scoped = withShopFilter(filter, shopId)
  if (collectionName !== 'distributor_requests') return scoped
  return {
    $and: [
      scoped,
      { shopScope: { $ne: GLOBAL_RECORD_SCOPE } },
      { requestType: { $ne: 'jaba_distributor' } },
      { shopId: { $ne: GLOBAL_RECORD_SHOP_ID } },
    ],
  }
}

export function globalDistributorOwnership(): {
  shopId: typeof GLOBAL_RECORD_SHOP_ID
  shopScope: typeof GLOBAL_RECORD_SCOPE
  ownership: 'global'
} {
  return { shopId: GLOBAL_RECORD_SHOP_ID, shopScope: GLOBAL_RECORD_SCOPE, ownership: 'global' }
}

export function stampShopId<T extends Record<string, unknown>>(doc: T, shopId: string): T {
  ;(doc as Record<string, unknown>).shopId = shopId
  return doc
}

/** Forces ownership onto updates so a payload cannot move a row to another shop. */
export function stampUpdate(update: unknown, shopId: string): unknown {
  if (!update || typeof update !== 'object' || Array.isArray(update)) return update
  const next = { ...(update as Record<string, unknown>) }
  const set =
    next.$set && typeof next.$set === 'object' && !Array.isArray(next.$set)
      ? { ...(next.$set as Record<string, unknown>) }
      : {}
  set.shopId = shopId
  next.$set = set
  return next
}

export function scopeAggregation(pipeline: unknown, shopId: string): Record<string, unknown>[] {
  const stages = Array.isArray(pipeline) ? [...pipeline] : []
  const clause = shopMatchClause(shopId)
  const first = stages[0]
  const firstKey = first && typeof first === 'object' ? Object.keys(first as object)[0] : ''
  if (firstKey === '$geoNear' || firstKey === '$search' || firstKey === '$vectorSearch') {
    return [stages[0] as Record<string, unknown>, { $match: clause }, ...stages.slice(1)]
  }
  if (firstKey === '$match' && first && typeof first === 'object') {
    const match = (first as { $match?: unknown }).$match
    return [{ $match: { $and: [clause, match && typeof match === 'object' ? match : {}] } }, ...stages.slice(1)]
  }
  return [{ $match: clause }, ...stages]
}
