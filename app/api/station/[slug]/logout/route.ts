import { NextResponse } from 'next/server'
import { stationCookieOptions } from '@/lib/station/guard'
import { stationCookieName } from '@/lib/station/token'

export const runtime = 'nodejs'

export async function POST(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params
  const response = NextResponse.json({ ok: true })
  response.cookies.set(stationCookieName(slug), '', { ...stationCookieOptions(), maxAge: 0 })
  return response
}
