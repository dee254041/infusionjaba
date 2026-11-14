/**
 * Business day for the Orders "Link existing" picker.
 * The day stays open while any shift is still open, and it ends at the latest
 * shift close. The next morning, before any new payment, the window is empty.
 */

export type ShiftWindowSource = {
  startedAt: Date | string | null | undefined
  endedAt?: Date | string | null
  clockOutAt?: Date | string | null
  status?: string | null
  businessDate?: string | null
}

export type LinkablePaymentWindow = {
  /** Payments must have createdAt strictly after this instant. Null means no lower bound. */
  after: Date | null
  /** No shift is open, so only payments after the last close belong to the new day. */
  dayClosed: boolean
}

type NormShift = {
  start: number
  end: number | null
  businessDate: string | null
}

function toMs(value: Date | string | null | undefined): number | null {
  if (value == null || value === "") return null
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : null
}

export function normalizeShiftForWindow(shift: ShiftWindowSource): NormShift | null {
  const start = toMs(shift.startedAt)
  if (start == null) return null
  const status = String(shift.status || "")
  const open = status === "ACTIVE" || status === "PENDING_CLOSURE"
  const businessDate = shift.businessDate ? String(shift.businessDate) : null
  if (open) return { start, end: null, businessDate }
  const end = toMs(shift.endedAt) ?? toMs(shift.clockOutAt)
  if (end == null) return null
  return { start, end, businessDate }
}

export function resolveLinkablePaymentWindow(shifts: ShiftWindowSource[]): LinkablePaymentWindow {
  const rows = shifts.map(normalizeShiftForWindow).filter((row): row is NormShift => row != null)
  const open = rows.filter((row) => row.end == null)

  if (open.length === 0) {
    const closes = rows.map((row) => row.end).filter((end): end is number => end != null)
    if (closes.length === 0) return { after: null, dayClosed: false }
    return { after: new Date(Math.max(...closes)), dayClosed: true }
  }

  const dates = new Set(open.map((row) => row.businessDate).filter((date): date is string => !!date))
  let coverStart = Math.min(...open.map((row) => row.start))

  if (dates.size > 0) {
    const sameDayStarts = rows
      .filter((row) => row.businessDate != null && dates.has(row.businessDate))
      .map((row) => row.start)
    coverStart = Math.min(coverStart, ...sameDayStarts)
  } else {
    const now = Date.now()
    let coverEnd = now
    let changed = true
    const used = new Set<NormShift>()
    while (changed) {
      changed = false
      for (const row of rows) {
        if (used.has(row)) continue
        const rowEnd = row.end ?? now
        if (row.start <= coverEnd && rowEnd >= coverStart) {
          used.add(row)
          if (row.start < coverStart) {
            coverStart = row.start
            changed = true
          }
          if (rowEnd > coverEnd) {
            coverEnd = rowEnd
            changed = true
          }
        }
      }
    }
  }

  const priorCloses = rows
    .filter((row) => {
      if (row.end == null || row.end > coverStart) return false
      if (row.businessDate && dates.has(row.businessDate)) return false
      return true
    })
    .map((row) => row.end as number)

  const afterMs = priorCloses.length > 0 ? Math.max(...priorCloses) : coverStart
  return { after: new Date(afterMs), dayClosed: false }
}

export type LinkablePaymentSortInput = {
  amount?: number | string | null
  allocatedTotal?: number | string | null
  linkedOrderIds?: string[] | null
  linkedOrderId?: string | null
}

export function isUnlinkedPayment(tx: LinkablePaymentSortInput): boolean {
  const allocated = Number(tx.allocatedTotal ?? 0)
  if (Number.isFinite(allocated) && allocated > 0.005) return false
  const ids = Array.isArray(tx.linkedOrderIds) ? tx.linkedOrderIds.filter((id) => String(id).trim()) : []
  if (ids.length > 0) return false
  if (tx.linkedOrderId != null && String(tx.linkedOrderId).trim()) return false
  return true
}

export function partitionLinkablePayments<T extends LinkablePaymentSortInput>(
  txs: T[],
  exactAmount: number | null
): { exactUnlinked: T[]; others: T[] } {
  const exactUnlinked: T[] = []
  const others: T[] = []
  const hasExact = exactAmount != null && Number.isFinite(exactAmount)
  for (const tx of txs) {
    const amount = Number(tx.amount)
    const matches =
      hasExact && Number.isFinite(amount) && Math.abs(amount - (exactAmount as number)) <= 0.005
    if (matches && isUnlinkedPayment(tx)) exactUnlinked.push(tx)
    else others.push(tx)
  }
  return { exactUnlinked, others }
}
