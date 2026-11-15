import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { SERVER_CONTROL_COOKIE, signServerControlSession } from '@/lib/server-control'
import { attachControlCookie } from '@/lib/server-control-cookie'
import { applyControlHeaders, isSameOriginControlPost, rejectCrossSite } from '@/lib/server-control-guard'
import { requireControlRequest } from '@/lib/server-control-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!isSameOriginControlPost(request)) return applyControlHeaders(rejectCrossSite())
  const jar = await cookies()
  const session = await requireControlRequest(jar.get(SERVER_CONTROL_COOKIE)?.value)
  if (!session) return applyControlHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))

  const token = await signServerControlSession(session.email, session.tokenVersion)
  if (!token) return applyControlHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))

  const response = NextResponse.json({ ok: true })
  attachControlCookie(response, token)
  return applyControlHeaders(response)
}
