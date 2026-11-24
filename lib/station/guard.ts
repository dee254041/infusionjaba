import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getCathaSession } from '@/lib/catha-auth'
import { getCathaUserByEmail } from '@/lib/models/catha-user'
import { stationAuthSecret, stationCookieName, verifyStationToken, type StationSession } from '@/lib/station/token'

export async function readStationSession(slug: string): Promise<StationSession | null> {
  const jar = await cookies()
  const token = jar.get(stationCookieName(slug))?.value
  if (!token) return null
  const session = await verifyStationToken(token, stationAuthSecret())
  if (!session || session.shopId !== slug) return null
  return session
}

/** Catha super admin and Catha admin can open every station. */
export async function readCathaStationSession(slug: string): Promise<StationSession | null> {
  const session = await getCathaSession()
  const email = session?.user?.email
  if (!email) return null
  const user = await getCathaUserByEmail(email)
  const role = String(user?.role || '').toUpperCase()
  if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') return null
  return {
    shopId: slug,
    userId: role === 'SUPER_ADMIN' ? 'super' : 'catha-admin',
    role: role === 'SUPER_ADMIN' ? 'SUPER' : 'ADMIN',
    name: user?.name || 'Admin',
    exp: Date.now() + 60_000,
  }
}

/** A station admin can open the other stations. Staff cannot. */
export async function readAnyStationAdmin(): Promise<StationSession | null> {
  const jar = await cookies()
  const secret = stationAuthSecret()
  for (const cookie of jar.getAll()) {
    if (!cookie.name.startsWith('station.') || !cookie.name.endsWith('.session')) continue
    const session = await verifyStationToken(cookie.value, secret)
    if (session?.role === 'ADMIN') return session
  }
  return null
}

export async function canSeeAllStations(): Promise<boolean> {
  if (await readCathaStationSession('catha')) return true
  return Boolean(await readAnyStationAdmin())
}

export async function requireStation(
  slug: string,
  minimum?: 'ADMIN',
): Promise<[StationSession, null] | [null, NextResponse]> {
  const own = await readStationSession(slug)
  const catha = await readCathaStationSession(slug)
  const visitingAdmin = await readAnyStationAdmin()
  let session = own
  if (catha?.role === 'SUPER') session = catha
  else if (catha?.role === 'ADMIN' || own?.role === 'ADMIN' || visitingAdmin) {
    session = {
      ...(own?.role === 'ADMIN' ? own : visitingAdmin || catha)!,
      shopId: slug,
      role: 'ADMIN',
    }
  }
  if (!session) return [null, NextResponse.json({ error: 'Sign in to this shop.' }, { status: 401 })]
  if (minimum === 'ADMIN' && session.role === 'STAFF') {
    return [null, NextResponse.json({ error: 'Only an admin can do that.' }, { status: 403 })]
  }
  return [session, null]
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
