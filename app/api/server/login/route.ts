import { NextResponse } from 'next/server'
import { isServerControlEmail, serverControlSigningSecret, signServerControlSession } from '@/lib/server-control'
import { attachControlCookie } from '@/lib/server-control-cookie'
import {
  clearLoginFailures,
  loginLocked,
  markLoginFailure,
  passwordMatches,
  readControlAuth,
} from '@/lib/server-control-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  return (forwarded?.split(',')[0] || request.headers.get('x-real-ip') || 'unknown').trim()
}

export async function POST(request: Request) {
  const ip = clientIp(request)
  if (!serverControlSigningSecret()) {
    console.error('[server-control] signing secret is not set')
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
  }

  try {
    if (await loginLocked(ip)) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }
  } catch (error) {
    console.error('[server-control] lock check failed', error)
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
  }

  let body: { email?: unknown; password?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
  }

  const emailOk = isServerControlEmail(body.email)
  let auth
  try {
    auth = await readControlAuth()
  } catch (error) {
    console.error('[server-control] auth read failed', error)
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
  }

  const passwordOk = await passwordMatches(String(body.password || ''), auth.passwordHash)
  if (!emailOk || !passwordOk) {
    try {
      await markLoginFailure(ip)
    } catch (error) {
      console.error('[server-control] lock update failed', error)
    }
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
  }

  const token = await signServerControlSession(String(body.email), auth.tokenVersion)
  if (!token) return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })

  try {
    await clearLoginFailures(ip)
  } catch {
    /* login can still succeed */
  }

  const response = NextResponse.json({ ok: true })
  attachControlCookie(response, token)
  return response
}
