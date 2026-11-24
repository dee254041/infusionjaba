import { NextResponse } from 'next/server'
import { isSuperAdminRole, mergeShopAssignment } from '@/lib/shops/access'
import { readActiveShopForSession } from '@/lib/shops/context'
import { getCathaUserByEmail, updateCathaUser } from '@/lib/models/catha-user'
import { writeCathaAuditLog } from '@/lib/catha-audit-log'
import { runWithShop } from '@/lib/shops/als'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const active = await readActiveShopForSession()
  if (!active) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (!isSuperAdminRole(active.user.role)) {
    return NextResponse.json({ ok: false, error: 'Only a super admin can assign shop staff.' }, { status: 403 })
  }
  const body = await request.json().catch(() => null)
  const email = String(body?.email || '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: 'A valid staff email is required.' }, { status: 400 })
  }
  const user = await getCathaUserByEmail(email)
  if (!user) {
    return NextResponse.json(
      { ok: false, error: 'No staff account uses that email. Ask them to sign in once, then assign them.' },
      { status: 404 }
    )
  }
  const shopIds = mergeShopAssignment(user.shopIds, active.shop.shopId)
  const updated = await updateCathaUser(email, { shopIds })
  await runWithShop(active.shop.shopId, () =>
    writeCathaAuditLog({
      type: 'SYSTEM',
      action: 'SHOP_MEMBER_ASSIGNED',
      status: 'SUCCESS',
      userId: active.user._id?.toString() || active.user.email,
      role: active.user.role,
      endpoint: '/api/catha/shops/members',
      payloadSummary: { email, shopId: active.shop.shopId, role: updated?.role || user.role },
    })
  ).catch(() => undefined)
  return NextResponse.json({
    ok: true,
    user: { email, role: updated?.role || user.role, shopIds },
  })
}
