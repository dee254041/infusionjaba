import { NextResponse } from 'next/server'
import { requireSuperAdminApi } from '@/lib/catha-auth'
import { listStationPeople, placeStationPerson, stationDb } from '@/lib/station/store'

export const runtime = 'nodejs'

export async function GET() {
  const [, denied] = await requireSuperAdminApi()
  if (denied) return denied
  const db = await stationDb()
  return NextResponse.json({ people: await listStationPeople(db) })
}

export async function POST(request: Request) {
  const [, denied] = await requireSuperAdminApi()
  if (denied) return denied
  const body = await request.json().catch(() => null)
  const assignments = Array.isArray(body?.assignments) ? body.assignments : []
  const db = await stationDb()
  const placed = await placeStationPerson(db, {
    name: String(body?.name || ''),
    email: String(body?.email || ''),
    pin: body?.pin ? String(body.pin) : undefined,
    assignments: assignments.map((item: { shopId?: string; role?: string }) => ({
      shopId: String(item?.shopId || ''),
      role: item?.role === 'ADMIN' ? 'ADMIN' as const : 'STAFF' as const,
    })),
  })
  if (!placed.ok) return NextResponse.json({ error: placed.error }, { status: 400 })
  return NextResponse.json({ people: await listStationPeople(db) })
}
