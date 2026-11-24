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
  const pin = String(body?.pin || '')
  const db = await stationDb()
  const result = await verifyStationLogin(db, slug, email, pin)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 401 })
  const token = await signStationToken(result.user, stationAuthSecret())
  const response = NextResponse.json({ ok: true, role: result.user.role, name: result.user.name })
  response.cookies.set(stationCookieName(slug), token, stationCookieOptions())
  return response
}
