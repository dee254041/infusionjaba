import { CATHA_LOUNGE_SHOP_ID, CATHA_SHOPS_COLLECTION, ACTIVE_SHOP_COOKIE, STANDARD_SHOP_MODULES, menuPathForShop } from './constants'
import { mayAccessShop, pickActiveShopId, ShopScopeError } from './access'
import { openActiveShopCookie, shopCookieSecret } from './cookie'
import { bindActiveShop, readShopStore } from './als'
import type { ShopRecord, ShopScopeDecision } from './types'

const DB_NAME = 'infusion_jaba'

function publicShopRead(path: string, method: string, shopQuery: string, publicCatalog: boolean): boolean {
  if (!shopQuery || method !== 'GET') return false
  if (publicCatalog && path.startsWith('/api/catha/inventory')) return true
  if (path.startsWith('/api/catha/settings') && path === '/api/catha/settings') return true
  if (path.startsWith('/api/catha/shops/public')) return true
  return false
}

function isCallbackPath(path: string): boolean {
  return path === '/api/mpesa/callback' || path.startsWith('/api/mpesa/callback/')
}

function isShopScopedPath(path: string): boolean {
  if (!path || isCallbackPath(path)) return false
  if (path === '/catha' || path.startsWith('/catha/')) return true
  if (path.startsWith('/api/catha')) return true
  if (path === '/menu' || path.startsWith('/menu/')) return true
  if (path.startsWith('/api/menu-orders')) return true
  if (path.startsWith('/api/waiter-calls')) return true
  if (path.startsWith('/api/catha/waiter-calls')) return true
  if (path.startsWith('/api/mpesa/stk-push')) return true
  if (path.startsWith('/api/mpesa/transactions')) return true
  return false
}

async function database() {
  const { getDatabase } = await import('@/lib/mongodb')
  return getDatabase(DB_NAME)
}

export async function ensureDefaultShopDocument(): Promise<void> {
  const db = await database()
  const now = new Date()
  await db.collection(CATHA_SHOPS_COLLECTION).updateOne(
    { _id: CATHA_LOUNGE_SHOP_ID as any },
    {
      $setOnInsert: {
        _id: CATHA_LOUNGE_SHOP_ID,
        shopId: CATHA_LOUNGE_SHOP_ID,
        name: 'Catha Lounge',
        slug: CATHA_LOUNGE_SHOP_ID,
        code: CATHA_LOUNGE_SHOP_ID,
        location: '',
        phone: '',
        email: '',
        logoUrl: '',
        status: 'active',
        modules: [...STANDARD_SHOP_MODULES],
        menuPath: menuPathForShop(CATHA_LOUNGE_SHOP_ID),
        createdAt: now,
        updatedAt: now,
        createdBy: 'system',
      },
    },
    { upsert: true }
  )
}

function toShop(doc: any): ShopRecord {
  return {
    shopId: String(doc.shopId || doc.slug || doc._id),
    name: String(doc.name || 'Shop'),
    slug: String(doc.slug || doc.shopId || doc._id),
    code: String(doc.code || doc.slug || doc.shopId),
    location: String(doc.location || ''),
    phone: String(doc.phone || ''),
    email: String(doc.email || ''),
    logoUrl: String(doc.logoUrl || ''),
    status: doc.status === 'inactive' ? 'inactive' : 'active',
    modules: Array.isArray(doc.modules) ? doc.modules.map(String) : [...STANDARD_SHOP_MODULES],
    menuPath: String(doc.menuPath || menuPathForShop(String(doc.slug || doc.shopId || ''))),
    createdAt: doc.createdAt instanceof Date ? doc.createdAt : undefined,
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt : undefined,
    createdBy: doc.createdBy ? String(doc.createdBy) : null,
  }
}

export async function listShopRecords(): Promise<ShopRecord[]> {
  await ensureDefaultShopDocument()
  const db = await database()
  const docs = await db.collection(CATHA_SHOPS_COLLECTION).find({}).sort({ createdAt: 1 }).toArray()
  return docs.map(toShop)
}

export async function findShopBySlug(slug: string): Promise<ShopRecord | null> {
  const code = String(slug || '').trim().toLowerCase()
  if (!code) return null
  await ensureDefaultShopDocument()
  const db = await database()
  const doc = await db.collection(CATHA_SHOPS_COLLECTION).findOne({
    $or: [{ slug: code }, { shopId: code }, { code }],
  })
  return doc ? toShop(doc) : null
}

export async function findActiveShopBySlug(slug: string): Promise<ShopRecord | null> {
  const shop = await findShopBySlug(slug || CATHA_LOUNGE_SHOP_ID)
  if (!shop || shop.status !== 'active') return null
  return shop
}

async function sessionUser() {
  const { auth } = await import('@/lib/auth-catha')
  const { getCathaUserByEmail } = await import('@/lib/models/catha-user')
  const session = await auth()
  const email = session?.user?.email
  if (!email) return null
  const user = await getCathaUserByEmail(email)
  if (!user) return null
  return user
}

const scopeMemo = new Map<string, { at: number; value: ShopScopeDecision }>()

export async function resolveShopScope(): Promise<ShopScopeDecision> {
  const store = readShopStore()
  if (store?.bypass) return { mode: 'bypass' }
  if (store?.shopId) return { mode: 'shop', shopId: store.shopId }
  try {
    return await resolveFromRequest()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/cookies\(|headers\(|outside a request|requestAsyncStorage|called outside/i.test(message)) {
      return { mode: 'bypass' }
    }
    throw error
  }
}

async function resolveFromRequest(): Promise<ShopScopeDecision> {
  const { headers, cookies } = await import('next/headers')
  const h = await headers()
  const path = h.get('x-request-path') || h.get('x-catha-pathname') || ''
  const method = (h.get('x-request-method') || 'GET').toUpperCase()
  const shopQuery = (h.get('x-shop-query') || '').trim().toLowerCase()
  const publicCatalog = h.get('x-public-catalog') === '1'
  const jar = await cookies()
  const memoKey = `${path}|${method}|${shopQuery}|${publicCatalog ? 1 : 0}|${jar.get(ACTIVE_SHOP_COOKIE)?.value || ''}|${jar.get('catha.session-token')?.value || ''}|${jar.get('__Secure-catha.session-token')?.value || ''}`
  const hit = scopeMemo.get(memoKey)
  if (hit && Date.now() - hit.at < 1000) return hit.value
  const value = await computeShopScope({ path, method, shopQuery, publicCatalog })
  scopeMemo.set(memoKey, { at: Date.now(), value })
  if (scopeMemo.size > 200) {
    const oldest = scopeMemo.keys().next().value
    if (oldest) scopeMemo.delete(oldest)
  }
  return value
}

async function computeShopScope(input: {
  path: string
  method: string
  shopQuery: string
  publicCatalog: boolean
}): Promise<ShopScopeDecision> {
  const { path, method, shopQuery, publicCatalog } = input
  const { cookies } = await import('next/headers')
  const user = await sessionUser()

  if (!path) {
    if (!user) return { mode: 'bypass' }
    return shopFromUser(user)
  }
  if (!isShopScopedPath(path)) return { mode: 'bypass' }

  // A public menu or payment names its shop. That choice wins over a staff session
  // so a Shop B QR cannot write into the shop an admin currently has open.
  if (
    shopQuery &&
    (path.startsWith('/api/menu-orders') ||
      path.startsWith('/api/waiter-calls') ||
      path.startsWith('/api/mpesa/stk-push') ||
      publicShopRead(path, method, shopQuery, publicCatalog))
  ) {
    const shop = await findActiveShopBySlug(shopQuery)
    return shop ? { mode: 'shop', shopId: shop.shopId } : { mode: 'deny' }
  }

  if (user) {
    if (publicShopRead(path, method, shopQuery, publicCatalog)) {
      const shop = await findActiveShopBySlug(shopQuery)
      return shop ? { mode: 'shop', shopId: shop.shopId } : { mode: 'deny' }
    }
    return shopFromUser(user)
  }

  if (path.startsWith('/api/mpesa/transactions')) return { mode: 'deny' }
  if (
    path.startsWith('/api/catha/inventory') ||
    path === '/api/catha/settings' ||
    path.startsWith('/api/catha/shops/public') ||
    path.startsWith('/api/menu-orders') ||
    path.startsWith('/api/waiter-calls') ||
    path.startsWith('/api/mpesa/stk-push') ||
    path === '/menu' ||
    path.startsWith('/menu/')
  ) {
    const shop = await findActiveShopBySlug(shopQuery || CATHA_LOUNGE_SHOP_ID)
    return shop ? { mode: 'shop', shopId: shop.shopId } : { mode: 'deny' }
  }
  return { mode: 'deny' }
}

async function shopFromUser(user: NonNullable<Awaited<ReturnType<typeof sessionUser>>>): Promise<ShopScopeDecision> {
  const { cookies } = await import('next/headers')
  const shops = await listShopRecords()
  const jar = await cookies()
  const opened = openActiveShopCookie(jar.get(ACTIVE_SHOP_COOKIE)?.value, shopCookieSecret())
  const requested = opened && opened.userId === String(user._id) ? opened.shopId : null
  const shopId = pickActiveShopId(user, shops, requested)
  return shopId ? { mode: 'shop', shopId } : { mode: 'deny' }
}

export async function bindPublicShopFromRequest(request: Request, bodyShop?: string | null): Promise<ShopRecord> {
  const url = new URL(request.url)
  const code = String(bodyShop || url.searchParams.get('shop') || CATHA_LOUNGE_SHOP_ID).trim().toLowerCase()
  const shop = await findActiveShopBySlug(code)
  if (!shop) throw new ShopScopeError('Unknown or inactive shop.', 404)
  bindActiveShop(shop.shopId)
  return shop
}

export async function assertActorCanAccessShop(shopId: string): Promise<
  { ok: true } | { ok: false; status: number; error: string }
> {
  const user = await sessionUser()
  if (!user) return { ok: false, status: 401, error: 'Unauthorized' }
  const shop = (await listShopRecords()).find((row) => row.shopId === shopId)
  if (!shop) return { ok: false, status: 404, error: 'Shop not found' }
  if (!mayAccessShop(user, shop)) {
    return { ok: false, status: 403, error: 'You do not have access to this shop.' }
  }
  return { ok: true }
}

export async function readActiveShopForSession(): Promise<{
  user: NonNullable<Awaited<ReturnType<typeof sessionUser>>>
  shop: ShopRecord
  shops: ShopRecord[]
} | null> {
  const user = await sessionUser()
  if (!user) return null
  const shops = await listShopRecords()
  const { cookies } = await import('next/headers')
  const jar = await cookies()
  const opened = openActiveShopCookie(jar.get(ACTIVE_SHOP_COOKIE)?.value, shopCookieSecret())
  const requested = opened && opened.userId === String(user._id) ? opened.shopId : null
  const shopId = pickActiveShopId(user, shops, requested)
  const shop = shops.find((row) => row.shopId === shopId) || null
  if (!shop) return null
  return { user, shop, shops: shops.filter((row) => mayAccessShop(user, row)) }
}
