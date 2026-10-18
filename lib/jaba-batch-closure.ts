/**
 * "Clear old batches" — server logic.
 *
 * An old batch can stay "not sold out" forever because of a tiny residual (0.03 L never packaged,
 * a few bottles never delivered, a flavour line that was never finished…). Clearing a batch writes
 * that leftover off as a loss, records exactly what was written off, and marks the batch closed so
 * that every screen/API treats it as finished. A cleared batch can be reopened.
 *
 * What "closed" does:
 *  - parent batch: `batchClosed: true`, `closure: {…snapshot…}`, `outputSummary.remainingLitres = 0`
 *  - flavour lines / legacy child batches: `closedAsLoss: true` (+ written-off litres)
 *  - delivery FIFO: written-off bottles are removed from stock per packaging slot
 *    (see `buildPackagedSlots`), delivered quantities are untouched.
 *  - packaging / infusing / editing flavour lines on a closed batch is rejected by the APIs.
 *
 * Do not import this module from Client Components (it imports mongodb).
 */

import type { ClientSession, Db, MongoClient } from 'mongodb'
import { ObjectId } from 'mongodb'
import { JABA_FLAVOUR_LINES_COLLECTION, mergeFlavourRowsFromCaches } from '@/lib/jaba-flavour-lines'
import { getNeutralRemainingLitres } from '@/lib/jaba-batch-utils'
import {
  buildPackagedSlots,
  computeFifoSlotRemainings,
} from '@/lib/jaba-delivery-note-fifo-allocation'
import { rowLitresFromContainer } from '@/lib/jaba-packaging-calculations'
import {
  BATCH_LEFTOVER_EPS,
  type BatchClearCandidatesResponse,
  type BatchClearResultRow,
  type BatchLeftoverBottle,
  type BatchLeftoverLine,
  type BatchLeftoverSummary,
} from '@/lib/jaba-batch-closure-types'

export const JABA_BATCH_CLEARANCES_COLLECTION = 'jaba_batch_clearances'

/** Batches that were never produced have no real leftover to write off. */
const NOT_PROCESSED_STATUSES = new Set(['Created', 'Processing'])

export class BatchClosureError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.name = 'BatchClosureError'
    this.status = status
  }
}

type Doc = Record<string, any>

/** @internal exported for unit tests */
export type LoadedContext = {
  roots: Doc[]
  kidsByParent: Map<string, Doc[]>
  linesByParent: Map<string, Doc[]>
  posByBatchId: Map<string, Doc[]>
  posByLineId: Map<string, Doc[]>
  notes: Doc[]
}

function round6(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 1e6) / 1e6
}

function pushTo<T>(map: Map<string, T[]>, key: string, value: T) {
  const arr = map.get(key)
  if (arr) arr.push(value)
  else map.set(key, [value])
}

async function loadContext(
  db: Db,
  opts: { rootIds?: string[]; includeClosed?: boolean; session?: ClientSession }
): Promise<LoadedContext> {
  const sessionOpt = opts.session ? { session: opts.session } : {}

  const rootFilter: Doc = {
    $or: [{ parentBatchId: null }, { parentBatchId: { $exists: false } }],
  }
  if (opts.rootIds) rootFilter._id = { $in: opts.rootIds.map((id) => new ObjectId(id)) }
  if (!opts.includeClosed) rootFilter.batchClosed = { $ne: true }

  const roots = (await db.collection('jaba_batches').find(rootFilter, sessionOpt).toArray()) as Doc[]
  const ctx: LoadedContext = {
    roots,
    kidsByParent: new Map(),
    linesByParent: new Map(),
    posByBatchId: new Map(),
    posByLineId: new Map(),
    notes: [],
  }
  if (roots.length === 0) return ctx

  const rootIds = roots.map((r) => String(r._id))
  // Sequential on purpose: these run inside a transaction when a session is supplied.
  const kids = (await db
    .collection('jaba_batches')
    .find({ parentBatchId: { $in: rootIds } }, sessionOpt)
    .toArray()) as Doc[]
  const lines = (await db
    .collection(JABA_FLAVOUR_LINES_COLLECTION)
    .find({ parentBatchId: { $in: rootIds } }, sessionOpt)
    .toArray()) as Doc[]

  for (const k of kids) pushTo(ctx.kidsByParent, String(k.parentBatchId), k)
  for (const l of lines) pushTo(ctx.linesByParent, String(l.parentBatchId), l)

  const kidIds = kids.map((k) => String(k._id))
  const lineIds = lines.map((l) => String(l._id))
  const packOr: Doc[] = [{ batchId: { $in: [...rootIds, ...kidIds] } }]
  if (lineIds.length > 0) packOr.push({ flavourLineId: { $in: lineIds } })

  const pos = (await db
    .collection('jaba_packagingOutput')
    .find({ $or: packOr }, sessionOpt)
    .toArray()) as Doc[]
  for (const po of pos) {
    if (po.batchId != null) pushTo(ctx.posByBatchId, String(po.batchId), po)
    if (po.flavourLineId != null && String(po.flavourLineId)) {
      pushTo(ctx.posByLineId, String(po.flavourLineId), po)
    }
  }

  ctx.notes = (await db
    .collection('jaba_deliveryNotes')
    .find({}, { projection: { items: 1 }, ...sessionOpt })
    .toArray()) as Doc[]

  return ctx
}

type RootComputation = {
  summary: BatchLeftoverSummary
  rows: ReturnType<typeof mergeFlavourRowsFromCaches>
  lineMap: Map<string, BatchLeftoverLine>
  stockSlots: Array<{ slotId: string; size: string; remaining: number }>
}

/** @internal exported for unit tests */
export function computeForRoot(root: Doc, ctx: LoadedContext, now: Date): RootComputation {
  const rootId = String(root._id)
  const kids = ctx.kidsByParent.get(rootId) ?? []
  const lineDocs = ctx.linesByParent.get(rootId) ?? []
  const kidIds = kids.map((k) => String(k._id))
  const lineIds = new Set(lineDocs.map((l) => String(l._id)))

  const poMap = new Map<string, Doc>()
  const addPos = (list?: Doc[]) => {
    for (const po of list ?? []) poMap.set(String(po._id), po)
  }
  addPos(ctx.posByBatchId.get(rootId))
  for (const kid of kidIds) addPos(ctx.posByBatchId.get(kid))
  for (const lid of lineIds) addPos(ctx.posByLineId.get(lid))
  const pos = [...poMap.values()]
  const poIds = new Set(poMap.keys())

  const batchNumbers = new Set(
    [String(root.batchNumber || ''), ...kids.map((k) => String(k.batchNumber || ''))].filter(Boolean)
  )
  const notes = ctx.notes.filter(
    (note) =>
      Array.isArray(note.items) &&
      note.items.some((it: Doc) => {
        const pid = String(it.packagingOutputId || '')
        if (pid && poIds.has(pid)) return true
        const fid = it.flavourLineId != null ? String(it.flavourLineId) : ''
        if (fid && lineIds.has(fid)) return true
        return batchNumbers.has(String(it.batchNumber || ''))
      })
  )

  const rows = mergeFlavourRowsFromCaches(rootId, lineDocs, kids, pos, notes)
  const hasLines = rows.length > 0
  const producedLitres = Math.max(0, Number(root.totalLitres) || 0)

  // Neutral / unpacked volume that never reached a flavour line (or a packaging session).
  let neutralLitres = 0
  if (hasLines) {
    neutralLitres = getNeutralRemainingLitres(root)
  } else {
    const stored = Number(root.outputSummary?.remainingLitres)
    if (Number.isFinite(stored)) {
      neutralLitres = Math.max(0, stored)
    } else {
      let packaged = 0
      for (const po of pos) {
        if (po.flavourLineId || String(po.batchId) !== rootId) continue
        const containers = Array.isArray(po.containers) ? po.containers : []
        for (const c of containers) packaged += rowLitresFromContainer({ ...c, quantity: c?.quantity })
      }
      neutralLitres = Math.max(0, producedLitres - packaged)
    }
  }

  // Litres per bottle for each (packaging output, size) slot — handles custom sizes too.
  const unitLitres = new Map<string, number>()
  for (const po of pos) {
    const poOid = String(po._id)
    const containers = Array.isArray(po.containers) ? po.containers : []
    for (const c of containers) {
      const size = String(c?.size || '500ml').trim()
      const key = `${poOid}|${size}`
      if (!unitLitres.has(key)) unitLitres.set(key, rowLitresFromContainer({ ...c, quantity: 1 }))
    }
  }

  const slots = buildPackagedSlots(pos, [root, ...kids])
  const stockSlots = computeFifoSlotRemainings(slots, notes, {})
    .filter((s) => s.remaining > 0)
    .map((s) => ({
      slotId: s.slotId,
      size: s.size,
      remaining: s.remaining,
      flavourLineId: s.flavourLineId,
      batchId: s.batchId,
    }))

  const rowById = new Map(rows.map((r) => [r._id, r]))
  const lineMap = new Map<string, BatchLeftoverLine>()
  for (const row of rows) {
    lineMap.set(row._id, {
      key: row._id,
      kind: row.isLegacyChildBatch ? 'legacy_child' : 'flavour_line',
      label: row.flavourName || row.flavor || 'Unknown',
      lineCode: row.lineCode || undefined,
      unpackedLitres: round6(row.remainingPackLitres),
      bottles: [],
      bottleCount: 0,
      bottleLitres: 0,
      unreconciledLitres: 0,
    })
  }

  for (const s of stockSlots) {
    let key = '__batch__'
    if (s.flavourLineId && rowById.has(s.flavourLineId)) key = s.flavourLineId
    else if (s.batchId !== rootId && rowById.has(s.batchId)) key = s.batchId

    let line = lineMap.get(key)
    if (!line) {
      line = {
        key: '__batch__',
        kind: 'batch',
        label: hasLines ? 'Other packaged stock' : String(root.flavor || 'Batch'),
        unpackedLitres: 0,
        bottles: [],
        bottleCount: 0,
        bottleLitres: 0,
        unreconciledLitres: 0,
      }
      lineMap.set(key, line)
    }
    const litres = s.remaining * (unitLitres.get(s.slotId) ?? 0)
    const existing = line.bottles.find((b) => b.size === s.size)
    if (existing) {
      existing.quantity += s.remaining
      existing.litres = round6(existing.litres + litres)
    } else {
      line.bottles.push({ size: s.size, quantity: s.remaining, litres: round6(litres) })
    }
    line.bottleCount += s.remaining
    line.bottleLitres = round6(line.bottleLitres + litres)
  }

  for (const row of rows) {
    const line = lineMap.get(row._id)
    if (!line) continue
    const diff = row.remainingDistributeLitres - line.bottleLitres
    if (diff > BATCH_LEFTOVER_EPS) line.unreconciledLitres = round6(diff)
  }

  const allLines = [...lineMap.values()]
  const shownLines = allLines.filter(
    (l) =>
      l.unpackedLitres > BATCH_LEFTOVER_EPS ||
      l.bottleCount > 0 ||
      l.unreconciledLitres > BATCH_LEFTOVER_EPS
  )
  for (const l of shownLines) {
    l.bottles.sort((a, b) => a.size.localeCompare(b.size, undefined, { numeric: true }))
  }

  const neutral = neutralLitres > BATCH_LEFTOVER_EPS ? round6(neutralLitres) : 0
  const totalUnpackedLitres = round6(shownLines.reduce((s, l) => s + l.unpackedLitres, 0))
  const totalBottleCount = shownLines.reduce((s, l) => s + l.bottleCount, 0)
  const totalBottleLitres = round6(
    shownLines.reduce((s, l) => s + l.bottleLitres + l.unreconciledLitres, 0)
  )
  const totalLossLitres = round6(neutral + totalUnpackedLitres + totalBottleLitres)

  const dateRaw = root.date ?? root.createdAt
  const dateMs = dateRaw ? new Date(dateRaw).getTime() : NaN
  const summary: BatchLeftoverSummary = {
    batchId: rootId,
    batchNumber: String(root.batchNumber || ''),
    date: Number.isFinite(dateMs) ? new Date(dateMs).toISOString() : null,
    ageDays: Number.isFinite(dateMs) ? Math.max(0, Math.floor((now.getTime() - dateMs) / 86_400_000)) : 0,
    status: String(root.status || ''),
    flavourLabel: String(root.flavor || ''),
    producedLitres,
    neutralLitres: neutral,
    lines: shownLines,
    totalUnpackedLitres,
    totalBottleCount,
    totalBottleLitres,
    totalLossLitres,
    hasLeftover: neutral > 0 || shownLines.length > 0,
    hasStock: totalBottleCount > 0,
  }

  return { summary, rows, lineMap, stockSlots }
}

/** Open (not cleared, processed) batches that still have something left in them, oldest first. */
export async function getClearCandidates(db: Db): Promise<BatchClearCandidatesResponse> {
  const ctx = await loadContext(db, { includeClosed: false })
  const now = new Date()
  let excludedNotProcessed = 0
  const candidates: BatchLeftoverSummary[] = []

  for (const root of ctx.roots) {
    if (NOT_PROCESSED_STATUSES.has(String(root.status))) {
      excludedNotProcessed += 1
      continue
    }
    const { summary } = computeForRoot(root, ctx, now)
    if (summary.hasLeftover) candidates.push(summary)
  }

  candidates.sort((a, b) => {
    const ta = a.date ? new Date(a.date).getTime() : 0
    const tb = b.date ? new Date(b.date).getTime() : 0
    return ta - tb
  })
  return { candidates, excludedNotProcessed }
}

export type ClearActor = { userId: string; email: string }

async function clearOne(
  db: Db,
  session: ClientSession,
  batchId: string,
  args: { reason: string; note: string | null; actor: ClearActor }
): Promise<BatchClearResultRow> {
  const ctx = await loadContext(db, { rootIds: [batchId], includeClosed: true, session })
  const root = ctx.roots[0]
  if (!root) throw new BatchClosureError('Batch not found', 404)
  const batchNumber = String(root.batchNumber || '')
  if (root.batchClosed === true) {
    throw new BatchClosureError(`Batch ${batchNumber} is already cleared.`, 409)
  }
  if (NOT_PROCESSED_STATUSES.has(String(root.status))) {
    throw new BatchClosureError(
      `Batch ${batchNumber} is still "${root.status}". Mark it as processed before clearing it.`,
      400
    )
  }

  const now = new Date()
  const { summary, rows, lineMap, stockSlots } = computeForRoot(root, ctx, now)

  const writtenOffBottles: Record<string, number> = {}
  for (const s of stockSlots) {
    writtenOffBottles[s.size] = (writtenOffBottles[s.size] || 0) + s.remaining
  }
  const writtenOffSlots = stockSlots.map((s) => ({ slotId: s.slotId, quantity: s.remaining }))

  const prevRemaining = Number(root.outputSummary?.remainingLitres)
  const unpackedLossLitres = summary.totalUnpackedLitres
  const bottleLossLitres = summary.totalBottleLitres

  const closure = {
    closedAt: now,
    closedBy: args.actor.userId,
    closedByEmail: args.actor.email,
    resolution: 'loss' as const,
    reason: args.reason,
    note: args.note,
    neutralLossLitres: summary.neutralLitres,
    unpackedLossLitres,
    bottleLossLitres,
    totalLossLitres: summary.totalLossLitres,
    totalBottleCount: summary.totalBottleCount,
    lines: summary.lines.map((l) => ({
      key: l.key,
      label: l.label,
      lineCode: l.lineCode,
      unpackedLitres: l.unpackedLitres,
      bottles: l.bottles as BatchLeftoverBottle[],
      unreconciledLitres: l.unreconciledLitres,
    })),
    writtenOffBottles,
    writtenOffSlots,
    ...(Number.isFinite(prevRemaining) ? { prevOutputRemainingLitres: prevRemaining } : {}),
  }

  // Mark every flavour line / legacy child (even ones with nothing left) as closed.
  for (const row of rows) {
    const line = lineMap.get(row._id)
    const setDoc = {
      closedAsLoss: true,
      writtenOffUnpackedLitres: line?.unpackedLitres ?? 0,
      writtenOffPackagedLitres: round6((line?.bottleLitres ?? 0) + (line?.unreconciledLitres ?? 0)),
      closedAt: now,
      updatedAt: now,
    }
    const collection = row.isLegacyChildBatch ? 'jaba_batches' : JABA_FLAVOUR_LINES_COLLECTION
    await db
      .collection(collection)
      .updateOne({ _id: new ObjectId(row._id) }, { $set: setDoc }, { session })
  }

  await db.collection('jaba_batches').updateOne(
    { _id: root._id },
    {
      $set: {
        batchClosed: true,
        closure,
        'outputSummary.remainingLitres': 0,
        updatedAt: now,
      },
    },
    { session }
  )

  await db.collection(JABA_BATCH_CLEARANCES_COLLECTION).insertOne(
    {
      type: 'cleared',
      batchId,
      batchNumber,
      at: now,
      by: args.actor.userId,
      byEmail: args.actor.email,
      reason: args.reason,
      note: args.note,
      snapshot: closure,
    },
    { session }
  )

  return {
    batchId,
    batchNumber,
    ok: true,
    totalLossLitres: summary.totalLossLitres,
    totalBottleCount: summary.totalBottleCount,
  }
}

/** Clear each batch in its own transaction so one failure never blocks the others. */
export async function clearBatchesAsLoss(
  client: MongoClient,
  db: Db,
  args: { batchIds: string[]; reason: string; note: string | null; actor: ClearActor }
): Promise<BatchClearResultRow[]> {
  const results: BatchClearResultRow[] = []
  for (const batchId of args.batchIds) {
    const session = client.startSession()
    try {
      let row: BatchClearResultRow | null = null
      await session.withTransaction(async () => {
        row = await clearOne(db, session, batchId, args)
      })
      results.push(row ?? { batchId, ok: false, error: 'Nothing was cleared.' })
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      let batchNumber: string | undefined
      try {
        const doc = await db
          .collection('jaba_batches')
          .findOne({ _id: new ObjectId(batchId) }, { projection: { batchNumber: 1 } })
        batchNumber = doc ? String(doc.batchNumber || '') : undefined
      } catch {
        // ignore — only used to label the error
      }
      results.push({ batchId, batchNumber, ok: false, error: message })
    } finally {
      await session.endSession()
    }
  }
  return results
}

/** Undo a clearance: restore the batch exactly as it was before it was cleared. */
export async function reopenClearedBatch(
  client: MongoClient,
  db: Db,
  args: { batchId: string; actor: ClearActor }
): Promise<{ batchNumber: string }> {
  const session = client.startSession()
  try {
    let batchNumber = ''
    await session.withTransaction(async () => {
      const root = (await db
        .collection('jaba_batches')
        .findOne({ _id: new ObjectId(args.batchId) }, { session })) as Doc | null
      if (!root) throw new BatchClosureError('Batch not found', 404)
      batchNumber = String(root.batchNumber || '')
      if (root.batchClosed !== true) {
        throw new BatchClosureError(`Batch ${batchNumber} is not cleared.`, 409)
      }
      const closure = (root.closure ?? {}) as Doc
      const now = new Date()

      const unsetLine = {
        closedAsLoss: '',
        writtenOffUnpackedLitres: '',
        writtenOffPackagedLitres: '',
        closedAt: '',
      }
      await db
        .collection(JABA_FLAVOUR_LINES_COLLECTION)
        .updateMany({ parentBatchId: args.batchId }, { $unset: unsetLine, $set: { updatedAt: now } }, { session })
      await db
        .collection('jaba_batches')
        .updateMany({ parentBatchId: args.batchId }, { $unset: unsetLine, $set: { updatedAt: now } }, { session })

      let restoredRemaining = Number(closure.prevOutputRemainingLitres)
      if (!Number.isFinite(restoredRemaining)) {
        restoredRemaining = getNeutralRemainingLitres({ ...root, batchClosed: false })
      }

      await db.collection('jaba_batches').updateOne(
        { _id: root._id },
        {
          $set: { 'outputSummary.remainingLitres': Math.max(0, restoredRemaining), updatedAt: now },
          $unset: { batchClosed: '', closure: '' },
          $push: {
            closureHistory: { ...closure, reopenedAt: now, reopenedBy: args.actor.email },
          },
        } as never,
        { session }
      )

      await db.collection(JABA_BATCH_CLEARANCES_COLLECTION).insertOne(
        {
          type: 'reopened',
          batchId: args.batchId,
          batchNumber,
          at: now,
          by: args.actor.userId,
          byEmail: args.actor.email,
          snapshot: closure,
        },
        { session }
      )
    })
    return { batchNumber }
  } finally {
    await session.endSession()
  }
}
