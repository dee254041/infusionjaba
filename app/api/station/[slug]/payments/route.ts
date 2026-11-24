import { NextResponse } from 'next/server'
import { requireStation } from '@/lib/station/guard'
import { listStationPayments, stationDb } from '@/lib/station/store'

export const runtime = 'nodejs'

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params
  const [, denied] = await requireStation(slug)
  if (denied) return denied
  const db = await stationDb()
  return NextResponse.json({ payments: await listStationPayments(db, slug) })
}
