type Entry = { at: number; body: unknown }

/** Shared by shoppers hitting the public product list. Cleared when stock or a product changes. */
const TTL_MS = 15_000
let entry: Entry | null = null

export function readPublicCatalogCache(): unknown | null {
  if (!entry) return null
  if (Date.now() - entry.at > TTL_MS) {
    entry = null
    return null
  }
  return entry.body
}

export function writePublicCatalogCache(body: unknown) {
  entry = { at: Date.now(), body }
}

export function clearPublicCatalogCache() {
  entry = null
}
