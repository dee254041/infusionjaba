import { NextResponse } from 'next/server'
import { requireStation } from '@/lib/station/guard'
import { getStation, stationDb, stationSummary } from '@/lib/station/store'

export const runtime = 'nodejs'

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params
  const [session, denied] = await requireStation(slug)
  if (denied) return denied
  const db = await stationDb()
  const shop = await getStation(db, session.shopId)
  if (!shop) return NextResponse.json({ error: 'Shop not found.' }, { status: 404 })
  return NextResponse.json({ shop, me: { name: session.name, role: session.role }, summary: await stationSummary(db, slug) })
}
