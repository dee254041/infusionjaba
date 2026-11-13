import type { Db } from "mongodb"
import { sendJabaSmsStrict } from "@/lib/jaba-sms"
import { getCathaNotificationSettings } from "@/lib/catha-notification-settings"
import { buildOnlineOrderSmsMessage } from "@/lib/catha-online-order-sms-message"

export { buildOnlineOrderSmsMessage } from "@/lib/catha-online-order-sms-message"

export async function maybeSendOnlineOrderSms(
  db: Db,
  order: Record<string, unknown>
): Promise<{ sent: boolean; reason?: string }> {
  try {
    const notifications = await getCathaNotificationSettings(db)
    const phones = notifications.onlineOrderSmsPhones
    if (!phones.length) return { sent: false, reason: "no_recipients" }
    const message = buildOnlineOrderSmsMessage(order)
    await sendJabaSmsStrict(message, phones)
    return { sent: true }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'sms_send_failed'
    console.error("[online-order-sms] Failed to send SMS:", error)
    return { sent: false, reason }
  }
}
