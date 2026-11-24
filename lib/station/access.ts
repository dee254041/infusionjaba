export type ShopAccessRole = 'SUPER' | 'ADMIN' | 'STAFF'

/**
 * Super admin can open Catha and every shop.
 * Everyone else can open only a shop they are assigned to.
 * Staff cannot open admin-only pages inside that shop.
 */
export function decideShopAccess(input: {
  requestedShopId: string
  isSuper: boolean
  assignment: 'ADMIN' | 'STAFF' | null
  minimum?: 'ADMIN'
}): { ok: true; role: ShopAccessRole } | { ok: false } {
  if (input.isSuper) return { ok: true, role: 'SUPER' }
  if (input.requestedShopId === 'catha') return { ok: false }
  if (!input.assignment) return { ok: false }
  if (input.minimum === 'ADMIN' && input.assignment !== 'ADMIN') return { ok: false }
  return { ok: true, role: input.assignment }
}
