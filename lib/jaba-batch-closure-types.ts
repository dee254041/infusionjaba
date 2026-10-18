/**
 * Types shared between the "Clear old batches" API and UI.
 * No server-only imports here — safe for Client Components.
 */

export const BATCH_CLEAR_REASONS = [
  'Minor residual / measuring difference',
  'Spillage or wastage',
  'Quality issue',
  'Damaged or expired stock',
  'Other',
] as const

export type BatchClearReason = (typeof BATCH_CLEAR_REASONS)[number]

/** Litres/bottles below this are treated as "nothing left" (matches the batches page tolerance). */
export const BATCH_LEFTOVER_EPS = 1e-6

export type BatchLeftoverBottle = {
  size: string
  quantity: number
  litres: number
}

export type BatchLeftoverLine = {
  /** Flavour line id, legacy child batch id, or "__batch__" for stock not tied to a line. */
  key: string
  kind: 'flavour_line' | 'legacy_child' | 'batch'
  label: string
  lineCode?: string
  /** Allocated to this flavour but never packaged. */
  unpackedLitres: number
  /** Packaged but never delivered, by bottle size. */
  bottles: BatchLeftoverBottle[]
  bottleCount: number
  bottleLitres: number
  /** Packaged litres that no bottle record accounts for (old/inconsistent data). */
  unreconciledLitres: number
}

export type BatchLeftoverSummary = {
  batchId: string
  batchNumber: string
  date: string | null
  ageDays: number
  status: string
  flavourLabel: string
  producedLitres: number
  /** Produced but not yet given to any flavour line (or, for batches without lines, not yet packaged). */
  neutralLitres: number
  lines: BatchLeftoverLine[]
  totalUnpackedLitres: number
  totalBottleCount: number
  totalBottleLitres: number
  totalLossLitres: number
  hasLeftover: boolean
  hasStock: boolean
}

export type BatchClosureRecord = {
  closedAt: string
  closedBy?: string
  closedByEmail?: string
  resolution: 'loss'
  reason: string
  note?: string | null
  neutralLossLitres: number
  unpackedLossLitres: number
  bottleLossLitres: number
  totalLossLitres: number
  totalBottleCount: number
  lines: Array<{
    key: string
    label: string
    lineCode?: string
    unpackedLitres: number
    bottles: BatchLeftoverBottle[]
    unreconciledLitres: number
  }>
  writtenOffBottles: Record<string, number>
  writtenOffSlots: Array<{ slotId: string; quantity: number }>
  prevOutputRemainingLitres?: number
}

export type BatchClearCandidatesResponse = {
  candidates: BatchLeftoverSummary[]
  /** Open batches skipped because they are still Created/Processing (nothing was produced yet). */
  excludedNotProcessed: number
}

export type BatchClearResultRow = {
  batchId: string
  batchNumber?: string
  ok: boolean
  error?: string
  totalLossLitres?: number
  totalBottleCount?: number
}

export type BatchClearResponse = {
  results: BatchClearResultRow[]
  cleared: number
  failed: number
}
