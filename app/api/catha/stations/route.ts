import { NextResponse } from 'next/server'
import { requireSuperAdminApi } from '@/lib/catha-auth'
import { createStation, listStations, setStationActive, stationDb } from '@/lib/station/store'

export const runtime = 'nodejs'

export async function GET() {
  const [, denied] = await requireSuperAdminApi()
  if (denied) return denied
  const db = await stationDb()
  return NextResponse.json({ shops: await listStations(db) })
}

export async function POST(request: Request) {
  const [, denied] = await requireSuperAdminApi()
  if (denied) return denied
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Enter the shop details.' }, { status: 400 })
  }
  const db = await stationDb()
  if (typeof body.active === 'boolean' && typeof body.slug === 'string' && !body.name) {
    const ok = await setStationActive(db, body.slug, body.active)
    if (!ok) return NextResponse.json({ error: 'Shop not found.' }, { status: 404 })
    return NextResponse.json({ ok: true })
  }
  const created = await createStation(db, {
    name: String(body.name || ''),
    phone: String(body.phone || ''),
    location: String(body.location || ''),
    adminName: String(body.adminName || body.ownerName || ''),
    adminEmail: String(body.adminEmail || body.ownerEmail || ''),
    adminPin: String(body.adminPin || body.ownerPassword || ''),
  })
  if (!created.ok) return NextResponse.json({ error: created.error }, { status: 400 })
  return NextResponse.json({ shop: created.shop })
}
