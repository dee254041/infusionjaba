export const MENU_SHOP_STORAGE_KEY = 'catha_menu_shop'
export const DEFAULT_PUBLIC_SHOP = 'catha-lounge'

export function readMenuShopCode(): string {
  if (typeof window === 'undefined') return DEFAULT_PUBLIC_SHOP
  try {
    const value = sessionStorage.getItem(MENU_SHOP_STORAGE_KEY)?.trim().toLowerCase()
    return value || DEFAULT_PUBLIC_SHOP
  } catch {
    return DEFAULT_PUBLIC_SHOP
  }
}

export function rememberMenuShop(code: string | null | undefined): void {
  if (typeof window === 'undefined') return
  const next = String(code || DEFAULT_PUBLIC_SHOP).trim().toLowerCase() || DEFAULT_PUBLIC_SHOP
  try {
    sessionStorage.setItem(MENU_SHOP_STORAGE_KEY, next)
  } catch {
    /* storage may be blocked */
  }
}

export function withMenuShop(path: string): string {
  if (path.includes('shop=')) return path
  const shop = encodeURIComponent(readMenuShopCode())
  return `${path}${path.includes('?') ? '&' : '?'}shop=${shop}`
}
