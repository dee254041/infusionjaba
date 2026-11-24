import { NextResponse } from 'next/server'
import { requireStation } from '@/lib/station/guard'
import { addClient, addExpense, addSupplier, listClients, listExpenses, listSuppliers, stationDb } from '@/lib/station/store'

export const runtime = 'nodejs'

const kinds = {
  expenses: { list: listExpenses, add: addExpense },
  clients: { list: listClients, add: addClient },
  suppliers: { list: listSuppliers, add: addSupplier },
} as const

function kindOf(request: Request) {
  const kind = new URL(request.url).searchParams.get('kind')
  if (kind === 'expenses' || kind === 'clients' || kind === 'suppliers') return kind
  return null
}

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params
  const [, denied] = await requireStation(slug, 'ADMIN')
  if (denied) return denied
  const kind = kindOf(request)
  if (!kind) return NextResponse.json({ error: 'Unknown record type.' }, { status: 400 })
  const db = await stationDb()
  return NextResponse.json({ records: await kinds[kind].list(db, slug) })
}

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params
  const [, denied] = await requireStation(slug, 'ADMIN')
  if (denied) return denied
  const kind = kindOf(request)
  if (!kind) return NextResponse.json({ error: 'Unknown record type.' }, { status: 400 })
  const body = await request.json().catch(() => null)
  const db = await stationDb()
  const saved = await kinds[kind].add(db, slug, {
    title: String(body?.title || ''),
    detail: String(body?.detail || ''),
    amount: Number(body?.amount),
  })
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 400 })
  return NextResponse.json({ records: await kinds[kind].list(db, slug) })
}
