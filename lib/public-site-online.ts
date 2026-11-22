type OnlineCache = { online: boolean; at: number; ttl: number }

/**
 * A confirmed on/off reading can be trusted for this long.
 * A failed reading is kept only briefly, and it never turns the site off.
 */
const FRESH_MS = 30_000
const UNCERTAIN_MS = 5_000

/**
 * The public site stays on unless the control document was explicitly set off.
 * A timeout, a database error, or a missing flag is not an off switch.
 */
export function resolvePublicSiteOnline(read: boolean | undefined): { online: boolean; confirmed: boolean } {
  if (read === false) return { online: false, confirmed: true }
  return { online: true, confirmed: read === true }
}

function cacheBucket(): OnlineCache | undefined {
  return (globalThis as { __publicSiteOnline?: OnlineCache }).__publicSiteOnline
}

function setCache(online: boolean, ttl = FRESH_MS) {
  ;(globalThis as { __publicSiteOnline?: OnlineCache }).__publicSiteOnline = {
    online,
    at: Date.now(),
    ttl,
  }
}

/** Drop the short middleware cache after a toggle so the next request sees the new state. */
export function clearPublicSiteOnlineCache() {
  delete (globalThis as { __publicSiteOnline?: OnlineCache }).__publicSiteOnline
}

export async function isPublicSiteOnline(requestUrl: string): Promise<boolean> {
  const hit = cacheBucket()
  if (hit && Date.now() - hit.at < hit.ttl) return hit.online
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 4_000)
  try {
    const url = new URL('/api/server/status', requestUrl)
    const res = await fetch(url, { cache: 'no-store', signal: controller.signal })
    if (!res.ok) return keepLastKnown(hit)
    const data = (await res.json()) as { online?: boolean; confirmed?: boolean }
    if (data.confirmed === true && data.online === false) {
      setCache(false)
      return false
    }
    if (data.confirmed === true && data.online === true) {
      setCache(true)
      return true
    }
    return keepLastKnown(hit)
  } catch {
    return keepLastKnown(hit)
  } finally {
    clearTimeout(timer)
  }
}

function keepLastKnown(hit: OnlineCache | undefined): boolean {
  if (hit?.online === false) {
    setCache(false, UNCERTAIN_MS)
    return false
  }
  setCache(true, UNCERTAIN_MS)
  return true
}
