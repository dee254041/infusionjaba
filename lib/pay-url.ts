const DEFAULT_SITE = "https://www.infusionjaba.co.ke"

/**
 * The shop is served on www. The bare domain is a different host and returns 404,
 * so receipt and pay links must use www.
 */
export function publicSiteOrigin(baseUrl?: string): string {
  const raw = (baseUrl || process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || DEFAULT_SITE)
    .trim()
    .replace(/\/$/, "")
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`)
    if (url.hostname === "infusionjaba.co.ke") url.hostname = "www.infusionjaba.co.ke"
    return url.origin
  } catch {
    return DEFAULT_SITE
  }
}

/** Public scan-to-pay URL for an order (QR target). */
export function getOrderPayUrl(orderId: string, baseUrl?: string): string {
  const id = String(orderId || "").trim()
  return `${publicSiteOrigin(baseUrl)}/pay/${encodeURIComponent(id)}`
}

export function getOrderReceiptUrl(orderId: string, baseUrl?: string): string {
  const id = String(orderId || "").trim()
  return `${publicSiteOrigin(baseUrl)}/r/${encodeURIComponent(id)}`
}
