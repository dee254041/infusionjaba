import { NextResponse } from 'next/server'
import { stationCookieOptions } from '@/lib/station/guard'
import { normalizeStationSlug } from '@/lib/station/slug'
import { stationAuthSecret, stationCookieName, signStationToken } from '@/lib/station/token'
import { stationDb, verifyStationLogin } from '@/lib/station/store'

export const runtime = 'nodejs'

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug: raw } = await context.params
  const slug = normalizeStationSlug(raw)
  if (!slug || slug !== raw) return NextResponse.json({ error: 'Unknown shop.' }, { status: 404 })
  const body = await request.json().catch(() => null)
  const email = String(body?.email || '')
  const password = String(body?.password || '')
  const db = await stationDb()
  const user = await verifyStationLogin(db, slug, email, password)
  if (!user) return NextResponse.json({ error: 'Email or password is wrong for this shop.' }, { status: 401 })
  const token = await signStationToken(user, stationAuthSecret())
  const response = NextResponse.json({ ok: true, role: user.role, name: user.name })
  response.cookies.set(stationCookieName(slug), token, stationCookieOptions())
  return response
}
