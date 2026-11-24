import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import {
  CATHA_SHOP_COOKIE,
  canSeeAllStations,
  listStationSessions,
  readStationSession,
  stationCookieOptions,
} from '@/lib/station/guard'
import { getStation, listStations, stationDb } from '@/lib/station/store'

export const runtime = 'nodejs'

const CATHA = { id: 'catha', name: 'Catha Lounge' }

export async function GET() {
  const jar = await cookies()
  const wanted = jar.get(CATHA_SHOP_COOKIE)?.value || ''
  const isSuper = await canSeeAllStations()
  const sessions = await listStationSessions()
  const db = await stationDb()

  if (!isSuper && sessions.length === 0) {
    return NextResponse.json({ shop: CATHA, shops: [CATHA], role: 'CATHA' })
  }

  const assignedIds = new Set(sessions.map((session) => session.shopId))
  let id = 'catha'
  if (isSuper) {
    id = wanted && wanted !== 'catha' ? wanted : 'catha'
  } else if (wanted && assignedIds.has(wanted)) {
    id = wanted
  } else {
    id = sessions[0]?.shopId || ''
  }

  const found = id === 'catha' ? null : await getStation(db, id)
  if (id !== 'catha' && !found) {
    return NextResponse.json({ error: 'Shop not found.' }, { status: 404 })
  }
  const current = found ? { id: found.slug, name: found.name } : CATHA
  const currentSession = sessions.find((session) => session.shopId === current.id)
  const shops = isSuper
    ? [CATHA, ...(await listStations(db)).filter((shop) => shop.active).map((shop) => ({ id: shop.slug, name: shop.name }))]
    : await assignedShops(db, sessions)

  return NextResponse.json({
    shop: current,
    shops,
    role: isSuper ? 'SUPER' : currentSession?.role || 'STAFF',
  })
}

async function assignedShops(
  db: Awaited<ReturnType<typeof stationDb>>,
  sessions: Awaited<ReturnType<typeof listStationSessions>>,
) {
  const shops = []
  for (const session of sessions) {
    const shop = await getStation(db, session.shopId)
    if (shop?.active) shops.push({ id: shop.slug, name: shop.name })
  }
  return shops
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const id = String(body?.id || '')
  const isSuper = await canSeeAllStations()
  const db = await stationDb()
  if (id === 'catha') {
    if (!isSuper) return NextResponse.json({ error: 'You are not assigned to Catha Lounge.' }, { status: 403 })
    const response = NextResponse.json({ shop: CATHA })
    response.cookies.set(CATHA_SHOP_COOKIE, 'catha', stationCookieOptions())
    return response
  }
  const shop = await getStation(db, id)
  if (!shop?.active) return NextResponse.json({ error: 'Shop not found.' }, { status: 404 })
  const allowed = isSuper || Boolean(await readStationSession(id))
  if (!allowed) return NextResponse.json({ error: 'You are not assigned to this shop.' }, { status: 403 })
  const response = NextResponse.json({ shop: { id: shop.slug, name: shop.name } })
  response.cookies.set(CATHA_SHOP_COOKIE, shop.slug, stationCookieOptions())
  return response
}
