import { NextResponse } from 'next/server'
import { stationCookieOptions, CATHA_SHOP_COOKIE } from '@/lib/station/guard'
import { stationAuthSecret, stationCookieName, signStationToken } from '@/lib/station/token'
import { loginByEmailPin, stationDb } from '@/lib/station/store'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const db = await stationDb()
  const result = await loginByEmailPin(db, String(body?.email || ''), String(body?.pin || ''))
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 401 })
  const response = NextResponse.json({ name: result.user.name, shops: result.user.shops })
  const secret = stationAuthSecret()
  for (const shop of result.user.shops) {
    const token = await signStationToken(
      {
        shopId: shop.id,
        userId: result.user.userId,
        role: shop.role === 'ADMIN' ? 'ADMIN' : 'STAFF',
        name: result.user.name,
      },
      secret,
    )
    response.cookies.set(stationCookieName(shop.id), token, stationCookieOptions())
  }
  response.cookies.set(CATHA_SHOP_COOKIE, result.user.shops[0].id, stationCookieOptions())
  return response
}
