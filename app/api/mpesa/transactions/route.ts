import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/mongodb'
import { normalizeMpesaStatus } from '@/lib/mpesa-status'
import {
  MPESA_ORDER_ALLOCATIONS,
  MONEY_EPS,
  roundMoney,
  buildAllocationTotalsForApi,
  linkedMpesaRowsFromOrderDoc,
} from '@/lib/catha-mpesa-order-allocations'
import { resolveLinkablePaymentWindow, type ShiftWindowSource } from '@/lib/catha-linkable-payment-window'

function textValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'boolean') return String(value)
  return ''
}

function moneyValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  if (value != null && typeof value === 'object') {
    const decimal = (value as { $numberDecimal?: unknown }).$numberDecimal
    if (decimal != null) return moneyValue(decimal)
    const asString = String(value)
    if (asString && asString !== '[object Object]') {
      const parsed = Number(asString)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return 0
}

function isoDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString()
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  }
  return new Date(0).toISOString()
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const db = await getDatabase('infusion_jaba')

    // Build query filters
    const query: any = {}

    const status = searchParams.get('status')
    if (status && status !== 'all') {
      query.status = status.toUpperCase()
    }

    const type = searchParams.get('type')
    if (type && type !== 'all') {
      query.transaction_type = type.toUpperCase()
    }

    const phone = searchParams.get('phone')
    if (phone) {
      query.phone_number = { $regex: phone, $options: 'i' }
    }

    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    if (startDate || endDate) {
      query.createdAt = {}
      if (startDate) {
        query.createdAt.$gte = new Date(startDate)
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate)
      }
    }

    const search = searchParams.get('search')
    if (search) {
      query.$or = [
        { checkout_request_id: { $regex: search, $options: 'i' } },
        { merchant_request_id: { $regex: search, $options: 'i' } },
        { transaction_id: { $regex: search, $options: 'i' } },
        { mpesa_receipt_number: { $regex: search, $options: 'i' } },
        { account_reference: { $regex: search, $options: 'i' } },
        { phone_number: { $regex: search, $options: 'i' } },
      ]
    }
    const exactAmount = searchParams.get('exactAmount')
    if (exactAmount != null && exactAmount !== '') {
      const parsed = Number(exactAmount)
      if (!Number.isNaN(parsed)) {
        query.amount = parsed
      }
    }

    const recentLimitRaw = searchParams.get('recentLimit')
    const recentLimit = recentLimitRaw != null && recentLimitRaw !== '' ? Math.min(parseInt(recentLimitRaw, 10) || 0, 200) : 0

    const linkableOnlyRaw = searchParams.get('linkableOnly')
    const linkableOnly =
      linkableOnlyRaw === '1' ||
      linkableOnlyRaw === 'true' ||
      linkableOnlyRaw === 'yes'

    // Only COMPLETED transactions can be linked to an order as a valid payment.
    // Apply whenever linkableOnly is requested (covers both recentLimit and exactAmount modes)
    // so cancelled and failed transactions never appear in the link picker.
    // Also apply for plain recent-limit browsing (no exactAmount) to keep the list clean.
    if (linkableOnly || (recentLimit > 0 && !searchParams.get('exactAmount'))) {
      query.status = 'COMPLETED'
    }

    // Oversample when filtering to linkable-only so we still return enough rows after dropping reserved txs
    let findLimit = recentLimit > 0 ? recentLimit : 1000
    if (linkableOnly && recentLimit > 0) {
      findLimit = Math.min(500, Math.max(recentLimit * 8, recentLimit + 60))
    }

    // Link existing is scoped to the current business day. The day ends when every
    // shift is closed, so the next morning returns nothing until a new payment arrives.
    // Receipt search stays unscoped so a known code can still be linked.
    let businessDayScoped = false
    let businessDayAfter: string | null = null
    let businessDayClosed = false
    if (linkableOnly && !search) {
      const since = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000)
      const [recentShifts, latestClosed] = await Promise.all([
        db
          .collection('staff_shifts')
          .find({
            $or: [
              { status: { $in: ['ACTIVE', 'PENDING_CLOSURE'] } },
              { startedAt: { $gte: since } },
              { endedAt: { $gte: since } },
            ],
          })
          .project({ startedAt: 1, endedAt: 1, clockOutAt: 1, status: 1, businessDate: 1 })
          .limit(500)
          .toArray(),
        db
          .collection('staff_shifts')
          .find({ endedAt: { $type: 'date' } })
          .project({ startedAt: 1, endedAt: 1, clockOutAt: 1, status: 1, businessDate: 1 })
          .sort({ endedAt: -1 })
          .limit(1)
          .toArray(),
      ])
      const seen = new Set<string>()
      const shiftSources: ShiftWindowSource[] = []
      for (const shift of [...recentShifts, ...latestClosed]) {
        const id = shift?._id?.toString() || `${shift?.startedAt}-${shift?.endedAt}`
        if (seen.has(id)) continue
        seen.add(id)
        shiftSources.push({
          startedAt: shift.startedAt,
          endedAt: shift.endedAt,
          clockOutAt: shift.clockOutAt,
          status: shift.status,
          businessDate: shift.businessDate,
        })
      }
      const paymentWindow = resolveLinkablePaymentWindow(shiftSources)
      businessDayClosed = paymentWindow.dayClosed
      if (paymentWindow.after) {
        businessDayScoped = true
        businessDayAfter = paymentWindow.after.toISOString()
        if (!query.createdAt) query.createdAt = {}
        const previousGte = query.createdAt.$gte ? new Date(query.createdAt.$gte).getTime() : null
        if (previousGte == null || previousGte <= paymentWindow.after.getTime()) {
          delete query.createdAt.$gte
          query.createdAt.$gt = paymentWindow.after
        }
        findLimit = 400
      }
    }

    // Station tills share this M-Pesa account but their rows carry shopId.
    // Catha keeps only payments that were not tagged to another shop.
    query.$and = [
      ...(Array.isArray(query.$and) ? query.$and : []),
      { $or: [{ shopId: { $exists: false } }, { shopId: null }, { shopId: '' }, { shopId: 'catha' }] },
    ]

    // Get transactions
    const transactions = await db
      .collection('mpesa_transactions')
      .find(query)
      .sort({ createdAt: -1 })
      .limit(findLimit)
      .toArray()

    // Resolve linked order status for each transaction (used by lightweight link flow in Orders)
    const accountRefs = Array.from(
      new Set(
        transactions
          .map((tx: any) => (typeof tx.account_reference === 'string' ? tx.account_reference.trim() : ''))
          .filter(Boolean)
      )
    )
    const transactionIds = transactions.map((tx: any) => tx._id?.toString()).filter(Boolean)
    const linkedOrders = await db
      .collection('orders')
      .find({
        $or: [
          { id: { $in: accountRefs } },
          { mpesaTransactionId: { $in: transactionIds } },
          { 'linkedPayments.transactionId': { $in: transactionIds } },
        ],
      })
      .project({ id: 1, mpesaTransactionId: 1, linkedPayments: 1, paymentMethod: 1, paymentStatus: 1 })
      .toArray()
    const orderByMpesaTxId = new Map<string, any>()
    const orderById = new Map<string, any>()
    for (const o of linkedOrders) {
      if (o?.id) orderById.set(String(o.id), o)
      if (o?.mpesaTransactionId) orderByMpesaTxId.set(String(o.mpesaTransactionId), o)
      const linkedPaymentRows = Array.isArray(o.linkedPayments) ? o.linkedPayments : []
      for (const p of linkedPaymentRows) {
        const tid = p?.transactionId != null ? String(p.transactionId) : ''
        if (tid) orderByMpesaTxId.set(tid, o)
      }
    }

    const allocAgg =
      transactionIds.length > 0
        ? await db
            .collection(MPESA_ORDER_ALLOCATIONS)
            .aggregate<{ _id: string; total: number; orderIds: string[] }>([
              { $match: { mpesaTransactionId: { $in: transactionIds } } },
              {
                $group: {
                  _id: '$mpesaTransactionId',
                  total: { $sum: '$allocatedAmount' },
                  orderIds: { $addToSet: '$orderId' },
                },
              },
            ])
            .toArray()
        : []
    const allocByTx = new Map<string, { total: number; orderIds: string[] }>()
    for (const row of allocAgg) {
      allocByTx.set(String(row._id), {
        total: roundMoney(Number(row.total) || 0),
        orderIds: Array.isArray(row.orderIds) ? row.orderIds.map(String) : [],
      })
    }

    const sumAllocatedFromOrderDocs = (txId: string) => {
      let s = 0
      for (const o of linkedOrders) {
        for (const row of linkedMpesaRowsFromOrderDoc(o)) {
          if (row.transactionId === txId) s += Number(row.amount) || 0
        }
      }
      return roundMoney(s)
    }

    const orderIdsFromOrderDocs = (txId: string) => {
      const ids: string[] = []
      for (const o of linkedOrders) {
        if (!o?.id) continue
        if (linkedMpesaRowsFromOrderDoc(o).some((r) => r.transactionId === txId)) ids.push(String(o.id))
      }
      return ids
    }

    // Format transactions
    const formattedTransactions = transactions.map((tx: any) => ({
      ...(function () {
        const txId = tx._id?.toString()
        const txAmt = roundMoney(Number(tx.amount) || 0)
        const fromAgg = txId ? allocByTx.get(txId)?.total ?? 0 : 0
        const fromDocs = txId ? sumAllocatedFromOrderDocs(txId) : 0
        const allocatedTotal = fromAgg > MONEY_EPS ? fromAgg : fromDocs

        const idsAgg = txId ? allocByTx.get(txId)?.orderIds ?? [] : []
        const idsDoc = txId ? orderIdsFromOrderDocs(txId) : []
        const linkedOrderIds = Array.from(new Set([...idsAgg, ...idsDoc].filter(Boolean)))

        const totals = buildAllocationTotalsForApi(txAmt, allocatedTotal, linkedOrderIds)

        const orderFromTxId = txId ? orderByMpesaTxId.get(txId) : null
        const refOrder = tx.account_reference ? orderById.get(String(tx.account_reference).trim()) : null

        const linkedOrderId =
          totals.linkedOrderIds[0] ||
          (orderFromTxId?.id != null ? String(orderFromTxId.id) : null) ||
          (tx.linked_order_id != null && String(tx.linked_order_id).trim() !== ''
            ? String(tx.linked_order_id).trim()
            : null) ||
          refOrder?.id ||
          null

        const linked = Boolean(totals.linkedOrderIds.length > 0) || Boolean(linkedOrderId)
        /** @deprecated use fullyAllocated — kept for older clients */
        const reservedByPayment = totals.remainingUnallocated <= MONEY_EPS && txAmt > MONEY_EPS
        const fullyAllocated = reservedByPayment

        return {
          linked,
          linkedOrderId,
          linkedOrderIds: totals.linkedOrderIds,
          reservedByPayment,
          fullyAllocated,
          allocatedTotal: totals.allocatedTotal,
          remainingUnallocated: totals.remainingUnallocated,
          allocationStatus: totals.allocationStatus,
          mpesaRef: textValue(tx.mpesa_receipt_number) || textValue(tx.transaction_id) || textValue(tx.checkout_request_id) || null,
        }
      })(),
      id: tx._id != null ? String(tx._id) : '',
      transactionType: textValue(tx.transaction_type),
      transactionId: textValue(tx.transaction_id) || null,
      checkoutRequestId: textValue(tx.checkout_request_id) || null,
      merchantRequestId: textValue(tx.merchant_request_id) || null,
      amount: moneyValue(tx.amount),
      phoneNumber: textValue(tx.phone_number),
      accountReference: textValue(tx.account_reference),
      status: normalizeMpesaStatus(tx.status),
      responseCode: textValue(tx.response_code) || null,
      resultDesc: textValue(tx.result_desc) || null,
      mpesaReceiptNumber: textValue(tx.mpesa_receipt_number) || null,
      createdAt: isoDate(tx.createdAt),
      updatedAt: isoDate(tx.updatedAt),
    }))

    let out = formattedTransactions
    if (linkableOnly) {
      out = out.filter((t: any) => !t.fullyAllocated)
      if (!businessDayScoped && recentLimit > 0) {
        out = out.slice(0, recentLimit)
      }
    }

    return NextResponse.json({
      success: true,
      transactions: out,
      count: out.length,
      linkableOnly: linkableOnly || undefined,
      businessDayAfter: businessDayAfter || undefined,
      businessDayClosed: businessDayScoped ? businessDayClosed : undefined,
    })
  } catch (error: any) {
    console.error('[M-Pesa Transactions] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch transactions', message: error.message },
      { status: 500 }
    )
  }
}

