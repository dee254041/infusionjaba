import { CATHA_LOUNGE_SHOP_ID } from './constants'
import type { ShopAccessUser } from './types'
import { isSuperAdminRole } from './access'
import { getDefaultPermissionsForRole, type CathaPermissions } from '@/lib/catha-permissions-model'

export type ShopAssignmentRole = 'STAFF' | 'ADMIN'

export type ShopMembership = {
  shopId: string
  role: ShopAssignmentRole
}

export type ApprovalState = 'pending' | 'approved' | 'rejected'

export function normalizeShopMemberships(raw: unknown): ShopMembership[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: ShopMembership[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const shopId = String((item as { shopId?: unknown }).shopId || '').trim()
    const roleRaw = String((item as { role?: unknown }).role || '').trim().toUpperCase()
    if (!shopId || seen.has(shopId)) continue
    if (roleRaw !== 'STAFF' && roleRaw !== 'ADMIN' && roleRaw !== 'CASHIER') continue
    seen.add(shopId)
    out.push({ shopId, role: roleRaw === 'ADMIN' ? 'ADMIN' : 'STAFF' })
  }
  return out
}

export function membershipsOf(user: { shopMemberships?: unknown } | null | undefined): ShopMembership[] {
  return normalizeShopMemberships(user?.shopMemberships)
}

export function isUnassignedPending(user: {
  status?: string | null
  approvalState?: string | null
  shopMemberships?: unknown
  shopIds?: string[] | null
}): boolean {
  const status = String(user.status || '').toUpperCase()
  if (status === 'ACTIVE' || status === 'DISABLED') return false
  return membershipsOf(user).length === 0
}

export function effectiveRoleForShop(
  user: { role?: string | null; status?: string | null; shopMemberships?: unknown; shopIds?: string[] | null },
  shopId: string | null
): 'SUPER_ADMIN' | 'ADMIN' | 'CASHIER' | 'PENDING' {
  if (isSuperAdminRole(user.role) && String(user.status || 'ACTIVE').toUpperCase() !== 'DISABLED') {
    return 'SUPER_ADMIN'
  }
  if (String(user.status || '').toUpperCase() !== 'ACTIVE') return 'PENDING'
  const memberships = membershipsOf(user)
  if (memberships.length > 0) {
    const match = shopId ? memberships.find((item) => item.shopId === shopId) : undefined
    if (!match) return 'PENDING'
    return match.role === 'ADMIN' ? 'ADMIN' : 'CASHIER'
  }
  const global = String(user.role || '').toUpperCase()
  if (!shopId) return 'PENDING'
  const legacyIds = Array.isArray(user.shopIds) ? user.shopIds : null
  const inShop = legacyIds ? legacyIds.includes(shopId) : shopId === CATHA_LOUNGE_SHOP_ID
  if (!inShop) return 'PENDING'
  if (global === 'ADMIN' || global === 'MANAGER') return 'ADMIN'
  if (global === 'CASHIER') return 'CASHIER'
  return 'PENDING'
}

export function permissionsForShopRole(role: 'SUPER_ADMIN' | 'ADMIN' | 'CASHIER' | 'PENDING'): CathaPermissions {
  return getDefaultPermissionsForRole(role)
}

export function canOperateInShop(
  user: Parameters<typeof effectiveRoleForShop>[0],
  shopId: string | null
): boolean {
  const role = effectiveRoleForShop(user, shopId)
  return role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'CASHIER'
}

export function adminShopIds(user: ShopAccessUser & { shopMemberships?: unknown }): string[] {
  if (isSuperAdminRole(user.role)) return []
  const memberships = membershipsOf(user)
  if (memberships.length > 0) {
    return memberships.filter((item) => item.role === 'ADMIN').map((item) => item.shopId)
  }
  if (String(user.role || '').toUpperCase() === 'ADMIN') {
    if (Array.isArray(user.shopIds)) return user.shopIds
    return [CATHA_LOUNGE_SHOP_ID]
  }
  return []
}

export function canReviewPendingForShop(
  actor: { role?: string | null; status?: string | null; shopMemberships?: unknown },
  requestedShopId: string | null
): boolean {
  if (isSuperAdminRole(actor.role) && String(actor.status || 'ACTIVE').toUpperCase() === 'ACTIVE') return true
  if (!requestedShopId) return false
  return adminShopIds(actor).includes(requestedShopId)
}
