import { setShopScopeResolver } from './scoped-collection'
import { resolveShopScope } from './context'

export function installShopScope(): void {
  setShopScopeResolver(() => resolveShopScope())
}
