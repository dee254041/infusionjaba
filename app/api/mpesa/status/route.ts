import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/mongodb'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit-simple'
import { runWithoutShopScope } from '@/lib/shops/als'
import { isPublicPaymentToken, publicPaymentStatus } from '@/lib/shops/payment-status'

export const dynamic = 'force-dynamic'

/**
 * Public payment poll. The token is issued only to the browser that started this STK push.
 * The response is status alone: no phone, amount, receipt, shop, or order id.
 */
export async function GET(request: Request) {
  const ip = getClientIp(request)
  const limited = checkRateLimit(`mpesa-public-status:${ip}`, 60, 60_000)
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(limited.retryAfterMs / 1000)) } }
    )
  }

  const token = new URL(request.url).searchParams.get('token')?.trim() || ''
  if (!isPublicPaymentToken(token)) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
  }

  const db = await getDatabase('infusion_jaba')
  const transaction = await runWithoutShopScope(() =>
    db.collection('mpesa_transactions').findOne(
      { public_status_token: token },
      { projection: { status: 1 } }
    )
  )
  if (!transaction) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
  }

  const response = NextResponse.json(publicPaymentStatus(transaction.status))
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}
