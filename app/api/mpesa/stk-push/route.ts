import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/mongodb'
import { initiateSTKPush, type MpesaConfig } from '@/lib/mpesa'
import { ensureMpesaTransactionIndexes } from '@/lib/catha-mpesa-transaction-indexes'
import { normalizePhoneNumbers } from '@/lib/phone-normalize'
import { summarizeCathaOrderPayments } from '@/lib/catha-order-payments'
import { ECOMMERCE_CHECKOUT_SESSIONS_COLLECTION } from '@/lib/ecommerce-checkout-session-constants'
import { filterInventoryStockLineItems } from '@/lib/catha-order-inventory-lines'
import { expireCheckoutSessionIfNeeded } from '@/lib/ecommerce-stock-reservation'
import { readSharedMpesaConfig } from '@/lib/shops/mpesa-config'
import { bindShopBypass, readShopStore, runWithoutShopScope } from '@/lib/shops/als'
import { CATHA_LOUNGE_SHOP_ID } from '@/lib/shops/constants'
import { ShopScopeError } from '@/lib/shops/access'
import { bindPublicShopFromRequest } from '@/lib/shops/context'
import { createPublicPaymentToken } from '@/lib/shops/payment-status'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { phoneNumber, amount, accountReference, transactionDesc } = body

    if (!phoneNumber || !amount || !accountReference) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: phoneNumber, amount, accountReference' },
        { status: 400 }
      )
    }

    const amountNum = Number(amount)
    if (!Number.isFinite(amountNum) || amountNum <= 0 || amountNum > 50_000_000) {
      return NextResponse.json({ success: false, error: 'Invalid payment amount' }, { status: 400 })
    }

    const explicitShop = String(body.shop || new URL(request.url).searchParams.get('shop') || '').trim().toLowerCase()
    if (explicitShop) {
      try {
        await bindPublicShopFromRequest(request, explicitShop)
      } catch (error) {
        if (error instanceof ShopScopeError) {
          return NextResponse.json({ success: false, error: error.message }, { status: error.status })
        }
        throw error
      }
    }

    // Get M-Pesa settings
    const db = await getDatabase('infusion_jaba')

    // Never trust client-supplied amount — use persisted order total or checkout session snapshot.
    const ref = String(accountReference)
    let orderForRef = await db.collection('orders').findOne({ id: ref })
    if (!orderForRef && !explicitShop) {
      const ecommerceOrder = await runWithoutShopScope(() =>
        db.collection('orders').findOne({ id: ref, type: 'ecommerce' })
      )
      if (ecommerceOrder) {
        bindShopBypass()
        orderForRef = ecommerceOrder
      }
    }
    let checkoutSession = orderForRef
      ? null
      : await db.collection(ECOMMERCE_CHECKOUT_SESSIONS_COLLECTION).findOne({ id: ref })

    if (checkoutSession) {
      await expireCheckoutSessionIfNeeded(db, ref)
      checkoutSession = await db.collection(ECOMMERCE_CHECKOUT_SESSIONS_COLLECTION).findOne({ id: ref })
    }

    if (orderForRef && orderForRef.type === 'ecommerce') {
      const expected = Number(orderForRef.total ?? 0)
      if (Number.isFinite(expected) && Math.abs(expected - amountNum) > 0.02) {
        console.warn('[M-Pesa STK] Amount mismatch vs order', { accountReference, clientAmount: amountNum, orderTotal: expected })
        return NextResponse.json(
          { success: false, error: 'Amount does not match order total. Refresh checkout and try again.' },
          { status: 400 }
        )
      }
    } else if (checkoutSession) {
      if (['converted', 'abandoned', 'expired'].includes(String(checkoutSession.status))) {
        console.warn('[M-Pesa STK] Checkout session not payable', { accountReference, status: checkoutSession.status })
        return NextResponse.json(
          {
            success: false,
            error:
              checkoutSession.status === 'abandoned'
                ? 'This checkout was closed. Please start checkout again.'
                : 'This checkout session is no longer valid. Refresh and try again.',
          },
          { status: 400 }
        )
      }
      const inv = filterInventoryStockLineItems(checkoutSession.snapshot?.items ?? [])
      if (inv.length > 0 && checkoutSession.reservationHoldActive !== true) {
        console.error('[M-Pesa STK] Checkout session missing stock reservation', { accountReference })
        return NextResponse.json(
          {
            success: false,
            error: 'Checkout is not ready for payment (stock not reserved). Start checkout again.',
          },
          { status: 400 }
        )
      }
      const expected = Number(checkoutSession.amountExpected ?? checkoutSession.snapshot?.total ?? 0)
      if (Number.isFinite(expected) && Math.abs(expected - amountNum) > 0.02) {
        console.warn('[M-Pesa STK] Amount mismatch vs checkout session', {
          accountReference,
          clientAmount: amountNum,
          sessionTotal: expected,
        })
        return NextResponse.json(
          { success: false, error: 'Amount does not match checkout total. Refresh checkout and try again.' },
          { status: 400 }
        )
      }
    }

    // Catha / bar orders: STK amount must not exceed remaining balance (split / group pay).
    if (orderForRef && orderForRef.type !== 'ecommerce') {
      // Save the phone the payer typed BEFORE initiating STK, so the receipt SMS
      // goes to this number (not the MSISDN M-Pesa reports back).
      const payerPhone = normalizePhoneNumbers(String(phoneNumber))[0]
      if (payerPhone) {
        await db.collection('orders').updateOne(
          { id: ref },
          { $set: { customerPhone: payerPhone, updatedAt: new Date() } }
        )
      }

      const pay = summarizeCathaOrderPayments(orderForRef as any)
      if (pay.balanceDue <= 0.02 && pay.totalLinkedPayments > 0) {
        return NextResponse.json(
          { success: false, error: 'This order is already fully paid. No further M-Pesa amount is due.' },
          { status: 400 }
        )
      }
      const remaining = Math.max(0, pay.balanceDue)
      if (remaining > 0.02 && amountNum > remaining + 0.02) {
        return NextResponse.json(
          {
            success: false,
            error: `Amount exceeds remaining balance (KSh ${remaining.toFixed(2)}). Adjust the amount or link an existing payment.`,
          },
          { status: 400 }
        )
      }
    }
    await ensureMpesaTransactionIndexes(db)
    const mpesa = (await readSharedMpesaConfig(db)) as {
      enabled?: boolean
      consumerKey: string
      consumerSecret: string
      passkey: string
      shortcode: string
      environment: 'sandbox' | 'production'
      callbackUrl: string
    } | null
    const settings = { mpesa }

    if (!settings?.mpesa?.enabled) {
      return NextResponse.json(
        { success: false, error: 'M-Pesa gateway is not enabled' },
        { status: 400 }
      )
    }

    const mpesaConfig: MpesaConfig = {
      consumerKey: settings.mpesa.consumerKey,
      consumerSecret: settings.mpesa.consumerSecret,
      passkey: settings.mpesa.passkey,
      shortcode: settings.mpesa.shortcode,
      environment: settings.mpesa.environment,
      callbackUrl: settings.mpesa.callbackUrl,
    }

    const now = Date.now()
    const duplicateWindowMs = 120_000
    const recentPending = await db.collection('mpesa_transactions').findOne({
      account_reference: accountReference,
      status: 'PENDING',
      createdAt: { $gte: new Date(now - duplicateWindowMs) },
    })

    if (recentPending?.checkout_request_id) {
      let publicStatusToken = recentPending.public_status_token ? String(recentPending.public_status_token) : ''
      if (!publicStatusToken) {
        publicStatusToken = createPublicPaymentToken()
        await db.collection('mpesa_transactions').updateOne(
          { _id: recentPending._id },
          { $set: { public_status_token: publicStatusToken, updatedAt: new Date() } }
        )
      }
      console.log('[M-Pesa STK] Duplicate prompt blocked — returning existing PENDING checkout', {
        accountReference,
        checkoutRequestID: recentPending.checkout_request_id,
      })
      return NextResponse.json({
        success: true,
        duplicate: true,
          data: {
            checkoutRequestID: recentPending.checkout_request_id,
            merchantRequestID: recentPending.merchant_request_id ?? null,
            publicStatusToken,
            customerMessage: recentPending.result_desc || 'An STK push is already in progress for this order.',
          },
      })
    }

    // Initiate STK Push
    const finalAmount =
      orderForRef && orderForRef.type === 'ecommerce'
        ? Number(orderForRef.total ?? amountNum)
        : checkoutSession
          ? Number(checkoutSession.amountExpected ?? checkoutSession.snapshot?.total ?? amountNum)
          : amountNum

    const stkResponse = await initiateSTKPush(mpesaConfig, {
      phoneNumber,
      amount: finalAmount,
      accountReference,
      transactionDesc: transactionDesc || 'Payment',
    })

    // Store transaction in database
    const boundShopId = readShopStore()?.shopId || null
    const ecommerceWithoutShop = !explicitShop && (orderForRef?.type === 'ecommerce' || Boolean(checkoutSession))
    const transactionShopId = ecommerceWithoutShop
      ? null
      : boundShopId || (orderForRef ? String(orderForRef.shopId || CATHA_LOUNGE_SHOP_ID) : null)
    const publicStatusToken = createPublicPaymentToken()
    const transaction = {
      transaction_type: 'STK',
      checkout_request_id: stkResponse.CheckoutRequestID,
      merchant_request_id: stkResponse.MerchantRequestID,
      amount: finalAmount,
      phone_number: phoneNumber,
      account_reference: accountReference,
      order_id: ref,
      public_status_token: publicStatusToken,
      ...(transactionShopId ? { shopId: transactionShopId } : { channel: 'ecommerce' }),
      status: 'PENDING',
      response_code: stkResponse.ResponseCode,
      result_desc: stkResponse.ResponseDescription,
      raw_response: stkResponse,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    try {
      await db.collection('mpesa_transactions').insertOne(transaction)
    } catch (insertErr: unknown) {
      const code = (insertErr as { code?: number })?.code
      if (code === 11000 && transaction.checkout_request_id) {
        const existing = await db.collection('mpesa_transactions').findOne({
          checkout_request_id: transaction.checkout_request_id,
        })
        if (existing?.checkout_request_id) {
          console.log('[M-Pesa STK] Unique checkout_request_id collision — returning existing txn', {
            accountReference,
            checkoutRequestID: existing.checkout_request_id,
          })
          return NextResponse.json({
            success: true,
            duplicate: true,
            data: {
              checkoutRequestID: existing.checkout_request_id,
              merchantRequestID: existing.merchant_request_id ?? null,
              publicStatusToken: existing.public_status_token ?? null,
              customerMessage: existing.result_desc || 'Existing checkout request.',
            },
          })
        }
      }
      throw insertErr
    }

    console.log('[M-Pesa STK] CREATE mpesa_transaction for order:', accountReference, transaction.checkout_request_id)

    return NextResponse.json({
      success: true,
      data: {
        checkoutRequestID: stkResponse.CheckoutRequestID,
        merchantRequestID: stkResponse.MerchantRequestID,
        publicStatusToken,
        customerMessage: stkResponse.CustomerMessage,
      },
    })
  } catch (error: any) {
    console.error('[M-Pesa STK Push] Error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to initiate STK Push' },
      { status: 500 }
    )
  }
}

