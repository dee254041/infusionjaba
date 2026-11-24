import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getCathaSession } from '@/lib/catha-auth'
import { getCathaUserByEmail } from '@/lib/models/catha-user'
import { decideShopAccess } from '@/lib/station/access'
import { stationAuthSecret, stationCookieName, verifyStationToken, type StationSession } from '@/lib/station/token'

export async function readStationSession(slug: string): Promise<StationSession | null> {
  const jar = await cookies()
  const token = jar.get(stationCookieName(slug))?.value
  if (!token) return null
  const session = await verifyStationToken(token, stationAuthSecret())
  if (!session || session.shopId !== slug) return null
  return session
}

/** Only the Catha super admin can open every shop without an assignment. */
export async function readSuperAdminSession(): Promise<{ name: string } | null> {
  const session = await getCathaSession()
  const email = session?.user?.email
  if (!email) return null
  const user = await getCathaUserByEmail(email)
  if (String(user?.role || '').toUpperCase() !== 'SUPER_ADMIN') return null
  return { name: user?.name || 'Super admin' }
}

export async function listStationSessions(): Promise<StationSession[]> {
  const jar = await cookies()
  const secret = stationAuthSecret()
  const sessions: StationSession[] = []
  for (const cookie of jar.getAll()) {
    if (!cookie.name.startsWith('station.') || !cookie.name.endsWith('.session')) continue
    const session = await verifyStationToken(cookie.value, secret)
    if (session && (session.role === 'ADMIN' || session.role === 'STAFF')) sessions.push(session)
  }
  return sessions
}

export async function readAnyStationSession(): Promise<StationSession | null> {
  const sessions = await listStationSessions()
  return sessions[0] || null
}

export const CATHA_SHOP_COOKIE = 'catha_shop_id'

export async function canSeeAllStations(): Promise<boolean> {
  return Boolean(await readSuperAdminSession())
}

export async function requireStation(
  slug: string,
  minimum?: 'ADMIN',
): Promise<[StationSession, null] | [null, NextResponse]> {
  const own = await readStationSession(slug)
  const assignment = own?.role === 'ADMIN' || own?.role === 'STAFF' ? own.role : null
  const decision = decideShopAccess({
    requestedShopId: slug,
    isSuper: Boolean(await readSuperAdminSession()),
    assignment,
    minimum,
  })
  if (!decision.ok) {
    const status = assignment && minimum === 'ADMIN' ? 403 : 401
    const error = status === 403 ? 'You do not have permission for that in this shop.' : 'You are not assigned to this shop.'
    return [null, NextResponse.json({ error }, { status })]
  }
  const superAdmin = decision.role === 'SUPER' ? await readSuperAdminSession() : null
  return [
    {
      shopId: slug,
      userId: own?.userId || 'super',
      role: decision.role,
      name: own?.name || superAdmin?.name || 'Super admin',
      exp: own?.exp || Date.now() + 60_000,
    },
    null,
  ]
}

export function stationCookieOptions() {
  const secure = process.env.NODE_ENV === 'production' || (process.env.NEXTAUTH_URL || '').startsWith('https://')
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure,
    path: '/',
    maxAge: 14 * 24 * 60 * 60,
  }
}
