import { NextResponse } from 'next/server'
import { requireStation } from '@/lib/station/guard'
import { addStaff, listStaff, stationDb } from '@/lib/station/store'

export const runtime = 'nodejs'

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params
  const [, denied] = await requireStation(slug, 'OWNER')
  if (denied) return denied
  const db = await stationDb()
  return NextResponse.json({ staff: await listStaff(db, slug) })
}

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params
  const [, denied] = await requireStation(slug, 'OWNER')
  if (denied) return denied
  const body = await request.json().catch(() => null)
  const db = await stationDb()
  const created = await addStaff(db, slug, {
    name: String(body?.name || ''),
    email: String(body?.email || ''),
    password: String(body?.password || ''),
    role: body?.role === 'OWNER' ? 'OWNER' : 'STAFF',
  })
  if (!created.ok) return NextResponse.json({ error: created.error }, { status: 400 })
  return NextResponse.json({ ok: true })
}
