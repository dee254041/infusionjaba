type Entry = { at: number; body: unknown }

/** One cache entry per shop so a public menu cannot reuse another shop's catalog. */
const TTL_MS = 15_000
const entries = new Map<string, Entry>()

export function readPublicCatalogCache(shopId: string): unknown | null {
  const entry = entries.get(shopId)
  if (!entry) return null
  if (Date.now() - entry.at > TTL_MS) {
    entries.delete(shopId)
    return null
  }
  return entry.body
}

export function writePublicCatalogCache(shopId: string, body: unknown) {
  entries.set(shopId, { at: Date.now(), body })
}

export function clearPublicCatalogCache() {
  entries.clear()
}
