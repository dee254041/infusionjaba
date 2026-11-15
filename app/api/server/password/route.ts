import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { SERVER_CONTROL_COOKIE, signServerControlSession } from '@/lib/server-control'
import { attachControlCookie } from '@/lib/server-control-cookie'
import { hashControlPassword, passwordChangeError } from '@/lib/server-control-password'
import { passwordMatches, requireControlRequest, saveControlPassword } from '@/lib/server-control-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const jar = await cookies()
  const session = await requireControlRequest(jar.get(SERVER_CONTROL_COOKIE)?.value)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { currentPassword?: unknown; nextPassword?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const currentPassword = String(body.currentPassword || '')
  const nextPassword = String(body.nextPassword || '')
  const rule = passwordChangeError(nextPassword)
  if (rule) return NextResponse.json({ error: rule }, { status: 400 })
  if (nextPassword === currentPassword) {
    return NextResponse.json({ error: 'Choose a different password.' }, { status: 400 })
  }

  const currentOk = await passwordMatches(currentPassword, session.passwordHash)
  if (!currentOk) return NextResponse.json({ error: 'Current password is wrong.' }, { status: 401 })

  const passwordHash = await hashControlPassword(nextPassword)
  const tokenVersion = await saveControlPassword(passwordHash, session.email)
  const token = await signServerControlSession(session.email, tokenVersion)
  if (!token) return NextResponse.json({ error: 'Could not save the password.' }, { status: 500 })

  const response = NextResponse.json({ ok: true })
  attachControlCookie(response, token)
  return response
}
