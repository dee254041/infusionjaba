import { NextResponse } from 'next/server'
import { resolvePublicSiteOnline } from '@/lib/public-site-online'
import { readPublicSiteOnline } from '@/lib/server-control-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'cache-control': 'no-store' }

export async function GET() {
  try {
    const online = await readPublicSiteOnline()
    return NextResponse.json(resolvePublicSiteOnline(online), { headers: NO_STORE })
  } catch (error) {
    console.error('[server-control] status read failed', error)
    return NextResponse.json({ online: true, confirmed: false }, { headers: NO_STORE })
  }
}
