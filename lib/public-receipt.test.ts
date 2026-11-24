import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/mongodb", () => ({ getDatabase: vi.fn() }))
vi.mock("@/lib/shops/als", () => ({ runWithoutShopScope: (fn: () => unknown) => fn() }))

import { isReceiptLinkExpired, RECEIPT_LINK_TTL_MS, receiptPaidAtMs } from "./public-receipt"

describe("public receipt links", () => {
  it("stays open for 14 days and expires after that", () => {
    const paidAt = new Date("2026-11-01T10:00:00.000Z")
    const inside = paidAt.getTime() + RECEIPT_LINK_TTL_MS - 1000
    const outside = paidAt.getTime() + RECEIPT_LINK_TTL_MS
    expect(isReceiptLinkExpired(paidAt, inside)).toBe(false)
    expect(isReceiptLinkExpired(paidAt.toISOString(), outside)).toBe(true)
  })

  it("expires a receipt that has no payment time", () => {
    expect(receiptPaidAtMs(null)).toBeNull()
    expect(isReceiptLinkExpired(undefined)).toBe(true)
    expect(isReceiptLinkExpired("not-a-date")).toBe(true)
  })
})
