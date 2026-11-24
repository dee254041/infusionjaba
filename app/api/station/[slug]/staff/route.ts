import { NextResponse } from 'next/server'
import { requireStation } from '@/lib/station/guard'
import { listStaff, stationDb } from '@/lib/station/store'

export const runtime = 'nodejs'

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params
  const [, denied] = await requireStation(slug, 'ADMIN')
  if (denied) return denied
  const db = await stationDb()
  return NextResponse.json({ staff: await listStaff(db, slug) })
}
