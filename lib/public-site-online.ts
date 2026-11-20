type OnlineCache = { online: boolean; at: number }

/**
 * One isolate can trust the on/off switch for this long.
 * Orders, stock, and dashboards do not use this cache.
 * It only stops every page and API call from launching another function
 * just to read a flag that almost never changes.
 */
const FRESH_MS = 30_000

function cacheBucket(): OnlineCache | undefined {
  return (globalThis as { __publicSiteOnline?: OnlineCache }).__publicSiteOnline
}

function setCache(online: boolean) {
  ;(globalThis as { __publicSiteOnline?: OnlineCache }).__publicSiteOnline = {
    online,
    at: Date.now(),
  }
}

/** Drop the short middleware cache after a toggle so the next request sees the new state. */
export function clearPublicSiteOnlineCache() {
  delete (globalThis as { __publicSiteOnline?: OnlineCache }).__publicSiteOnline
}

export async function isPublicSiteOnline(requestUrl: string): Promise<boolean> {
  const hit = cacheBucket()
  if (hit && Date.now() - hit.at < FRESH_MS) return hit.online
  try {
    const url = new URL('/api/server/status', requestUrl)
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return hit?.online === false ? false : true
    const data = (await res.json()) as { online?: boolean }
    const online = data.online !== false
    setCache(online)
    return online
  } catch {
    return hit?.online === false ? false : true
  }
}
