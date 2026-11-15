import { NextResponse } from 'next/server'
import { clearControlCookie } from '@/lib/server-control-cookie'
import { applyControlHeaders, isSameOriginControlPost, rejectCrossSite } from '@/lib/server-control-guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!isSameOriginControlPost(request)) return applyControlHeaders(rejectCrossSite())
  const response = NextResponse.json({ ok: true })
  clearControlCookie(response)
  return applyControlHeaders(response)
}
