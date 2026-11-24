import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import {
  CATHA_SHOP_COOKIE,
  readAnyStationAdmin,
  readAnyStationSession,
  readCathaStationSession,
  readStationSession,
  stationCookieOptions,
} from '@/lib/station/guard'
import { getStation, listStations, stationDb } from '@/lib/station/store'

export const runtime = 'nodejs'

const CATHA = { id: 'catha', name: 'Catha Lounge' }

export async function GET() {
  const jar = await cookies()
  const wanted = jar.get(CATHA_SHOP_COOKIE)?.value || ''
  const catha = await readCathaStationSession('catha')
  const admin = await readAnyStationAdmin()
  const person = await readAnyStationSession()
  const db = await stationDb()
  let id = 'catha'
  if (wanted && wanted !== 'catha' && (catha || admin || (await readStationSession(wanted)))) id = wanted
  else if (!catha && person) id = person.shopId
  const found = id === 'catha' ? null : await getStation(db, id)
  if (id !== 'catha' && !found) return NextResponse.json({ shop: CATHA, shops: [CATHA], role: catha?.role || 'STAFF' })
  const current = found ? { id: found.slug, name: found.name } : CATHA
  let shops = [current]
  if (catha || admin) {
    const stations = await listStations(db)
    shops = [CATHA, ...stations.filter((item) => item.active).map((item) => ({ id: item.slug, name: item.name }))]
  }
  return NextResponse.json({
    shop: current,
    shops,
    role: catha?.role || (admin ? 'ADMIN' : person?.role || 'STAFF'),
  })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const id = String(body?.id || '')
  const catha = await readCathaStationSession('catha')
  const admin = await readAnyStationAdmin()
  const db = await stationDb()
  if (id === 'catha') {
    if (!catha) return NextResponse.json({ error: 'Only a Catha admin works in the lounge.' }, { status: 403 })
    const response = NextResponse.json({ shop: CATHA })
    response.cookies.set(CATHA_SHOP_COOKIE, 'catha', stationCookieOptions())
    return response
  }
  const shop = await getStation(db, id)
  if (!shop?.active) return NextResponse.json({ error: 'Shop not found.' }, { status: 404 })
  const allowed = catha || admin || (await readStationSession(id))
  if (!allowed) return NextResponse.json({ error: 'You are not placed on this shop.' }, { status: 403 })
  const response = NextResponse.json({ shop: { id: shop.slug, name: shop.name } })
  response.cookies.set(CATHA_SHOP_COOKIE, shop.slug, stationCookieOptions())
  return response
}
