import { NextResponse } from 'next/server'
import { canSeeAllStations } from '@/lib/station/guard'
import { stationDb } from '@/lib/station/store'
import { computeStationNetwork } from '@/lib/station/overview'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  if (!(await canSeeAllStations())) {
    return NextResponse.json({ error: 'Only an admin can see every station.' }, { status: 403 })
  }
  const date = new URL(request.url).searchParams.get('date') || undefined
  const db = await stationDb()
  const network = await computeStationNetwork(db, date)
  return NextResponse.json(network)
}
