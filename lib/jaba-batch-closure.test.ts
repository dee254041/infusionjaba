import { describe, expect, it } from 'vitest'
import { computeForRoot, type LoadedContext } from '@/lib/jaba-batch-closure'
import { buildPackagedSlots, computeFifoSlotRemainings } from '@/lib/jaba-delivery-note-fifo-allocation'
import { getNeutralRemainingLitres } from '@/lib/jaba-batch-utils'
import { mergeFlavourRowsFromCaches } from '@/lib/jaba-flavour-lines'

const ROOT = 'aaaaaaaaaaaaaaaaaaaaaaa1'
const LINE_A = 'bbbbbbbbbbbbbbbbbbbbbbb1'
const LINE_B = 'bbbbbbbbbbbbbbbbbbbbbbb2'
const NOW = new Date('2026-10-18T00:00:00Z')

function ctxFor(args: {
  root: Record<string, any>
  lines?: Record<string, any>[]
  pos?: Record<string, any>[]
  notes?: Record<string, any>[]
}): LoadedContext {
  const ctx: LoadedContext = {
    roots: [args.root],
    kidsByParent: new Map(),
    linesByParent: new Map(),
    posByBatchId: new Map(),
    posByLineId: new Map(),
    notes: args.notes ?? [],
  }
  if (args.lines?.length) ctx.linesByParent.set(String(args.root._id), args.lines)
  for (const po of args.pos ?? []) {
    const b = String(po.batchId)
    ctx.posByBatchId.set(b, [...(ctx.posByBatchId.get(b) ?? []), po])
    if (po.flavourLineId) {
      const l = String(po.flavourLineId)
      ctx.posByLineId.set(l, [...(ctx.posByLineId.get(l) ?? []), po])
    }
  }
  return ctx
}

function fixture() {
  const root = {
    _id: ROOT,
    batchNumber: 'BCH-2026-00001',
    status: 'Partially Allocated',
    date: new Date('2026-06-01T00:00:00Z'),
    flavor: 'Neutral',
    totalLitres: 15.3,
    infusedAllocatedLitres: 15,
    outputSummary: { remainingLitres: 0.3 },
  }
  const lines = [
    { _id: LINE_A, parentBatchId: ROOT, flavourName: 'Mango', lineCode: 'L1', allocatedLitres: 10, createdAt: new Date(1) },
    { _id: LINE_B, parentBatchId: ROOT, flavourName: 'Pine', lineCode: 'L2', allocatedLitres: 5, createdAt: new Date(2) },
  ]
  const pos = [
    // Mango: 19 × 500ml = 9.5 L packaged (0.5 L never packaged)
    { _id: 'cccccccccccccccccccccc01', batchId: ROOT, flavourLineId: LINE_A, containers: [{ size: '500ml', quantity: 19 }], createdAt: new Date(10) },
    // Pine: 10 × 500ml = 5 L, fully packaged
    { _id: 'cccccccccccccccccccccc02', batchId: ROOT, flavourLineId: LINE_B, containers: [{ size: '500ml', quantity: 10 }], createdAt: new Date(11) },
  ]
  const notes = [
    // 17 Mango + all 10 Pine delivered → 2 Mango bottles still in stock
    {
      _id: 'dddddddddddddddddddddd01',
      items: [
        { packagingOutputId: 'cccccccccccccccccccccc01', flavourLineId: LINE_A, size: '500ml', quantity: 17, batchNumber: 'BCH-2026-00001' },
        { packagingOutputId: 'cccccccccccccccccccccc02', flavourLineId: LINE_B, size: '500ml', quantity: 10, batchNumber: 'BCH-2026-00001' },
      ],
    },
  ]
  return { root, lines, pos, notes }
}

describe('computeForRoot — what is left in an old batch', () => {
  it('itemises neutral litres, unpacked litres and undelivered bottles', () => {
    const f = fixture()
    const { summary } = computeForRoot(f.root, ctxFor(f), NOW)

    expect(summary.hasLeftover).toBe(true)
    expect(summary.neutralLitres).toBeCloseTo(0.3, 6)
    expect(summary.ageDays).toBeGreaterThan(100)

    const mango = summary.lines.find((l) => l.label === 'Mango')!
    expect(mango.unpackedLitres).toBeCloseTo(0.5, 6)
    expect(mango.bottleCount).toBe(2)
    expect(mango.bottles).toEqual([{ size: '500ml', quantity: 2, litres: 1 }])
    expect(mango.unreconciledLitres).toBe(0)

    // Pine is completely done and is not listed.
    expect(summary.lines.find((l) => l.label === 'Pine')).toBeUndefined()

    expect(summary.totalBottleCount).toBe(2)
    expect(summary.totalLossLitres).toBeCloseTo(0.3 + 0.5 + 1, 6)
    expect(summary.hasStock).toBe(true)
  })

  it('ignores floating point dust so only real leftovers are offered', () => {
    const f = fixture()
    f.root.infusedAllocatedLitres = 15.3 - 1e-9 // 1e-9 L "left"
    f.lines[0].allocatedLitres = 9.5 // fully packaged
    f.notes[0].items[0].quantity = 19 // fully delivered
    const { summary } = computeForRoot(f.root, ctxFor(f), NOW)
    expect(summary.hasLeftover).toBe(false)
    expect(summary.totalLossLitres).toBe(0)
  })

  it('handles a batch with no flavour lines (leftover is outputSummary.remainingLitres)', () => {
    const root = {
      _id: ROOT,
      batchNumber: 'BCH-2026-00002',
      status: 'Processed',
      date: new Date('2026-05-01T00:00:00Z'),
      flavor: 'Mango',
      totalLitres: 10,
      outputSummary: { remainingLitres: 0.2 },
    }
    const pos = [{ _id: 'cccccccccccccccccccccc09', batchId: ROOT, containers: [{ size: '250ml', quantity: 4 }] }]
    const { summary } = computeForRoot(root, ctxFor({ root, pos }), NOW)
    expect(summary.neutralLitres).toBeCloseTo(0.2, 6)
    expect(summary.totalBottleCount).toBe(4) // 250ml bottles are included too
    expect(summary.lines).toHaveLength(1)
    expect(summary.lines[0].kind).toBe('batch')
  })
})

describe('after clearing', () => {
  it('written-off bottles leave delivery stock but past deliveries stay valid', () => {
    const f = fixture()
    const { stockSlots } = computeForRoot(f.root, ctxFor(f), NOW)
    expect(stockSlots.map((s) => [s.slotId, s.remaining])).toEqual([['cccccccccccccccccccccc01|500ml', 2]])

    const closedRoot = {
      ...f.root,
      batchClosed: true,
      closure: { writtenOffSlots: stockSlots.map((s) => ({ slotId: s.slotId, quantity: s.remaining })) },
    }

    // Before: 2 bottles deliverable. After: none, and nothing else changes.
    const before = computeFifoSlotRemainings(buildPackagedSlots(f.pos, [f.root]), f.notes, {})
    const after = computeFifoSlotRemainings(buildPackagedSlots(f.pos, [closedRoot]), f.notes, {})
    expect(before.reduce((s, x) => s + x.remaining, 0)).toBe(2)
    expect(after.reduce((s, x) => s + x.remaining, 0)).toBe(0)

    // Editing the old delivery note (excluded from consumption) still has its 17+10 bottles available again.
    const editing = computeFifoSlotRemainings(buildPackagedSlots(f.pos, [closedRoot]), f.notes, {
      excludeNoteId: 'dddddddddddddddddddddd01',
    })
    expect(editing.reduce((s, x) => s + x.remaining, 0)).toBe(17 + 10)
  })

  it('cleared flavour lines report nothing left and a Closed status', () => {
    const f = fixture()
    const lines = f.lines.map((l) => ({ ...l, closedAsLoss: true, writtenOffUnpackedLitres: 0.5 }))
    const rows = mergeFlavourRowsFromCaches(ROOT, lines, [], f.pos, f.notes)
    for (const r of rows) {
      expect(r.remainingPackLitres).toBe(0)
      expect(r.remainingDistributeLitres).toBe(0)
      expect(r.workflowStatus).toBe('Closed')
    }
  })

  it('a closed batch has no neutral litres left to allocate', () => {
    const f = fixture()
    expect(getNeutralRemainingLitres(f.root)).toBeCloseTo(0.3, 6)
    expect(getNeutralRemainingLitres({ ...f.root, batchClosed: true })).toBe(0)
  })
})
