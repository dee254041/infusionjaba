import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth-catha'
import { getLoungeTradingStatus } from '@/lib/catha-trading-hours'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const status = await getLoungeTradingStatus()
  return NextResponse.json(status, { headers: { 'Cache-Control': 'no-store' } })
}
