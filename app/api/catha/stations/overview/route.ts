import { NextResponse } from 'next/server'
import { requireSuperAdminApi } from '@/lib/catha-auth'
import { stationDb } from '@/lib/station/store'
import { computeStationNetwork } from '@/lib/station/overview'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const [, denied] = await requireSuperAdminApi()
  if (denied) return denied
  const date = new URL(request.url).searchParams.get('date') || undefined
  const db = await stationDb()
  const network = await computeStationNetwork(db, date)
  return NextResponse.json(network)
}
