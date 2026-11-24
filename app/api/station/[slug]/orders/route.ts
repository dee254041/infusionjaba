import { NextResponse } from 'next/server'
import { requireStation } from '@/lib/station/guard'
import { createStationOrder, getOrder, listOrders, markStationOrderPaid, stationDb } from '@/lib/station/store'
import { normalizeKenyaPhone } from '@/lib/phone-utils'

export const runtime = 'nodejs'

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params
  const [, denied] = await requireStation(slug)
  if (denied) return denied
  const id = new URL(request.url).searchParams.get('id')
  const db = await stationDb()
  if (id) {
    const order = await getOrder(db, slug, id)
    if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
    return NextResponse.json({ order })
  }
  return NextResponse.json({ orders: await listOrders(db, slug) })
}

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params
  const [session, denied] = await requireStation(slug)
  if (denied) return denied
  const body = await request.json().catch(() => null)
  const method = body?.paymentMethod === 'cash' ? 'cash' : 'mpesa'
  const db = await stationDb()
  const created = await createStationOrder(db, slug, {
    items: Array.isArray(body?.items) ? body.items : [],
    source: 'pos',
    paymentMethod: method,
    table: String(body?.table || ''),
    customerPhone: normalizeKenyaPhone(String(body?.customerPhone || '')) || '',
    cashier: session.name,
  })
  if (!created.ok) return NextResponse.json({ error: created.error }, { status: 400 })
  return NextResponse.json({ order: created.order })
}

export async function PATCH(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params
  const [, denied] = await requireStation(slug)
  if (denied) return denied
  const body = await request.json().catch(() => null)
  if (body?.action !== 'cash') {
    return NextResponse.json({ error: 'Unsupported order update.' }, { status: 400 })
  }
  const db = await stationDb()
  const paid = await markStationOrderPaid(db, slug, String(body?.id || ''), 'cash')
  if (!paid.ok) return NextResponse.json({ error: paid.error }, { status: 400 })
  return NextResponse.json({ order: paid.order })
}
