import { NextResponse } from 'next/server'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit-simple'
import { getStation, listProducts, stationDb } from '@/lib/station/store'

export const runtime = 'nodejs'

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const limited = checkRateLimit(`menu-catalog:${getClientIp(request)}`, 60, 60_000)
  if (!limited.ok) return NextResponse.json({ error: 'Slow down a moment.' }, { status: 429 })
  const { slug } = await context.params
  const db = await stationDb()
  const shop = await getStation(db, slug)
  if (!shop?.active) return NextResponse.json({ error: 'This menu is not available.' }, { status: 404 })
  const products = await listProducts(db, slug, true)
  return NextResponse.json({
    shop: { name: shop.name, slug: shop.slug, location: shop.location },
    products: products.filter((product) => product.stock > 0),
  })
}
