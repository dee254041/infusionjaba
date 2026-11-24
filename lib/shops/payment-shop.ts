import { CATHA_LOUNGE_SHOP_ID } from './constants'

/**
 * Callbacks attribute the payment from the stored transaction, never from the admin's selected shop.
 * Missing shopId is the historical Catha Lounge transaction.
 */
export function shopIdForPaymentCallback(
  transaction: { shopId?: unknown } | null | undefined,
  _selectedShopId?: string | null
): string {
  const raw = transaction?.shopId
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  return CATHA_LOUNGE_SHOP_ID
}

export function orderIdFromPaymentTransaction(transaction: {
  order_id?: unknown
  account_reference?: unknown
} | null | undefined): string {
  const orderId = transaction?.order_id
  if (typeof orderId === 'string' && orderId.trim()) return orderId.trim()
  const ref = transaction?.account_reference
  return typeof ref === 'string' ? ref.trim() : ''
}
