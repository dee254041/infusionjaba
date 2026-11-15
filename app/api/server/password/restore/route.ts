import { NextResponse } from 'next/server'
import { createHash, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'
import { SERVER_CONTROL_COOKIE, signServerControlSession } from '@/lib/server-control'
import { attachControlCookie } from '@/lib/server-control-cookie'
import { applyControlHeaders, clientIp, isSameOriginControlPost, readJsonBody, rejectCrossSite } from '@/lib/server-control-guard'
import { RESTORE_PHRASE } from '@/lib/server-control-password'
import {
  markLoginFailure,
  passwordMatches,
  requireControlRequest,
  restoreBootstrapPassword,
} from '@/lib/server-control-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function phraseMatches(input: string): boolean {
  const a = createHash('sha256').update(input).digest()
  const b = createHash('sha256').update(RESTORE_PHRASE).digest()
  return timingSafeEqual(a, b)
}

export async function POST(request: Request) {
  if (!isSameOriginControlPost(request)) return applyControlHeaders(rejectCrossSite())
  const jar = await cookies()
  const session = await requireControlRequest(jar.get(SERVER_CONTROL_COOKIE)?.value)
  if (!session) return applyControlHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))

  const parsed = await readJsonBody(request)
  const body = (parsed && typeof parsed === 'object' ? parsed : null) as {
    currentPassword?: unknown
    phrase?: unknown
  } | null
  if (!body) return applyControlHeaders(NextResponse.json({ error: 'Rejected' }, { status: 400 }))

  const phraseOk = phraseMatches(String(body.phrase || ''))
  const currentOk = await passwordMatches(String(body.currentPassword || ''), session.passwordHash)
  if (!phraseOk || !currentOk) {
    try {
      await markLoginFailure(clientIp(request))
    } catch {
      /* still reject */
    }
    return applyControlHeaders(NextResponse.json({ error: 'Rejected' }, { status: 401 }))
  }

  const tokenVersion = await restoreBootstrapPassword(session.email)
  const token = await signServerControlSession(session.email, tokenVersion)
  if (!token) return applyControlHeaders(NextResponse.json({ error: 'Rejected' }, { status: 500 }))

  const response = NextResponse.json({ ok: true })
  attachControlCookie(response, token)
  return applyControlHeaders(response)
}
