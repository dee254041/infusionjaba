export type ShopScopeDecision =
  | { mode: 'bypass' }
  | { mode: 'shop'; shopId: string }
  | { mode: 'deny' }

export type ShopStatus = 'active' | 'inactive'

export type ShopRecord = {
  shopId: string
  name: string
  slug: string
  code: string
  location: string
  phone: string
  email: string
  logoUrl: string
  status: ShopStatus
  modules: string[]
  menuPath: string
  createdAt?: Date
  updatedAt?: Date
  createdBy?: string | null
}

export type ShopAccessUser = {
  role?: string | null
  status?: string | null
  shopIds?: string[] | null
  shopMemberships?: { shopId: string; role: string }[] | null
}
