import { formatDeliveryForSms } from "@/lib/order-delivery-location"
import { normalizeKenyaPhone } from "@/lib/phone-utils"

export function buildOnlineOrderSmsMessage(order: Record<string, unknown>): string {
  const orderId = String(order.orderId || order.id || "").trim() || "N/A"
  const table = String(order.tableNumber || order.tableId || "").trim() || "N/A"
  const totalNum = Number(order.total || 0)
  const total = Number.isFinite(totalNum) ? totalNum.toLocaleString() : "0"
  const name = String(order.customerName || "").trim()
  const phone = normalizeKenyaPhone(String(order.customerPhone || ""))
  const lines = [
    "New online order received.",
    `Order: ${orderId}`,
    `Table: ${table}`,
    `Total: KES ${total}`,
    `Customer: ${name || "N/A"}`,
  ]
  if (phone) lines.push(`Phone: ${phone}`)
  const delivery = formatDeliveryForSms(order)
  if (delivery) lines.push(delivery)
  return lines.join("\n")
}
