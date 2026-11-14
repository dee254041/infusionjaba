import { describe, expect, it } from "vitest"
import {
  partitionLinkablePayments,
  resolveLinkablePaymentWindow,
} from "@/lib/catha-linkable-payment-window"

const yesterdayClose = new Date("2026-11-12T20:00:00.000Z")
const todayStart = new Date("2026-11-13T05:00:00.000Z")
const middayClose = new Date("2026-11-13T13:00:00.000Z")

describe("resolveLinkablePaymentWindow", () => {
  it("has no lower bound when the lounge has never run a shift", () => {
    expect(resolveLinkablePaymentWindow([])).toEqual({ after: null, dayClosed: false })
  })

  it("treats the morning after every shift closed as a new empty day", () => {
    const window = resolveLinkablePaymentWindow([
      {
        startedAt: new Date("2026-11-12T05:00:00.000Z"),
        endedAt: yesterdayClose,
        status: "COMPLETED",
        businessDate: "2026-11-12",
      },
      {
        startedAt: todayStart,
        endedAt: middayClose,
        status: "AUTO_CLOSED",
        businessDate: "2026-11-13",
      },
    ])
    expect(window.dayClosed).toBe(true)
    expect(window.after?.toISOString()).toBe(middayClose.toISOString())
  })

  it("keeps the whole business date while any shift is still open", () => {
    const window = resolveLinkablePaymentWindow([
      {
        startedAt: new Date("2026-11-12T05:00:00.000Z"),
        endedAt: yesterdayClose,
        status: "COMPLETED",
        businessDate: "2026-11-12",
      },
      {
        startedAt: todayStart,
        endedAt: middayClose,
        status: "COMPLETED",
        businessDate: "2026-11-13",
      },
      {
        startedAt: new Date("2026-11-13T06:00:00.000Z"),
        endedAt: null,
        status: "ACTIVE",
        businessDate: "2026-11-13",
      },
    ])
    expect(window.dayClosed).toBe(false)
    expect(window.after?.toISOString()).toBe(yesterdayClose.toISOString())
  })

  it("keeps yesterday open when a shift was never closed", () => {
    const earlierClose = new Date("2026-11-11T20:00:00.000Z")
    const window = resolveLinkablePaymentWindow([
      {
        startedAt: new Date("2026-11-11T05:00:00.000Z"),
        endedAt: earlierClose,
        status: "COMPLETED",
        businessDate: "2026-11-11",
      },
      {
        startedAt: new Date("2026-11-12T05:00:00.000Z"),
        status: "PENDING_CLOSURE",
        businessDate: "2026-11-12",
      },
    ])
    expect(window.dayClosed).toBe(false)
    expect(window.after?.toISOString()).toBe(earlierClose.toISOString())
  })

  it("starts at the first clock-in when nothing was closed before it", () => {
    const window = resolveLinkablePaymentWindow([
      {
        startedAt: todayStart,
        status: "ACTIVE",
        businessDate: "2026-11-13",
      },
    ])
    expect(window.dayClosed).toBe(false)
    expect(window.after?.toISOString()).toBe(todayStart.toISOString())
  })
})

describe("partitionLinkablePayments", () => {
  it("puts unused exact-amount payments ahead of the rest of the day", () => {
    const rows = [
      { id: "newer-other", amount: 2000, allocatedTotal: 0, linkedOrderIds: [] },
      { id: "exact-open", amount: 150, allocatedTotal: 0, linkedOrderIds: [] },
      { id: "exact-used", amount: 150, allocatedTotal: 150, linkedOrderIds: ["P1"] },
      { id: "exact-partial", amount: 150, allocatedTotal: 50, linkedOrderIds: ["P2"] },
      { id: "older-other", amount: 500, allocatedTotal: 0, linkedOrderIds: [], linkedOrderId: "" },
    ]
    const { exactUnlinked, others } = partitionLinkablePayments(rows, 150)
    expect(exactUnlinked.map((row) => row.id)).toEqual(["exact-open"])
    expect(others.map((row) => row.id)).toEqual(["newer-other", "exact-used", "exact-partial", "older-other"])
  })

  it("leaves order unchanged when no exact amount is supplied", () => {
    const rows = [
      { id: "a", amount: 150, allocatedTotal: 0, linkedOrderIds: [] },
      { id: "b", amount: 80, allocatedTotal: 0, linkedOrderIds: [] },
    ]
    const { exactUnlinked, others } = partitionLinkablePayments(rows, null)
    expect(exactUnlinked).toEqual([])
    expect(others.map((row) => row.id)).toEqual(["a", "b"])
  })
})
