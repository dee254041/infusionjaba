import { NextResponse } from 'next/server'
import { ACTIVE_SHOP_COOKIE } from '@/lib/shops/constants'
import { mayAccessShop } from '@/lib/shops/access'
import { readActiveShopForSession, listShopRecords } from '@/lib/shops/context'
import { sealActiveShopCookie, shopCookieSecret } from '@/lib/shops/cookie'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const active = await readActiveShopForSession()
  if (!active) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => null)
  const shopId = String(body?.shopId || '').trim()
  if (!shopId) return NextResponse.json({ ok: false, error: 'Shop is required.' }, { status: 400 })
  const shop = (await listShopRecords()).find((row) => row.shopId === shopId)
  if (!shop || !mayAccessShop(active.user, shop)) {
    return NextResponse.json({ ok: false, error: 'You do not have access to that shop.' }, { status: 403 })
  }
  const token = sealActiveShopCookie(
    { shopId: shop.shopId, userId: String(active.user._id), exp: Date.now() + 30 * 24 * 60 * 60 * 1000 },
    shopCookieSecret()
  )
  const response = NextResponse.json({
    ok: true,
    active: { shopId: shop.shopId, name: shop.name, slug: shop.slug, menuPath: shop.menuPath },
  })
  response.cookies.set(ACTIVE_SHOP_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  })
  return response
}
