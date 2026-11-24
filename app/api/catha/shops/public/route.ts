import { NextResponse } from 'next/server'
import { CATHA_LOUNGE_SHOP_ID } from '@/lib/shops/constants'
import { findActiveShopBySlug } from '@/lib/shops/context'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get('shop') || CATHA_LOUNGE_SHOP_ID
  const shop = await findActiveShopBySlug(code)
  if (!shop) return NextResponse.json({ ok: false, error: 'Shop not found' }, { status: 404 })
  return NextResponse.json({
    ok: true,
    shop: {
      name: shop.name,
      slug: shop.slug,
      location: shop.location,
      phone: shop.phone,
      logoUrl: shop.logoUrl,
      menuPath: shop.menuPath,
    },
  })
}
