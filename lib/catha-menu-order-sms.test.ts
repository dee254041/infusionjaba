import { describe, expect, it } from "vitest"
import { buildMenuOrderSmsMessage, shouldNotifyMenuOrder } from "@/lib/catha-menu-order-sms-message"

describe("menu order staff SMS", () => {
  it("notifies when a draft is sent, but not for drafts or already-sent rounds", () => {
    expect(shouldNotifyMenuOrder(null, { status: "draft" })).toBe(false)
    expect(shouldNotifyMenuOrder(null, { status: "sent" })).toBe(true)
    expect(shouldNotifyMenuOrder({ status: "draft" }, { status: "sent" })).toBe(true)
    expect(shouldNotifyMenuOrder({ status: "sent" }, { status: "paid" })).toBe(false)
    expect(shouldNotifyMenuOrder(null, { status: "sent", menuOrderStaffSmsSentAt: new Date() })).toBe(false)
  })

  it("includes table, total and a short item list", () => {
    const message = buildMenuOrderSmsMessage({
      orderId: "M-100",
      tableNumber: "12",
      total: 450,
      items: [
        { name: "Tusker", quantity: 2 },
        { name: "500ml Water", quantity: 1 },
      ],
    })
    expect(message).toContain("New menu order.")
    expect(message).toContain("Order: M-100")
    expect(message).toContain("Table: 12")
    expect(message).toContain("Total: KES 450")
    expect(message).toContain("2x Tusker")
    expect(message).toContain("500ml Water")
  })
})
