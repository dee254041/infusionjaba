import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { SERVER_CONTROL_COOKIE } from '@/lib/server-control'
import { requireControlRequest, writePublicSiteOnline } from '@/lib/server-control-store'
import { clearPublicSiteOnlineCache } from '@/lib/public-site-online'
import { applyControlHeaders, isSameOriginControlPost, readJsonBody, rejectCrossSite } from '@/lib/server-control-guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!isSameOriginControlPost(request)) return applyControlHeaders(rejectCrossSite())
  const jar = await cookies()
  const session = await requireControlRequest(jar.get(SERVER_CONTROL_COOKIE)?.value)
  if (!session) return applyControlHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))

  const parsed = await readJsonBody(request)
  const body = (parsed && typeof parsed === 'object' ? parsed : null) as { online?: unknown } | null
  if (!body) return applyControlHeaders(NextResponse.json({ error: 'Invalid request' }, { status: 400 }))
  if (typeof body.online !== 'boolean') {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  await writePublicSiteOnline(body.online, session.email)
  clearPublicSiteOnlineCache()
  return applyControlHeaders(NextResponse.json({ ok: true, online: body.online }))
}
