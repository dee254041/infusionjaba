import { NextResponse } from 'next/server'
import { getCathaUserByEmail, updateCathaUser } from '@/lib/models/catha-user'
import { getDefaultPermissionsForRole } from '@/lib/catha-permissions-model'
import { writeCathaAuditLog } from '@/lib/catha-audit-log'
import { isSuperAdminRole } from '@/lib/shops/access'
import { listShopRecords } from '@/lib/shops/context'
import { runWithShop } from '@/lib/shops/als'
import {
  canReviewPendingForShop,
  membershipsOf,
  normalizeShopMemberships,
  type ShopMembership,
} from '@/lib/shops/membership'
import { loadShopApprover } from '@/lib/shops/user-approval'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const loaded = await loadShopApprover()
  if (!loaded.ok) return loaded.response
  const { approver } = loaded

  const body = await request.json().catch(() => null)
  const email = String(body?.email || '').trim().toLowerCase()
  const decision = body?.decision === 'reject' ? 'reject' : 'approve'
  if (!email) return NextResponse.json({ success: false, error: 'Email is required.' }, { status: 400 })

  const target = await getCathaUserByEmail(email)
  if (!target) return NextResponse.json({ success: false, error: 'User not found.' }, { status: 404 })
  if (isSuperAdminRole(target.role)) {
    return NextResponse.json({ success: false, error: 'A super admin is not approved through shop assignment.' }, { status: 400 })
  }

  if (decision === 'reject') {
    if (!canReviewPendingForShop(approver.user, target.requestedShopId || null)) {
      return NextResponse.json({ success: false, error: 'You cannot reject this request.' }, { status: 403 })
    }
    await updateCathaUser(email, {
      status: 'PENDING',
      approvalState: 'rejected',
      shopMemberships: [],
      shopIds: [],
      role: 'PENDING',
      permissions: {},
    })
    if (target.requestedShopId) {
      await runWithShop(target.requestedShopId, () =>
        writeCathaAuditLog({
          type: 'SYSTEM',
          action: 'SHOP_ACCESS_REJECTED',
          status: 'SUCCESS',
          userId: approver.user._id?.toString() || approver.email,
          role: approver.superAdmin ? 'SUPER_ADMIN' : 'ADMIN',
          endpoint: '/api/catha/users/approve',
          payloadSummary: { email, requestedShopId: target.requestedShopId },
        })
      ).catch(() => undefined)
    }
    return NextResponse.json({ success: true, decision: 'reject' })
  }

  const memberships = normalizeShopMemberships(body?.memberships)
  if (memberships.length === 0) {
    return NextResponse.json({ success: false, error: 'Select at least one shop.' }, { status: 400 })
  }
  const shops = await listShopRecords()
  for (const membership of memberships) {
    const shop = shops.find((item) => item.shopId === membership.shopId && item.status === 'active')
    if (!shop) return NextResponse.json({ success: false, error: 'One of the selected shops is not available.' }, { status: 400 })
    if (!approver.superAdmin && !approver.adminShopIds.includes(membership.shopId)) {
      return NextResponse.json({ success: false, error: 'You can only assign shops you administer.' }, { status: 403 })
    }
  }
  if (!approver.superAdmin && !canReviewPendingForShop(approver.user, target.requestedShopId || memberships[0]?.shopId || null)) {
    return NextResponse.json({ success: false, error: 'This request is for another shop.' }, { status: 403 })
  }

  const previous = membershipsOf(target)
  const role = memberships.some((item) => item.role === 'ADMIN') ? 'ADMIN' : 'CASHIER'
  await updateCathaUser(email, {
    status: 'ACTIVE',
    approvalState: 'approved',
    shopMemberships: memberships,
    shopIds: memberships.map((item) => item.shopId),
    role,
    permissions: getDefaultPermissionsForRole(role),
  })

  await writeMembershipAudit(approver, email, previous, memberships)
  return NextResponse.json({ success: true, decision: 'approve', memberships })
}

async function writeMembershipAudit(
  approver: { email: string; superAdmin: boolean; user: { _id?: { toString(): string } } },
  email: string,
  previous: ShopMembership[],
  next: ShopMembership[]
) {
  const actor = {
    userId: approver.user._id?.toString() || approver.email,
    role: approver.superAdmin ? 'SUPER_ADMIN' : 'ADMIN',
  }
  for (const membership of next) {
    const before = previous.find((item) => item.shopId === membership.shopId)
    if (before?.role === membership.role) continue
    await runWithShop(membership.shopId, () =>
      writeCathaAuditLog({
        type: 'SYSTEM',
        action: before ? 'SHOP_ROLE_CHANGED' : 'SHOP_ACCESS_APPROVED',
        status: 'SUCCESS',
        userId: actor.userId,
        role: actor.role,
        endpoint: '/api/catha/users/approve',
        payloadSummary: { email, shopId: membership.shopId, role: membership.role },
      })
    ).catch(() => undefined)
  }
  for (const membership of previous) {
    if (next.some((item) => item.shopId === membership.shopId)) continue
    await runWithShop(membership.shopId, () =>
      writeCathaAuditLog({
        type: 'SYSTEM',
        action: 'SHOP_ACCESS_REMOVED',
        status: 'SUCCESS',
        userId: actor.userId,
        role: actor.role,
        endpoint: '/api/catha/users/approve',
        payloadSummary: { email, shopId: membership.shopId },
      })
    ).catch(() => undefined)
  }
}
