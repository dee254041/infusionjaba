import { NextResponse } from 'next/server'
import { isSuperAdminRole, needsShopSwitcher } from '@/lib/shops/access'
import { createShop } from '@/lib/shops/create-shop'
import { readActiveShopForSession } from '@/lib/shops/context'
import { validateCreateShopInput } from '@/lib/shops/validate'

export const dynamic = 'force-dynamic'

function publicShop(shop: { shopId: string; name: string; slug: string; code: string; location: string; status: string; logoUrl: string; menuPath: string }) {
  return {
    shopId: shop.shopId,
    name: shop.name,
    slug: shop.slug,
    code: shop.code,
    location: shop.location,
    status: shop.status,
    logoUrl: shop.logoUrl,
    menuPath: shop.menuPath,
  }
}

export async function GET() {
  const active = await readActiveShopForSession()
  if (!active) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const role = String(active.user.role || '')
  return NextResponse.json({
    ok: true,
    canCreate: isSuperAdminRole(role),
    showSwitcher: needsShopSwitcher(active.user, active.shops.length),
    active: publicShop(active.shop),
    shops: active.shops.map(publicShop),
  })
}

export async function POST(request: Request) {
  const active = await readActiveShopForSession()
  if (!active) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (!isSuperAdminRole(active.user.role)) {
    return NextResponse.json({ ok: false, error: 'Only a super admin can create a shop.' }, { status: 403 })
  }
  const parsed = validateCreateShopInput(await request.json().catch(() => null))
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 })
  try {
    const shop = await createShop(parsed.value, {
      email: active.user.email,
      userId: active.user._id?.toString() || active.user.email,
      role: active.user.role,
    })
    return NextResponse.json({ ok: true, shop })
  } catch (error) {
    const status = (error as { status?: number }).status || 500
    const message = error instanceof Error ? error.message : 'Failed to create shop'
    return NextResponse.json({ ok: false, error: message }, { status })
  }
}
