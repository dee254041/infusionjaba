import { NextResponse } from 'next/server'
import { readPublicSiteOnline } from '@/lib/server-control-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STICKY_OFFLINE_MS = 2 * 60 * 1000
let stickyOfflineUntil = 0

function remember(online: boolean) {
  stickyOfflineUntil = online ? 0 : Date.now() + STICKY_OFFLINE_MS
}

export async function GET() {
  const read = readPublicSiteOnline()
    .then((online) => {
      remember(online)
      return online as boolean | undefined
    })
    .catch((error) => {
      console.error('[server-control] status read failed', error)
      return undefined
    })

  const result = await Promise.race([
    read,
    new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 2000)),
  ])

  const online = result === false || (result === undefined && Date.now() < stickyOfflineUntil) ? false : result === true
  return NextResponse.json({ online }, { headers: { 'cache-control': 'no-store' } })
}
