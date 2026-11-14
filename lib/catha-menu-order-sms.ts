import type { Db } from "mongodb"
import { sendJabaSmsStrict } from "@/lib/jaba-sms"
import { getCathaNotificationSettings } from "@/lib/catha-notification-settings"
import {
  buildMenuOrderSmsMessage,
  shouldNotifyMenuOrder,
} from "@/lib/catha-menu-order-sms-message"

export { buildMenuOrderSmsMessage, shouldNotifyMenuOrder } from "@/lib/catha-menu-order-sms-message"

export async function maybeSendMenuOrderStaffSms(
  db: Db,
  order: Record<string, unknown> | null | undefined,
  previous?: Record<string, unknown> | null
): Promise<{ sent: boolean; reason?: string }> {
  try {
    if (!order || !shouldNotifyMenuOrder(previous, order)) {
      return { sent: false, reason: "not_eligible" }
    }
    const notifications = await getCathaNotificationSettings(db)
    const phones =
      notifications.menuOrderSmsPhones.length > 0
        ? notifications.menuOrderSmsPhones
        : notifications.onlineOrderSmsPhones
    if (!phones.length) return { sent: false, reason: "no_recipients" }

    const message = buildMenuOrderSmsMessage(order)
    await sendJabaSmsStrict(message, phones)

    const orderId = String(order.orderId || "").trim()
    if (orderId) {
      await db.collection("menu_orders").updateOne(
        { orderId },
        { $set: { menuOrderStaffSmsSentAt: new Date() } }
      )
    }
    return { sent: true }
  } catch (error) {
    const reason = error instanceof Error ? error.message : "sms_send_failed"
    console.error("[menu-order-sms] Failed to send SMS:", error)
    return { sent: false, reason }
  }
}
