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

/** The Catha super admin is the one super admin for every station. */
export async function readSuperStationSession(slug: string): Promise<StationSession | null> {
  const session = await getCathaSession()
  const email = session?.user?.email
  if (!email) return null
  const user = await getCathaUserByEmail(email)
  if (String(user?.role || '').toUpperCase() !== 'SUPER_ADMIN') return null
  return {
    shopId: slug,
    userId: 'super',
    role: 'SUPER',
    name: user?.name || 'Super admin',
    exp: Date.now() + 60_000,
  }
}

export async function requireStation(
  slug: string,
  minimum?: 'ADMIN',
): Promise<[StationSession, null] | [null, NextResponse]> {
  const session = (await readStationSession(slug)) || (await readSuperStationSession(slug))
  if (!session) return [null, NextResponse.json({ error: 'Sign in to this shop.' }, { status: 401 })]
  if (minimum === 'ADMIN' && session.role === 'STAFF') {
    return [null, NextResponse.json({ error: 'Only this station admin can do that.' }, { status: 403 })]
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
