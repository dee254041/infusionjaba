import { CATHA_LOUNGE_SHOP_ID } from './constants'
import type { ShopAccessUser } from './types'

export class ShopScopeError extends Error {
  status: number
  constructor(message: string, status = 403) {
    super(message)
    this.name = 'ShopScopeError'
    this.status = status
  }
}

export function isSuperAdminRole(role: string | null | undefined): boolean {
  return String(role || '').trim().toUpperCase().replace(/-/g, '_') === 'SUPER_ADMIN'
}

/**
 * Missing shopIds means the account existed before multi-shop and belongs only to Catha Lounge.
 * An explicit empty array means the account has not been assigned to any shop.
 */
export function userIsStaffOfShop(user: ShopAccessUser, shopId: string): boolean {
  if (!Array.isArray(user.shopIds)) return shopId === CATHA_LOUNGE_SHOP_ID
  return user.shopIds.includes(shopId)
}

export function mayAccessShop(
  user: ShopAccessUser,
  shop: { shopId: string; status?: string | null }
): boolean {
  const status = String(user.status || '').trim().toUpperCase()
  if (status === 'DISABLED' || status === 'SUSPENDED') return false
  if (isSuperAdminRole(user.role) && (status === 'ACTIVE' || status === '')) return true
  if (status && status !== 'ACTIVE') return false
  const shopStatus = String(shop.status || 'active').toLowerCase()
  if (shopStatus !== 'active') return false
  return userIsStaffOfShop(user, shop.shopId)
}

export function shopsForUser<T extends { shopId: string; status?: string | null }>(
  user: ShopAccessUser,
  shops: T[]
): T[] {
  return shops.filter((shop) => mayAccessShop(user, shop))
}

export function pickActiveShopId(
  user: ShopAccessUser,
  shops: Array<{ shopId: string; status?: string | null }>,
  requested: string | null
): string | null {
  const allowed = shopsForUser(user, shops)
  if (requested && allowed.some((shop) => shop.shopId === requested)) return requested
  if (allowed.some((shop) => shop.shopId === CATHA_LOUNGE_SHOP_ID)) return CATHA_LOUNGE_SHOP_ID
  return allowed[0]?.shopId ?? null
}

/** Directory listing. Super admins remain visible in every shop; other staff only where they are assigned. */
export function userVisibleInShopDirectory(user: ShopAccessUser, shopId: string): boolean {
  if (isSuperAdminRole(user.role)) return true
  return userIsStaffOfShop(user, shopId)
}

/** Adds a shop without removing existing assignments and without changing role. */
export function mergeShopAssignment(existing: string[] | null | undefined, shopId: string): string[] {
  const base = Array.isArray(existing) ? [...existing] : [CATHA_LOUNGE_SHOP_ID]
  if (!base.includes(shopId)) base.push(shopId)
  return base
}

export function needsShopSwitcher(user: ShopAccessUser, shopCount: number): boolean {
  if (isSuperAdminRole(user.role)) return shopCount > 1
  return shopCount > 1
}
