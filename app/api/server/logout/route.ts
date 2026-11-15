import { NextResponse } from 'next/server'
import { clearControlCookie } from '@/lib/server-control-cookie'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  const response = NextResponse.json({ ok: true })
  clearControlCookie(response)
  return response
}
