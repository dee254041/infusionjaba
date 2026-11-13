/** Distributors with no delivery in this many days are flagged on AI Intelligence. */
export const DISTRIBUTOR_RESTOCK_GAP_DAYS = 30

export type DistributorRestockAlert = {
  id: string
  name: string
  region: string
  phone: string
  /** Null when they have never received a delivery. */
  daysSinceStock: number | null
  lastStockedAt: string | null
  label: string
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  return null
}

function daysBetween(later: Date, earlier: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / 86_400_000)
}

function noteWhen(note: Record<string, unknown>): Date | null {
  return asDate(note.date) || asDate(note.createdAt)
}

export function findDistributorsWithoutRecentStock(
  distributors: Array<Record<string, unknown>>,
  notes: Array<Record<string, unknown>>,
  now = new Date(),
  gapDays = DISTRIBUTOR_RESTOCK_GAP_DAYS
): DistributorRestockAlert[] {
  const latestById = new Map<string, Date>()
  const latestByName = new Map<string, Date>()

  for (const note of notes) {
    const when = noteWhen(note)
    if (!when || when.getTime() > now.getTime()) continue
    const id = String(note.distributorId || '').trim()
    const name = String(note.distributorName || '').trim().toLowerCase()
    if (id) {
      const prev = latestById.get(id)
      if (!prev || when > prev) latestById.set(id, when)
    }
    if (name) {
      const prev = latestByName.get(name)
      if (!prev || when > prev) latestByName.set(name, when)
    }
  }

  const alerts: DistributorRestockAlert[] = []
  for (const distributor of distributors) {
    const id = String(distributor.id || distributor._id || '').trim()
    const name = String(distributor.name || '').trim()
    if (!name && !id) continue
    const createdAt = asDate(distributor.createdAt)
    const last =
      (id ? latestById.get(id) : undefined) ||
      (name ? latestByName.get(name.toLowerCase()) : undefined) ||
      null

    if (!last) {
      if (createdAt && daysBetween(now, createdAt) < gapDays) continue
      alerts.push({
        id: id || name,
        name: name || 'Unnamed distributor',
        region: String(distributor.region || '').trim(),
        phone: String(distributor.phone || '').trim(),
        daysSinceStock: null,
        lastStockedAt: null,
        label: 'No delivery on record',
      })
      continue
    }

    const days = daysBetween(now, last)
    if (days < gapDays) continue
    alerts.push({
      id: id || name,
      name: name || 'Unnamed distributor',
      region: String(distributor.region || '').trim(),
      phone: String(distributor.phone || '').trim(),
      daysSinceStock: days,
      lastStockedAt: last.toISOString(),
      label: `Last stocked ${days} days ago`,
    })
  }

  alerts.sort((a, b) => {
    if (a.daysSinceStock == null && b.daysSinceStock == null) return a.name.localeCompare(b.name)
    if (a.daysSinceStock == null) return -1
    if (b.daysSinceStock == null) return 1
    return b.daysSinceStock - a.daysSinceStock
  })
  return alerts
}
