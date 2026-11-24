import { getDatabase } from "@/lib/mongodb"
import { summarizeCathaOrderPayments } from "@/lib/catha-order-payments"
import { runWithoutShopScope } from "@/lib/shops/als"

/** Customers can open the SMS receipt for two weeks. After that the link is finished. */
export const RECEIPT_LINK_TTL_MS = 14 * 24 * 60 * 60 * 1000

const FRESH_TTL_MS = 6 * 60 * 60 * 1000
const MISSING_TTL_MS = 2 * 60 * 1000
const EXPIRED_TTL_MS = 24 * 60 * 60 * 1000
const MAX_CACHE = 500

export type PublicReceiptPayload = {
  businessName: string
  tillNumber?: string
  orderId: string
  timestamp: string | Date
  paymentMethod: string | null
  paymentStatus: string
  receiptNumber: string | null
  subtotal: number
  vat: number
  total: number
  items: Array<{ name: string; quantity: number; price: number }>
}

export type PublicReceiptResult =
  | { status: "ok"; receipt: PublicReceiptPayload; cacheSeconds: number }
  | { status: "expired"; cacheSeconds: number }
  | { status: "missing"; cacheSeconds: number }
  | { status: "unavailable"; cacheSeconds: number }

type CacheEntry = { result: PublicReceiptResult; until: number }

const cache = new Map<string, CacheEntry>()
const inflight = new Map<string, Promise<PublicReceiptResult>>()
let tillCache: { value: string; until: number } | null = null

export function receiptPaidAtMs(timestamp: unknown): number | null {
  if (timestamp == null || timestamp === "") return null
  const ms = new Date(timestamp as string | number | Date).getTime()
  return Number.isFinite(ms) ? ms : null
}

export function isReceiptLinkExpired(timestamp: unknown, now = Date.now()): boolean {
  const paidAt = receiptPaidAtMs(timestamp)
  if (paidAt == null) return true
  return now >= paidAt + RECEIPT_LINK_TTL_MS
}

export function clearPublicReceiptCache() {
  cache.clear()
  inflight.clear()
  tillCache = null
}

function remember(orderId: string, result: PublicReceiptResult, ttlMs: number, now: number) {
  if (cache.size >= MAX_CACHE) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
  cache.set(orderId, { result, until: now + ttlMs })
}

function isValidOrderId(orderId: string): boolean {
  return /^[A-Za-z0-9_-]{6,64}$/.test(orderId)
}

export async function loadPublicReceipt(orderId: string, now = Date.now()): Promise<PublicReceiptResult> {
  const id = orderId.trim()
  if (!isValidOrderId(id)) return { status: "missing", cacheSeconds: 60 }

  const hit = cache.get(id)
  if (hit && hit.until > now) {
    if (hit.result.status === "ok" && isReceiptLinkExpired(hit.result.receipt.timestamp, now)) {
      const expired: PublicReceiptResult = { status: "expired", cacheSeconds: Math.floor(EXPIRED_TTL_MS / 1000) }
      remember(id, expired, EXPIRED_TTL_MS, now)
      return expired
    }
    return hit.result
  }

  const pending = inflight.get(id)
  if (pending) return pending

  const job = runWithoutShopScope(() => readReceipt(id, now)).finally(() => {
    inflight.delete(id)
  })
  inflight.set(id, job)
  return job
}

async function readReceipt(orderId: string, now: number): Promise<PublicReceiptResult> {
  try {
    const db = await getDatabase("infusion_jaba")
    const order = await db.collection("orders").findOne(
      { id: orderId },
      {
        projection: {
          _id: 0,
          id: 1,
          timestamp: 1,
          items: 1,
          subtotal: 1,
          vat: 1,
          total: 1,
          paymentMethod: 1,
          paymentStatus: 1,
          status: 1,
          mpesaReceiptNumber: 1,
          receiptCode: 1,
        },
      }
    )

    if (!order) {
      const missing: PublicReceiptResult = { status: "missing", cacheSeconds: Math.floor(MISSING_TTL_MS / 1000) }
      remember(orderId, missing, MISSING_TTL_MS, now)
      return missing
    }

    if (isReceiptLinkExpired(order.timestamp, now)) {
      const expired: PublicReceiptResult = { status: "expired", cacheSeconds: Math.floor(EXPIRED_TTL_MS / 1000) }
      remember(orderId, expired, EXPIRED_TTL_MS, now)
      return expired
    }

    const summary = summarizeCathaOrderPayments(order as never)
    const statusCompleted = String(order.status || "").toLowerCase() === "completed"
    const computedSettled = summary.paymentStatus === "PAID" || summary.paymentStatus === "OVERPAID"
    const explicitPaid = ["PAID", "OVERPAID"].includes(String(order.paymentStatus || "").toUpperCase())
    if (!(statusCompleted && (computedSettled || explicitPaid))) {
      const missing: PublicReceiptResult = { status: "missing", cacheSeconds: Math.floor(MISSING_TTL_MS / 1000) }
      remember(orderId, missing, MISSING_TTL_MS, now)
      return missing
    }

    const paidAt = receiptPaidAtMs(order.timestamp) ?? now
    const remainingMs = Math.max(0, paidAt + RECEIPT_LINK_TTL_MS - now)
    const ttlMs = Math.min(FRESH_TTL_MS, remainingMs)
    const tillNumber = await readTillNumber(db, now)
    const receipt: PublicReceiptPayload = {
      businessName: "catha lounge",
      ...(tillNumber ? { tillNumber } : {}),
      orderId: String(order.id),
      timestamp: order.timestamp as string | Date,
      paymentMethod: (order.paymentMethod as string | null) || null,
      paymentStatus: summary.paymentStatus,
      receiptNumber: (order.mpesaReceiptNumber as string | undefined) || (order.receiptCode as string | undefined) || null,
      subtotal: Number(order.subtotal || 0),
      vat: Number(order.vat || 0),
      total: Number(order.total || 0),
      items: Array.isArray(order.items)
        ? order.items.map((item: { name?: string; quantity?: number; price?: number }) => ({
            name: String(item?.name || "Item"),
            quantity: Number(item?.quantity || 0),
            price: Number(item?.price || 0),
          }))
        : [],
    }
    const result: PublicReceiptResult = { status: "ok", receipt, cacheSeconds: Math.max(60, Math.floor(ttlMs / 1000)) }
    remember(orderId, result, ttlMs, now)
    return result
  } catch {
    return { status: "unavailable", cacheSeconds: 0 }
  }
}

async function readTillNumber(db: Awaited<ReturnType<typeof getDatabase>>, now: number): Promise<string> {
  if (tillCache && tillCache.until > now) return tillCache.value
  const settingsDoc = await db.collection("catha_settings").findOne(
    {},
    { projection: { "receipt.tillNumber": 1, "mpesa.shortcode": 1 } }
  )
  const tillNumber = String(settingsDoc?.receipt?.tillNumber || settingsDoc?.mpesa?.shortcode || "").trim()
  tillCache = { value: tillNumber, until: now + FRESH_TTL_MS }
  return tillNumber
}
