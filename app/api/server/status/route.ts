import { NextResponse } from 'next/server'
import { readPublicSiteOnline } from '@/lib/server-control-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const online = await Promise.race([
      readPublicSiteOnline(),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 800)),
    ])
    return NextResponse.json(
      { online },
      { headers: { 'cache-control': 'no-store' } }
    )
  } catch (error) {
    console.error('[server-control] status read failed', error)
    return NextResponse.json({ online: true }, { headers: { 'cache-control': 'no-store' } })
  }
}
