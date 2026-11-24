import { NextResponse } from 'next/server'
import { requireSuperAdminApi } from '@/lib/catha-auth'
import { getAllCathaUsers, getCathaUserByEmail, updateCathaUser, type CathaUserRole, type CathaUserStatus } from '@/lib/models/catha-user'
import { CathaPermissions, normalizePermissions } from '@/lib/catha-permissions-model'
import { getPhoneValidationError, normalizeKenyaPhone } from '@/lib/phone-utils'
import { userVisibleInShopDirectory, isSuperAdminRole } from '@/lib/shops/access'
import { CATHA_LOUNGE_SHOP_ID } from '@/lib/shops/constants'
import { listShopRecords, resolveShopScope } from '@/lib/shops/context'
import { canReviewPendingForShop, isUnassignedPending, membershipsOf } from '@/lib/shops/membership'
import { loadShopApprover } from '@/lib/shops/user-approval'

const VALID_ROLES: CathaUserRole[] = ['SUPER_ADMIN', 'ADMIN', 'CASHIER', 'PENDING']
const VALID_STATUSES: CathaUserStatus[] = ['ACTIVE', 'PENDING', 'DISABLED']

function formatUser(u: Awaited<ReturnType<typeof getAllCathaUsers>>[0]) {
  return {
    id: u._id?.toString(),
    email: u.email,
    name: u.name,
    phoneNumber: u.phoneNumber ?? null,
    image: u.image ?? null,
    role: u.role,
    status: u.status,
    permissions: normalizePermissions(u.permissions ?? {}),
    shopIds: u.shopIds ?? null,
    shopMemberships: u.shopMemberships ?? [],
    requestedShopId: u.requestedShopId ?? null,
    approvalState: u.approvalState ?? 'pending',
    createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : u.createdAt,
    updatedAt: u.updatedAt instanceof Date ? u.updatedAt.toISOString() : u.updatedAt,
    lastLogin: u.lastLogin ? (u.lastLogin instanceof Date ? u.lastLogin.toISOString() : u.lastLogin) : null,
  }
}

export async function GET() {
  const loaded = await loadShopApprover()
  if (!loaded.ok) return loaded.response
  const { approver } = loaded
  try {
    const scope = await resolveShopScope()
    const shopId = scope.mode === 'shop' ? scope.shopId : CATHA_LOUNGE_SHOP_ID
    const all = await getAllCathaUsers()
    const shops = await listShopRecords()
    const assignableShops = (approver.superAdmin ? shops : shops.filter((shop) => approver.adminShopIds.includes(shop.shopId)))
      .filter((shop) => shop.status === 'active')
      .map((shop) => ({ shopId: shop.shopId, name: shop.name }))
    const users = all.filter((user) => !isUnassignedPending(user) && userVisibleInShopDirectory(user, shopId))
    const pending = all.filter((user) => {
      if (!isUnassignedPending(user) && String(user.status).toUpperCase() !== 'PENDING') return false
      if (membershipsOf(user).length > 0) return false
      if (String(user.status).toUpperCase() === 'DISABLED') return false
      if (isSuperAdminRole(user.role)) return false
      return canReviewPendingForShop(approver.user, user.requestedShopId || null)
    })
    return NextResponse.json({
      success: true,
      users: users.map(formatUser),
      pending: pending.map(formatUser),
      assignableShops,
      requestedShopNames: Object.fromEntries(shops.map((shop) => [shop.shopId, shop.name])),
    })
  } catch (e: any) {
    console.error('[catha/users] GET error:', e?.message)
    return NextResponse.json({ success: false, error: 'Failed to fetch users' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const [session, err] = await requireSuperAdminApi()
  if (err) return err
  try {
    const body = await request.json()
    const email = typeof body.email === 'string' ? body.email.trim() : ''
    if (!email) return NextResponse.json({ success: false, error: 'email required' }, { status: 400 })
    const existing = await getCathaUserByEmail(email)
    if (!existing) return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })

    const updates: Parameters<typeof updateCathaUser>[1] = {}
    if (VALID_STATUSES.includes(body.status)) updates.status = body.status
    if (VALID_ROLES.includes(body.role)) updates.role = body.role
    if (body.permissions && typeof body.permissions === 'object') {
      updates.permissions = normalizePermissions(body.permissions as CathaPermissions)
    }
    const resolvedRole = String((updates.role ?? existing.role) || '').toUpperCase()
    if (resolvedRole === 'CASHIER') {
      const basePermissions = normalizePermissions(updates.permissions ?? existing.permissions ?? {})
      basePermissions.myShift = { view: true, add: false, edit: false, delete: false }
      updates.permissions = basePermissions
    }

    if (body.phoneNumber !== undefined) {
      const rawPhone = typeof body.phoneNumber === 'string' ? body.phoneNumber.trim() : ''
      const validationError = getPhoneValidationError(rawPhone)
      if (validationError) {
        return NextResponse.json({ success: false, error: validationError }, { status: 400 })
      }
      updates.phoneNumber = normalizeKenyaPhone(rawPhone)
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid updates (status, role, permissions, or phoneNumber)' },
        { status: 400 }
      )
    }

    const user = await updateCathaUser(email, updates)
    if (!user) return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
    return NextResponse.json({ success: true, user: formatUser(user) })
  } catch (e: any) {
    console.error('[catha/users] PATCH error:', e?.message)
    return NextResponse.json({ success: false, error: 'Failed to update user' }, { status: 500 })
  }
}
