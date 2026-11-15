import { NextResponse } from 'next/server'
import { isServerControlEmail, serverControlSigningSecret, signServerControlSession } from '@/lib/server-control'
import { attachControlCookie } from '@/lib/server-control-cookie'
import {
  applyControlHeaders,
  clientIp,
  holdMinimum,
  isSameOriginControlPost,
  readJsonBody,
  rejectCrossSite,
} from '@/lib/server-control-guard'
import {
  clearLoginFailures,
  loginLocked,
  markLoginFailure,
  passwordMatches,
  readControlAuth,
} from '@/lib/server-control-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const started = Date.now()
  const ip = clientIp(request)
  if (!isSameOriginControlPost(request)) return applyControlHeaders(rejectCrossSite())
  if (!serverControlSigningSecret()) {
    console.error('[server-control] signing secret is not set')
    await holdMinimum(started)
    return applyControlHeaders(NextResponse.json({ error: 'Invalid email or password' }, { status: 401 }))
  }

  try {
    if (await loginLocked(ip)) {
      await holdMinimum(started)
      return applyControlHeaders(NextResponse.json({ error: 'Invalid email or password' }, { status: 401 }))
    }
  } catch (error) {
    console.error('[server-control] lock check failed', error)
    await holdMinimum(started)
    return applyControlHeaders(NextResponse.json({ error: 'Invalid email or password' }, { status: 401 }))
  }

  const parsed = await readJsonBody(request)
  const body = (parsed && typeof parsed === 'object' ? parsed : {}) as { email?: unknown; password?: unknown }

  const emailOk = isServerControlEmail(body.email)
  let auth
  try {
    auth = await readControlAuth()
  } catch (error) {
    console.error('[server-control] auth read failed', error)
    await holdMinimum(started)
    return applyControlHeaders(NextResponse.json({ error: 'Invalid email or password' }, { status: 401 }))
  }

  const passwordOk = await passwordMatches(String(body.password || ''), auth.passwordHash)
  if (!emailOk || !passwordOk) {
    try {
      await markLoginFailure(ip)
    } catch (error) {
      console.error('[server-control] lock update failed', error)
    }
    await holdMinimum(started)
    return applyControlHeaders(NextResponse.json({ error: 'Invalid email or password' }, { status: 401 }))
  }

  const token = await signServerControlSession(String(body.email), auth.tokenVersion)
  if (!token) {
    await holdMinimum(started)
    return applyControlHeaders(NextResponse.json({ error: 'Invalid email or password' }, { status: 401 }))
  }

  try {
    await clearLoginFailures(ip)
  } catch {
    /* login can still succeed */
  }

  await holdMinimum(started)
  const response = NextResponse.json({ ok: true })
  attachControlCookie(response, token)
  return applyControlHeaders(response)
}
