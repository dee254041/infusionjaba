import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { SERVER_CONTROL_COOKIE } from '@/lib/server-control'
import { requireControlRequest, writePublicSiteOnline } from '@/lib/server-control-store'
import { clearPublicSiteOnlineCache } from '@/lib/public-site-online'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const jar = await cookies()
  const session = await requireControlRequest(jar.get(SERVER_CONTROL_COOKIE)?.value)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { online?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  if (typeof body.online !== 'boolean') {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  await writePublicSiteOnline(body.online, session.email)
  clearPublicSiteOnlineCache()
  return NextResponse.json({ ok: true, online: body.online })
}
