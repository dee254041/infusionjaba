import { NextResponse } from "next/server"
import { getDatabase } from "@/lib/mongodb"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit-simple"
import { confirmMenuPayment } from "@/lib/menu-confirm-payment"
import { bindPublicShopFromRequest } from "@/lib/shops/context"
import { ShopScopeError } from "@/lib/shops/access"
import { runWithoutShopScope } from "@/lib/shops/als"
import { isPublicPaymentToken } from "@/lib/shops/payment-status"
import { normalizeMpesaStatus } from "@/lib/mpesa-status"

/**
 * Public (customer menu) — finalize paid rounds after M-Pesa success.
 * Marks menu_orders paid, upserts admin orders, sends receipt SMS once.
 */
export async function POST(request: Request) {
  try {
    const ip = getClientIp(request)
    const rl = checkRateLimit(`menu-confirm-payment:${ip}`, 20, 60_000)
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Too many requests", retryAfterMs: rl.retryAfterMs },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
      )
    }

    const body = await request.json()
    let shop
    try {
      shop = await bindPublicShopFromRequest(request, typeof body?.shop === "string" ? body.shop : null)
    } catch (error) {
      if (error instanceof ShopScopeError) {
        return NextResponse.json({ error: error.message }, { status: error.status })
      }
      throw error
    }
    const statusToken = typeof body?.statusToken === "string" ? body.statusToken.trim() : ""
    if (!isPublicPaymentToken(statusToken)) {
      return NextResponse.json({ error: "A payment confirmation token is required." }, { status: 401 })
    }
    const dbForPayment = await getDatabase("infusion_jaba")
    const payment = await runWithoutShopScope(() =>
      dbForPayment.collection("mpesa_transactions").findOne(
        { public_status_token: statusToken },
        { projection: { status: 1, shopId: 1, mpesa_receipt_number: 1 } }
      )
    )
    if (!payment || normalizeMpesaStatus(payment.status) !== "COMPLETED") {
      return NextResponse.json({ error: "Payment is not complete." }, { status: 409 })
    }
    if (String(payment.shopId || "") !== shop.shopId) {
      return NextResponse.json({ error: "Payment does not belong to this shop." }, { status: 403 })
    }
    body.mpesaReceiptNumber = payment.mpesa_receipt_number ? String(payment.mpesa_receipt_number) : null
    const orderIds = Array.isArray(body.orderIds)
      ? body.orderIds.map((id: unknown) => String(id || "").trim()).filter(Boolean)
      : body.orderId
        ? [String(body.orderId).trim()]
        : []

    const db = dbForPayment
    const result = await confirmMenuPayment(db, {
      orderIds,
      phone: body.phone ?? body.customerPhone ?? null,
      mpesaReceiptNumber: body.mpesaReceiptNumber ?? null,
      tableNumber: body.tableNumber ?? body.tableId ?? null,
      businessName: shop.name,
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error: any) {
    console.error("[menu-orders/confirm-payment]", error)
    return NextResponse.json(
      { error: "Failed to confirm payment", message: error?.message },
      { status: 500 }
    )
  }
}
