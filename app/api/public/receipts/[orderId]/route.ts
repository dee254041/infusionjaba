import { NextResponse } from "next/server"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit-simple"
import { loadPublicReceipt } from "@/lib/public-receipt"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const ip = getClientIp(request)
  const rl = checkRateLimit(`public-receipt:${ip}`, 30, 60_000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)), "Cache-Control": "no-store" } }
    )
  }

  const { orderId } = await params
  const result = await loadPublicReceipt(orderId)
  const cache =
    result.cacheSeconds > 0
      ? `public, max-age=${result.cacheSeconds}, s-maxage=${result.cacheSeconds}`
      : "no-store"

  if (result.status === "ok") {
    const res = NextResponse.json(result.receipt)
    res.headers.set("Cache-Control", cache)
    res.headers.set("X-Robots-Tag", "noindex, nofollow")
    return res
  }

  if (result.status === "expired") {
    const res = NextResponse.json({ error: "Receipt link expired" }, { status: 410 })
    res.headers.set("Cache-Control", cache)
    res.headers.set("X-Robots-Tag", "noindex, nofollow")
    return res
  }

  if (result.status === "unavailable") {
    return NextResponse.json({ error: "Receipt unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } })
  }

  const res = NextResponse.json({ error: "Receipt not found" }, { status: 404 })
  res.headers.set("Cache-Control", cache)
  res.headers.set("X-Robots-Tag", "noindex, nofollow")
  return res
}
