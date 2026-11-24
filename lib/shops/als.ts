import { AsyncLocalStorage } from 'node:async_hooks'

export type ShopStore = { shopId?: string; bypass?: boolean }

export const shopAls = new AsyncLocalStorage<ShopStore>()

export function readShopStore(): ShopStore | undefined {
  return shopAls.getStore()
}

export function runWithShop<T>(shopId: string, fn: () => Promise<T>): Promise<T> {
  return shopAls.run({ shopId }, fn)
}

export function runWithoutShopScope<T>(fn: () => Promise<T>): Promise<T> {
  return shopAls.run({ bypass: true }, fn)
}

/** Binds the shop for the rest of the current request continuation. */
export function bindActiveShop(shopId: string): void {
  shopAls.enterWith({ shopId })
}

export function bindShopBypass(): void {
  shopAls.enterWith({ bypass: true })
}
