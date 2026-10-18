import { NextResponse } from 'next/server'
import clientPromise from '@/lib/mongodb'
import { auth } from '@/lib/auth-jaba'
import { requireJabaAction } from '@/lib/api-jaba-permissions'
import {
  BatchClosureError,
  clearBatchesAsLoss,
  getClearCandidates,
  reopenClearedBatch,
} from '@/lib/jaba-batch-closure'
import type { BatchClearResponse } from '@/lib/jaba-batch-closure-types'

export const runtime = 'nodejs'

const MAX_BATCHES_PER_REQUEST = 100

/** Preview: processed batches that still have something left in them (oldest first). */
export async function GET() {
  const authResult = await requireJabaAction('production.batches', 'view')
  if ('response' in authResult) return authResult.response

  try {
    const client = await clientPromise
    const db = client.db('infusion_jaba')
    const data = await getClearCandidates(db)
    return NextResponse.json(data)
  } catch (error: unknown) {
    console.error('[Batches clear] preview failed:', error)
    return NextResponse.json(
      {
        error: 'Failed to load batches that can be cleared',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}

/**
 * POST { batchIds, reason, note? }            → clear the batches as loss
 * POST { action: 'reopen', batchId }          → undo a clearance
 *
 * The leftover is always recomputed on the server at the moment of clearing.
 */
export async function POST(request: Request) {
  const authResult = await requireJabaAction('production.batches', 'edit')
  if ('response' in authResult) return authResult.response

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const session = await auth()
    const actor = {
      userId: authResult.userId,
      email: session?.user?.email ?? '',
    }

    const client = await clientPromise
    const db = client.db('infusion_jaba')
    const { ObjectId } = await import('mongodb')

    if (body.action === 'reopen') {
      const batchId = String(body.batchId || '')
      if (!ObjectId.isValid(batchId)) {
        return NextResponse.json({ error: 'A valid batchId is required' }, { status: 400 })
      }
      const { batchNumber } = await reopenClearedBatch(client, db, { batchId, actor })
      return NextResponse.json({ success: true, batchNumber })
    }

    const rawIds = Array.isArray(body.batchIds) ? body.batchIds : []
    const batchIds = [...new Set(rawIds.map((id) => String(id)).filter((id) => ObjectId.isValid(id)))]
    if (batchIds.length === 0) {
      return NextResponse.json({ error: 'Select at least one batch to clear' }, { status: 400 })
    }
    if (batchIds.length > MAX_BATCHES_PER_REQUEST) {
      return NextResponse.json(
        { error: `Clear at most ${MAX_BATCHES_PER_REQUEST} batches at a time` },
        { status: 400 }
      )
    }

    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
    const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 500) : null
    if (!reason) {
      return NextResponse.json({ error: 'A reason is required to clear a batch' }, { status: 400 })
    }
    if (reason === 'Other' && !note) {
      return NextResponse.json({ error: 'Add a short note when the reason is "Other"' }, { status: 400 })
    }

    const results = await clearBatchesAsLoss(client, db, { batchIds, reason, note, actor })
    const cleared = results.filter((r) => r.ok).length
    const payload: BatchClearResponse = { results, cleared, failed: results.length - cleared }
    return NextResponse.json(payload)
  } catch (error: unknown) {
    if (error instanceof BatchClosureError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[Batches clear] failed:', error)
    return NextResponse.json(
      {
        error: 'Failed to clear batches',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
