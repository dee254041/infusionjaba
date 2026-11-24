/** Stable id for the original single-tenant business. Existing rows without shopId belong here. */
export const CATHA_LOUNGE_SHOP_ID = 'catha-lounge'

/**
 * Jaba distributor applications are not owned by a lounge shop.
 * They use this id so a missing shopId is never treated as Catha Lounge.
 */
export const GLOBAL_RECORD_SHOP_ID = 'global'
export const GLOBAL_RECORD_SCOPE = 'global'

export const CATHA_SHOPS_COLLECTION = 'catha_shops'

export const ACTIVE_SHOP_COOKIE = 'catha_active_shop'

export const MENU_SHOP_STORAGE_KEY = 'catha_menu_shop'

export const STANDARD_SHOP_MODULES = [
  'dashboard',
  'my-shift',
  'pos',
  'orders',
  'tables',
  'qr-tables',
  'inventory',
  'suppliers',
  'stock-movement',
  'mpesa-transactions',
  'manual-mpesa-review',
  'finance',
  'expenses',
  'clients',
  'users',
  'distributor-requests',
  'reports',
  'workforce-hub',
  'settings',
  'ai-intelligence',
  'audit-logs',
] as const

/**
 * Collections whose documents are owned by one shop.
 * Global auth, Jaba manufacturing, and the shared M-Pesa credential document stay out of this set.
 */
export const SHOP_OWNED_COLLECTIONS = new Set<string>([
  'bar_inventory',
  'bar_categories',
  'bar_volumes',
  'bar_stock_movements',
  'bar_suppliers',
  'bar_supplier_deliveries',
  'bar_expenses',
  'bar_tables',
  'orders',
  'menu_orders',
  'mpesa_transactions',
  'mpesa_order_allocations',
  'distributor_requests',
  'audit_logs',
  'audit_alert_state',
  'staff_shifts',
  'shift_breaks',
  'shift_events',
  'shift_settings',
  'shift_sms_queue',
  'shift_sms_dead_letter',
  'shift_notifications_log',
  'shift_user_sms_log',
  'critical_alerts',
  'catha_settings',
  'catha_staff_users',
  'catha_clients',
  'catha_manual_mpesa_verifications',
  'catha_manual_mpesa_approval_tokens',
  'pos_product_discounts',
  'pos_category_discounts',
  'pos_discount_audit_log',
  'pos_discount_campaigns',
  'pos_campaign_overrides',
  'pos_promotion_settings',
  'pos_promo_codes',
  'pos_promo_redemptions',
  'pos_spend_promotions',
  'pos_bundle_promotions',
  'barcode_scans',
  'waiter_calls',
  'cash_payment_requests',
])

/** Configuration copied so a new shop can use the same modules. Business records are not in this list. */
export const SHOP_TEMPLATE_COLLECTIONS = ['bar_categories', 'bar_volumes'] as const

export const SHOP_BUSINESS_COLLECTIONS_NOT_COPIED = [
  'bar_inventory',
  'bar_stock_movements',
  'bar_suppliers',
  'bar_supplier_deliveries',
  'bar_expenses',
  'bar_tables',
  'orders',
  'menu_orders',
  'mpesa_transactions',
  'mpesa_order_allocations',
  'distributor_requests',
  'audit_logs',
  'staff_shifts',
  'shift_breaks',
  'shift_events',
  'catha_clients',
  'catha_staff_users',
  'catha_manual_mpesa_verifications',
  'waiter_calls',
  'cash_payment_requests',
  'pos_product_discounts',
  'pos_category_discounts',
  'pos_discount_campaigns',
  'pos_promo_codes',
  'pos_promo_redemptions',
  'pos_spend_promotions',
  'pos_bundle_promotions',
] as const

export function isShopOwnedCollection(name: string): boolean {
  return SHOP_OWNED_COLLECTIONS.has(name)
}

/** Per-shop singleton _id. Catha Lounge keeps the historical id so existing documents still match. */
export function singletonDocId(baseId: string, shopId: string): string {
  if (!shopId || shopId === CATHA_LOUNGE_SHOP_ID) return baseId
  return `${baseId}__${shopId}`
}

export function menuPathForShop(slug: string): string {
  return `/menu?shop=${encodeURIComponent(slug)}`
}
