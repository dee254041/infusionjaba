import { resolveKenyaCounty } from '@/lib/kenya-counties'

export type DistributorOrderLine = {
  name: string
  size: string
  quantity: number
}

export type DistributorOrderRecord = {
  noteId: string
  orderedAt: string
  items: DistributorOrderLine[]
}

export type DistributorDirectoryEntry = {
  id: string
  name: string
  phone: string
  region: string
  county: string | null
  lastOrderedAt: string | null
  history: DistributorOrderRecord[]
}

export type DistributorCountyGroup = {
  county: string
  distributors: DistributorDirectoryEntry[]
}

export const COUNTY_NOT_SET = 'County not set'

function asDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  return null
}

function lineFromItem(item: Record<string, unknown>): DistributorOrderLine | null {
  const quantity = Number(item.quantity)
  if (!Number.isFinite(quantity) || quantity <= 0) return null
  const product = String(item.productName || item.flavor || item.productType || 'Item').trim() || 'Item'
  const size = String(item.size || '').trim()
  return { name: product, size, quantity }
}

function orderFromNote(note: Record<string, unknown>): DistributorOrderRecord | null {
  const when = asDate(note.date) || asDate(note.createdAt)
  if (!when) return null
  const rawItems = Array.isArray(note.items) ? note.items : []
  const items = rawItems
    .map((item) => (item && typeof item === 'object' ? lineFromItem(item as Record<string, unknown>) : null))
    .filter((item): item is DistributorOrderLine => item !== null)
  return {
    noteId: String(note.noteId || note.id || note._id || '').trim(),
    orderedAt: when.toISOString(),
    items,
  }
}

export function formatDistributorOrderWhen(iso: string | null): string {
  if (!iso) return 'Never ordered'
  const when = new Date(iso)
  if (Number.isNaN(when.getTime())) return 'Never ordered'
  return new Intl.DateTimeFormat('en-KE', {
    timeZone: 'Africa/Nairobi',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(when)
}

export function buildDistributorOrderDirectory(
  distributors: Array<Record<string, unknown>>,
  notes: Array<Record<string, unknown>>
): DistributorDirectoryEntry[] {
  const entries: DistributorDirectoryEntry[] = []
  const byId = new Map<string, DistributorDirectoryEntry>()
  const byName = new Map<string, DistributorDirectoryEntry>()

  for (const distributor of distributors) {
    const id = String(distributor.id || distributor._id || '').trim()
    const name = String(distributor.name || '').trim()
    if (!name && !id) continue
    const region = String(distributor.region || '').trim()
    const address = String(distributor.address || '').trim()
    const entry: DistributorDirectoryEntry = {
      id: id || name,
      name: name || 'Unnamed distributor',
      phone: String(distributor.phone || '').trim(),
      region,
      county: resolveKenyaCounty(region, address),
      lastOrderedAt: null,
      history: [],
    }
    entries.push(entry)
    if (id) byId.set(id, entry)
    if (name) byName.set(name.toLowerCase(), entry)
  }

  const seen = new Map<string, Set<string>>()
  for (const note of notes) {
    const id = String(note.distributorId || '').trim()
    const name = String(note.distributorName || '').trim().toLowerCase()
    const entry = (id && byId.get(id)) || (name && byName.get(name)) || null
    if (!entry) continue
    const order = orderFromNote(note)
    if (!order) continue
    const key = order.noteId || `${order.orderedAt}:${order.items.map((item) => item.name).join('|')}`
    const bag = seen.get(entry.id) ?? new Set<string>()
    if (bag.has(key)) continue
    bag.add(key)
    seen.set(entry.id, bag)
    entry.history.push(order)
  }

  for (const entry of entries) {
    entry.history.sort((a, b) => b.orderedAt.localeCompare(a.orderedAt))
    entry.lastOrderedAt = entry.history[0]?.orderedAt ?? null
  }

  entries.sort((a, b) => a.name.localeCompare(b.name))
  return entries
}

export function groupDistributorsByCounty(entries: DistributorDirectoryEntry[]): DistributorCountyGroup[] {
  const groups = new Map<string, DistributorDirectoryEntry[]>()
  for (const entry of entries) {
    const county = entry.county || COUNTY_NOT_SET
    const list = groups.get(county) ?? []
    list.push(entry)
    groups.set(county, list)
  }

  return [...groups.entries()]
    .filter(([, list]) => list.length > 0)
    .sort(([a], [b]) => {
      if (a === COUNTY_NOT_SET) return 1
      if (b === COUNTY_NOT_SET) return -1
      return a.localeCompare(b)
    })
    .map(([county, distributors]) => ({
      county,
      distributors: [...distributors].sort((a, b) => a.name.localeCompare(b.name)),
    }))
}
