import { NextResponse } from 'next/server'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit-simple'
import { normalizeKenyaPhone } from '@/lib/phone-utils'
import { getStation, createStationOrder, getOrder, stationDb } from '@/lib/station/store'

export const runtime = 'nodejs'

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params
  const id = new URL(request.url).searchParams.get('id') || ''
  if (!id.startsWith(`stn_${slug}_`)) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  const db = await stationDb()
  const order = await getOrder(db, slug, id)
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  return NextResponse.json({
    order: { id: order.id, paymentStatus: order.paymentStatus, total: order.total, status: order.status },
  })
}

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const limited = checkRateLimit(`menu-order:${getClientIp(request)}`, 20, 60_000)
  if (!limited.ok) return NextResponse.json({ error: 'Slow down a moment.' }, { status: 429 })
  const { slug } = await context.params
  const db = await stationDb()
  const shop = await getStation(db, slug)
  if (!shop?.active) return NextResponse.json({ error: 'This menu is not available.' }, { status: 404 })
  const body = await request.json().catch(() => null)
  const phone = normalizeKenyaPhone(String(body?.phone || ''))
  if (!phone) return NextResponse.json({ error: 'Enter the M-Pesa phone number.' }, { status: 400 })
  const created = await createStationOrder(db, slug, {
    items: Array.isArray(body?.items) ? body.items : [],
    source: 'menu',
    paymentMethod: 'mpesa',
    table: String(body?.table || ''),
    customerPhone: phone,
    customerName: String(body?.name || ''),
  })
  if (!created.ok) return NextResponse.json({ error: created.error }, { status: 400 })
  return NextResponse.json({ order: created.order })
}
