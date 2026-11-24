import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { stationAuthSecret, stationCookieName, verifyStationToken, type StationRole, type StationSession } from '@/lib/station/token'

export async function readStationSession(slug: string): Promise<StationSession | null> {
  const jar = await cookies()
  const token = jar.get(stationCookieName(slug))?.value
  if (!token) return null
  const session = await verifyStationToken(token, stationAuthSecret())
  if (!session || session.shopId !== slug) return null
  return session
}

export async function requireStation(
  slug: string,
  role?: StationRole,
): Promise<[StationSession, null] | [null, NextResponse]> {
  const session = await readStationSession(slug)
  if (!session) return [null, NextResponse.json({ error: 'Sign in to this shop.' }, { status: 401 })]
  if (role === 'OWNER' && session.role !== 'OWNER') {
    return [null, NextResponse.json({ error: 'Only the shop owner can do that.' }, { status: 403 })]
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
