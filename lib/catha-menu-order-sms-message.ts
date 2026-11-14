export function isMenuOrderKitchenStatus(status: unknown): boolean {
  const s = String(status || "").toLowerCase()
  return s === "sent" || s === "active" || s === "paid"
}

export function shouldNotifyMenuOrder(
  previous: Record<string, unknown> | null | undefined,
  next: Record<string, unknown> | null | undefined
): boolean {
  if (!next) return false
  if (next.menuOrderStaffSmsSentAt) return false
  if (!isMenuOrderKitchenStatus(next.status)) return false
  if (previous && isMenuOrderKitchenStatus(previous.status)) return false
  return true
}

const SMS_SOFT_MAX = 680

function clipSms(text: string): string {
  const t = String(text || "").trim()
  if (t.length <= SMS_SOFT_MAX) return t
  return `${t.slice(0, SMS_SOFT_MAX - 3)}...`
}

function itemLabel(item: Record<string, unknown>): string {
  const qty = Number(item.quantity) || 0
  const name = String(item.name || item.productName || item.id || "Item").trim()
  if (qty > 1) return `${qty}x ${name}`
  return name
}

export function buildMenuOrderSmsMessage(order: Record<string, unknown>): string {
  const orderId = String(order.orderId || order.id || "").trim() || "N/A"
  const table = String(order.tableNumber || order.tableId || "").trim() || "N/A"
  const totalNum = Number(order.total || 0)
  const total = Number.isFinite(totalNum) ? totalNum.toLocaleString() : "0"
  const items = Array.isArray(order.items) ? order.items.filter((row) => row && typeof row === "object") : []
  const itemPreview = items
    .slice(0, 4)
    .map((row) => itemLabel(row as Record<string, unknown>))
    .filter(Boolean)
    .join(", ")
  const extra = items.length > 4 ? ` +${items.length - 4} more` : ""

  const lines = [
    "New menu order.",
    `Order: ${orderId}`,
    `Table: ${table}`,
    `Total: KES ${total}`,
  ]
  if (itemPreview) lines.push(`Items: ${itemPreview}${extra}`)
  return clipSms(lines.join("\n"))
}
