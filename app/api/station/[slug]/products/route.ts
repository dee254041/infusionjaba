import { NextResponse } from 'next/server'
import { requireStation } from '@/lib/station/guard'
import { listProducts, saveProduct, stationDb } from '@/lib/station/store'

export const runtime = 'nodejs'

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params
  const [, denied] = await requireStation(slug)
  if (denied) return denied
  const db = await stationDb()
  return NextResponse.json({ products: await listProducts(db, slug) })
}

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params
  const [, denied] = await requireStation(slug, 'ADMIN')
  if (denied) return denied
  const body = await request.json().catch(() => null)
  const db = await stationDb()
  const saved = await saveProduct(db, slug, {
    id: body?.id ? String(body.id) : undefined,
    name: String(body?.name || ''),
    category: String(body?.category || 'General'),
    price: Number(body?.price),
    stock: Number(body?.stock),
    visible: body?.visible !== false,
  })
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 400 })
  return NextResponse.json({ product: saved.product })
}
