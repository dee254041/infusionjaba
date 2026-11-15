import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { SERVER_CONTROL_COOKIE } from '@/lib/server-control'
import { requireControlRequest } from '@/lib/server-control-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const jar = await cookies()
  const session = await requireControlRequest(jar.get(SERVER_CONTROL_COOKIE)?.value)
  if (!session) return NextResponse.json({ authenticated: false }, { status: 401 })
  return NextResponse.json({
    authenticated: true,
    email: session.email,
    online: session.online,
    mustChangePassword: !session.passwordHash,
  })
}
