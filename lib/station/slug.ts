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

/** Public station address. Lowercase, starts with a letter, no spaces. */
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

export function stationOrderId(slug: string): string {
  const rand = Math.random().toString(36).slice(2, 8)
  return `stn_${slug}_${Date.now().toString(36)}_${rand}`
}

export function isStationOrderId(id: string): boolean {
  return id.startsWith('stn_')
}
