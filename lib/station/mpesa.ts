import { NextResponse } from 'next/server'
import type { Db } from 'mongodb'
import { initiateSTKPush, type MpesaConfig } from '@/lib/mpesa'
import { ensureMpesaTransactionIndexes } from '@/lib/catha-mpesa-transaction-indexes'
import { normalizePhoneNumbers } from '@/lib/phone-normalize'
import { isStationOrderId } from '@/lib/station/slug'
import { STATION } from '@/lib/station/store'

/**
 * Station payments use the same M-Pesa till and callback as Catha.
 * The order id is looked up only in station_orders, never in Catha orders.
 */
export async function startStationStkPush(
  db: Db,
  input: { phoneNumber: string; amount: number; accountReference: string; transactionDesc: string },
) {
  const ref = input.accountReference
  if (!isStationOrderId(ref)) {
    return NextResponse.json({ success: false, error: 'This payment is not a station order.' }, { status: 400 })
  }
  const order = await db.collection(STATION.orders).findOne({ id: ref })
  if (!order?.shopId) {
    return NextResponse.json({ success: false, error: 'Station order not found.' }, { status: 404 })
  }
  if (order.paymentStatus === 'PAID') {
    return NextResponse.json({ success: false, error: 'This order is already paid.' }, { status: 400 })
  }
  const expected = Number(order.total) || 0
  if (Math.abs(expected - input.amount) > 0.02) {
    return NextResponse.json({ success: false, error: 'Amount does not match this station order.' }, { status: 400 })
  }
  const payerPhone = normalizePhoneNumbers(String(input.phoneNumber))[0]
  if (!payerPhone) {
    return NextResponse.json({ success: false, error: 'Enter a valid M-Pesa phone number.' }, { status: 400 })
  }
  await db.collection(STATION.orders).updateOne(
    { id: ref, shopId: order.shopId },
    { $set: { customerPhone: payerPhone, updatedAt: new Date() } },
  )

  await ensureMpesaTransactionIndexes(db)
  const settings = await db.collection('catha_settings').findOne({})
  if (!settings?.mpesa?.enabled) {
    return NextResponse.json({ success: false, error: 'M-Pesa gateway is not enabled' }, { status: 400 })
  }
  const mpesaConfig: MpesaConfig = {
    consumerKey: settings.mpesa.consumerKey,
    consumerSecret: settings.mpesa.consumerSecret,
    passkey: settings.mpesa.passkey,
    shortcode: settings.mpesa.shortcode,
    environment: settings.mpesa.environment,
    callbackUrl: settings.mpesa.callbackUrl,
  }

  const recentPending = await db.collection('mpesa_transactions').findOne({
    account_reference: ref,
    shopId: order.shopId,
    status: 'PENDING',
    createdAt: { $gte: new Date(Date.now() - 120_000) },
  })
  if (recentPending?.checkout_request_id) {
    return NextResponse.json({
      success: true,
      duplicate: true,
      data: {
        checkoutRequestID: recentPending.checkout_request_id,
        merchantRequestID: recentPending.merchant_request_id ?? null,
        customerMessage: recentPending.result_desc || 'An STK push is already in progress for this order.',
      },
    })
  }

  const stkResponse = await initiateSTKPush(mpesaConfig, {
    phoneNumber: input.phoneNumber,
    amount: expected,
    accountReference: ref,
    transactionDesc: input.transactionDesc || `${order.shopId} payment`,
  })
  await db.collection('mpesa_transactions').insertOne({
    transaction_type: 'STK',
    checkout_request_id: stkResponse.CheckoutRequestID,
    merchant_request_id: stkResponse.MerchantRequestID,
    amount: expected,
    phone_number: input.phoneNumber,
    account_reference: ref,
    shopId: String(order.shopId),
    status: 'PENDING',
    response_code: stkResponse.ResponseCode,
    result_desc: stkResponse.ResponseDescription,
    raw_response: stkResponse,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  return NextResponse.json({
    success: true,
    data: {
      checkoutRequestID: stkResponse.CheckoutRequestID,
      merchantRequestID: stkResponse.MerchantRequestID,
      customerMessage: stkResponse.CustomerMessage,
    },
  })
}
