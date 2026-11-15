import { NextResponse } from 'next/server'
import clientPromise from '@/lib/mongodb'
import { requireJabaAction } from '@/lib/api-jaba-permissions'
import { JABA_BOTTLED_WATER_PRODUCT_KIND } from '@/lib/jaba-bottled-water'
import { JABA_WATER_BATCHES_COLLECTION, nextWaterBatchNumber } from '@/lib/jaba-water-batches'

export const runtime = 'nodejs'

function serialize(doc: Record<string, unknown>) {
  const id = String(doc._id)
  return {
    ...doc,
    _id: id,
    id,
    date: doc.date instanceof Date ? doc.date.toISOString() : doc.date,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt,
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : doc.updatedAt,
  }
}

export async function GET() {
  const authResult = await requireJabaAction('production.packaging', 'view')
  if ('response' in authResult) return authResult.response

  try {
    const client = await clientPromise
    const db = client.db('infusion_jaba')
    const batches = await db
      .collection(JABA_WATER_BATCHES_COLLECTION)
      .find({})
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray()
    return NextResponse.json({ batches: batches.map((row) => serialize(row as Record<string, unknown>)) })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Failed to load water batches', details: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const authResult = await requireJabaAction('production.packaging', 'add')
  if ('response' in authResult) return authResult.response

  try {
    const body = await request.json().catch(() => ({}))
    const client = await clientPromise
    const db = client.db('infusion_jaba')
    const now = new Date()
    const date =
      typeof body.date === 'string' && body.date.trim() ? new Date(body.date) : now
    const batchNumber = await nextWaterBatchNumber(db, date.getFullYear() || now.getFullYear())
    const doc = {
      batchNumber,
      productKind: JABA_BOTTLED_WATER_PRODUCT_KIND,
      date,
      status: 'open',
      notes: typeof body.notes === 'string' ? body.notes.trim() : '',
      bottles500ml: 0,
      bottles1L: 0,
      packagedLitres: 0,
      sessionCount: 0,
      createdAt: now,
      updatedAt: now,
    }
    const result = await db.collection(JABA_WATER_BATCHES_COLLECTION).insertOne(doc)
    return NextResponse.json(
      { success: true, batch: serialize({ ...doc, _id: result.insertedId }) },
      { status: 201 }
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Failed to create water batch', details: message }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const authResult = await requireJabaAction('production.packaging', 'edit')
  if ('response' in authResult) return authResult.response

  try {
    const body = await request.json()
    const id = String(body.id || '')
    const status = String(body.status || '')
    if (!id || (status !== 'open' && status !== 'closed')) {
      return NextResponse.json({ error: 'Water batch id and status (open or closed) are required.' }, { status: 400 })
    }
    const { ObjectId } = await import('mongodb')
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Water batch not found' }, { status: 404 })
    }
    const client = await clientPromise
    const db = client.db('infusion_jaba')
    const updated = await db.collection(JABA_WATER_BATCHES_COLLECTION).findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { status, updatedAt: new Date() } },
      { returnDocument: 'after' }
    )
    if (!updated) return NextResponse.json({ error: 'Water batch not found' }, { status: 404 })
    return NextResponse.json({ success: true, batch: serialize(updated as Record<string, unknown>) })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Failed to update water batch', details: message }, { status: 500 })
  }
}
