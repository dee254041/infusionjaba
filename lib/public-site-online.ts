type OnlineCache = { online: boolean; at: number }

const CACHE_MS = 1000

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
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.online
  try {
    const url = new URL('/api/server/status', requestUrl)
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return hit ? hit.online : true
    const data = (await res.json()) as { online?: boolean }
    const online = data.online !== false
    setCache(online)
    return online
  } catch {
    return hit ? hit.online : true
  }
}
