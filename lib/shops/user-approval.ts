import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth-catha'
import { getCathaUserByEmail, type CathaUser } from '@/lib/models/catha-user'
import { hasCathaPermission } from '@/lib/catha-permissions-model'
import { isSuperAdminRole } from '@/lib/shops/access'
import { resolveShopScope } from '@/lib/shops/context'
import { adminShopIds, effectiveRoleForShop, permissionsForShopRole } from '@/lib/shops/membership'

export type Approver = {
  email: string
  user: CathaUser
  superAdmin: boolean
  adminShopIds: string[]
}

export async function loadShopApprover(): Promise<{ ok: true; approver: Approver } | { ok: false; response: NextResponse }> {
  const session = await auth()
  if (!session?.user?.email) {
    return { ok: false, response: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) }
  }
  const user = await getCathaUserByEmail(session.user.email)
  if (!user || String(user.status).toUpperCase() !== 'ACTIVE') {
    return { ok: false, response: NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }) }
  }
  const superAdmin = isSuperAdminRole(user.role)
  const scope = await resolveShopScope()
  const shopId = scope.mode === 'shop' ? scope.shopId : null
  const role = effectiveRoleForShop(user, shopId)
  const permissions = role === 'SUPER_ADMIN' ? user.permissions : permissionsForShopRole(role)
  const canManage = superAdmin || (role === 'ADMIN' && hasCathaPermission(permissions, 'users', 'edit'))
  if (!canManage) {
    return { ok: false, response: NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }) }
  }
  return {
    ok: true,
    approver: {
      email: user.email,
      user,
      superAdmin,
      adminShopIds: superAdmin ? [] : adminShopIds(user),
    },
  }
}
