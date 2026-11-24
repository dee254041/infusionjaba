import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getCathaSession } from '@/lib/catha-auth'
import {
  CATHA_SHOP_COOKIE,
  canSeeAllStations,
  listStationSessions,
  readStationSession,
  stationCookieOptions,
} from '@/lib/station/guard'
import { getCathaUserByEmail, readCathaShopAssignments, type CathaShopAssignment } from '@/lib/models/catha-user'
import { getStation, listStations, stationDb } from '@/lib/station/store'

export const runtime = 'nodejs'

const CATHA = { id: 'catha', name: 'Catha Lounge' }

export async function GET() {
  const jar = await cookies()
  const wanted = jar.get(CATHA_SHOP_COOKIE)?.value || ''
  const isSuper = await canSeeAllStations()
  const sessions = await listStationSessions()
  const db = await stationDb()
  const account = await getCathaSession()
  const accountUser = account?.user?.email ? await getCathaUserByEmail(account.user.email) : null
  const explicit = accountUser ? readCathaShopAssignments(accountUser.shopAssignments) : null

  if (!isSuper && explicit) {
    if (explicit.length === 0) {
      return NextResponse.json({ error: 'You are not assigned to a shop.' }, { status: 403 })
    }
    const allowed = new Set(explicit.map((item) => item.shopId))
    const id = wanted && allowed.has(wanted) ? wanted : explicit[0].shopId
    const shops = await shopsFromAssignments(db, explicit)
    const current = shops.find((shop) => shop.id === id) || shops[0]
    const role = current?.id === 'catha' ? 'CATHA' : explicit.find((item) => item.shopId === current?.id)?.role || 'STAFF'
    return NextResponse.json({ shop: current, shops, role })
  }

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

async function shopsFromAssignments(
  db: Awaited<ReturnType<typeof stationDb>>,
  assignments: CathaShopAssignment[],
) {
  const shops = []
  for (const item of assignments) {
    if (item.shopId === 'catha') {
      shops.push(CATHA)
      continue
    }
    const shop = await getStation(db, item.shopId)
    if (shop?.active) shops.push({ id: shop.slug, name: shop.name })
  }
  return shops
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
  const account = await getCathaSession()
  const accountUser = account?.user?.email ? await getCathaUserByEmail(account.user.email) : null
  const explicit = accountUser ? readCathaShopAssignments(accountUser.shopAssignments) : null
  const db = await stationDb()
  if (id === 'catha') {
    const allowed = isSuper || (explicit == null && Boolean(accountUser)) || Boolean(explicit?.some((item) => item.shopId === 'catha'))
    if (!allowed) return NextResponse.json({ error: 'You are not assigned to Catha Lounge.' }, { status: 403 })
    const response = NextResponse.json({ shop: CATHA })
    response.cookies.set(CATHA_SHOP_COOKIE, 'catha', stationCookieOptions())
    return response
  }
  const shop = await getStation(db, id)
  if (!shop?.active) return NextResponse.json({ error: 'Shop not found.' }, { status: 404 })
  const allowed = isSuper || Boolean(explicit?.some((item) => item.shopId === id)) || Boolean(await readStationSession(id))
  if (!allowed) return NextResponse.json({ error: 'You are not assigned to this shop.' }, { status: 403 })
  const response = NextResponse.json({ shop: { id: shop.slug, name: shop.name } })
  response.cookies.set(CATHA_SHOP_COOKIE, shop.slug, stationCookieOptions())
  return response
}
