import type { Db } from 'mongodb'

export const JABA_WATER_BATCHES_COLLECTION = 'jaba_waterBatches'

export function waterBatchKey(batchNumber: unknown): string {
  return String(batchNumber || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

/** Distribution identity for one water batch. Juice flavour keys stay `fl:` / `fid:`. */
export function waterBatchFlavourSeg(batchNumber: unknown): string {
  return `wtr:${waterBatchKey(batchNumber)}`
}

export function countWaterPackSizes(containers: unknown): { bottles500ml: number; bottles1L: number } {
  let bottles500ml = 0
  let bottles1L = 0
  const rows = Array.isArray(containers) ? containers : []
  for (const raw of rows) {
    const row = raw as { size?: unknown; quantity?: unknown }
    const qty = Number(row.quantity) || 0
    if (!(qty > 0)) continue
    if (row.size === '500ml') bottles500ml += qty
    else if (row.size === '1L') bottles1L += qty
  }
  return { bottles500ml, bottles1L }
}

export async function nextWaterBatchNumber(db: Db, year = new Date().getFullYear()): Promise<string> {
  const prefix = `WTR-${year}-`
  const rows = await db
    .collection(JABA_WATER_BATCHES_COLLECTION)
    .find({ batchNumber: { $regex: `^${prefix}` } })
    .project({ batchNumber: 1 })
    .toArray()
  let max = 0
  for (const row of rows) {
    const match = String(row.batchNumber || '').match(new RegExp(`^${prefix}(\\d+)$`))
    if (!match) continue
    max = Math.max(max, parseInt(match[1], 10))
  }
  return `${prefix}${String(max + 1).padStart(5, '0')}`
}
