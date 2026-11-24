const RESERVED = new Set([
  'catha',
  'jaba',
  'menu',
  'table',
  'shop',
  'api',
  'server',
  'station',
  'product',
  'cart',
  'checkout',
  'account',
  'auth',
  'login',
  'admin',
  'pos',
  'orders',
  'www',
])

/** Turn a shop name into a safe id stem. Reserved words and short names are rejected. */
export function normalizeStationSlug(input: string): string | null {
  const slug = String(input || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  if (slug.length < 3 || slug.length > 32) return null
  if (!/^[a-z][a-z0-9-]*$/.test(slug)) return null
  if (RESERVED.has(slug)) return null
  return slug
}

/** Unique shop id from the name. The caller never types it. */
export function allocateStationId(name: string, taken: Set<string> = new Set()): string {
  const stem = normalizeStationSlug(name)?.slice(0, 20) || 'shop'
  for (let attempt = 0; attempt < 12; attempt++) {
    const suffix = Math.random().toString(36).slice(2, 6)
    const id = `${stem}-${suffix}`
    if (!taken.has(id) && !RESERVED.has(id) && id.length <= 32) return id
  }
  return `shop-${Date.now().toString(36)}`
}

export function stationOrderId(slug: string): string {
  const rand = Math.random().toString(36).slice(2, 8)
  return `stn_${slug}_${Date.now().toString(36)}_${rand}`
}

export function isStationOrderId(id: string): boolean {
  return id.startsWith('stn_')
}
