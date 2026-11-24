import { NextResponse } from 'next/server'
import { requireStation } from '@/lib/station/guard'
import { addTable, listTables, stationDb } from '@/lib/station/store'

export const runtime = 'nodejs'

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params
  const [, denied] = await requireStation(slug)
  if (denied) return denied
  const db = await stationDb()
  return NextResponse.json({ tables: await listTables(db, slug) })
}

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params
  const [, denied] = await requireStation(slug)
  if (denied) return denied
  const body = await request.json().catch(() => null)
  const db = await stationDb()
  const table = await addTable(db, slug, String(body?.name || ''))
  return NextResponse.json({ table })
}
