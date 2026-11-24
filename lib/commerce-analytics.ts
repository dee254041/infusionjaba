import type { Db } from 'mongodb'
import { getClientIp } from '@/lib/rate-limit-simple'

export type AnalyticsEventType =
  | 'page_view'
  | 'product_view'
  | 'add_to_cart'
  | 'remove_from_cart'
  | 'begin_checkout'
  | 'purchase'
  | 'search'
  | 'wishlist_add'
  | 'scroll'
  | 'engagement'
  | 'page_exit'
  | 'click'

const STOREFRONT_PREFIXES = [
  '/shop',
  '/product',
  '/checkout',
  '/cart',
  '/account',
  '/track',
  '/pay',
  '/auth',
  '/privacy-policy',
]

export function isStorefrontAnalyticsPath(path: string) {
  const clean = String(path || '/').split('?')[0] || '/'
  if (clean === '/') return true
  if (
    clean.startsWith('/catha') ||
    clean.startsWith('/jaba') ||
    clean.startsWith('/api') ||
    clean.startsWith('/menu') ||
    clean.startsWith('/pos')
  ) {
    return false
  }
  return STOREFRONT_PREFIXES.some((prefix) => clean === prefix || clean.startsWith(`${prefix}/`))
}

export function cleanAnalyticsSessionId(value: unknown) {
  const raw = typeof value === 'string' ? value.trim().slice(0, 80) : ''
  if (!raw || !/^[\w:.-]+$/.test(raw)) return ''
  return raw
}

export function sanitizeAnalyticsMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const source = metadata as Record<string, unknown>
  const out: Record<string, unknown> = {}
  const scroll = Number(source.scrollPercent)
  if (Number.isFinite(scroll)) out.scrollPercent = Math.max(0, Math.min(100, Math.round(scroll)))
  const active = Number(source.activeSeconds)
  if (Number.isFinite(active)) out.activeSeconds = Math.max(0, Math.min(120, Math.round(active)))
  const duration = Number(source.durationSeconds)
  if (Number.isFinite(duration)) out.durationSeconds = Math.max(0, Math.min(30 * 60, Math.round(duration)))
  const resultCount = Number(source.resultCount)
  if (Number.isFinite(resultCount)) out.resultCount = Math.max(0, Math.min(10_000, Math.round(resultCount)))
  if (typeof source.label === 'string') {
    const label = source.label.replace(/\s+/g, ' ').trim().slice(0, 80)
    if (label && !/\+?\d[\d\s-]{8,}/.test(label)) out.label = label
  }
  if (typeof source.href === 'string') {
    const href = source.href.trim().slice(0, 180)
    if (href.startsWith('/') || href.startsWith('https://') || href.startsWith('http://')) out.href = href
  }
  if (typeof source.checkoutSessionId === 'string' && /^[\w:-]{1,80}$/.test(source.checkoutSessionId)) {
    out.checkoutSessionId = source.checkoutSessionId
  }
  if (Array.isArray(source.items)) {
    const items = source.items.map((item) => String(item).replace(/\s+/g, ' ').trim().slice(0, 80)).filter(Boolean).slice(0, 12)
    if (items.length) out.items = items
  }
  if (Array.isArray(source.removedIds)) {
    const removedIds = source.removedIds
      .map((item) => String(item).trim().slice(0, 80))
      .filter((item) => item && !/\+?\d[\d\s-]{8,}/.test(item))
      .slice(0, 20)
    if (removedIds.length) out.removedIds = removedIds
  }
  return Object.keys(out).length ? out : null
}

export interface AnalyticsEventInput {
  eventType: AnalyticsEventType
  sessionId?: string | null
  path?: string | null
  pageName?: string | null
  productId?: string | null
  productName?: string | null
  category?: string | null
  searchQuery?: string | null
  quantity?: number | null
  value?: number | null
  orderId?: string | null
  metadata?: Record<string, unknown> | null
}

const DB_NAME = 'infusion_jaba'
const EVENTS_COLL = 'analytics_events'
const SESSIONS_COLL = 'analytics_sessions'
const DAILY_SUMMARY_COLL = 'analytics_daily_summary'

export function analyticsDbName() {
  return DB_NAME
}

export function getAnalyticsCollections() {
  return {
    events: EVENTS_COLL,
    sessions: SESSIONS_COLL,
    dailySummary: DAILY_SUMMARY_COLL,
  }
}

function getPageNameFromPath(path: string) {
  if (path === '/') return 'Homepage'
  if (path.startsWith('/shop')) return 'Shop Page'
  if (path.startsWith('/product/')) return 'Product Pages'
  if (path.startsWith('/checkout')) return 'Checkout'
  if (path.startsWith('/cart')) return 'Cart'
  if (path.startsWith('/account')) return 'Account'
  if (path.startsWith('/track')) return 'Order Tracking'
  if (path.startsWith('/pay')) return 'Payment'
  if (path.startsWith('/auth')) return 'Sign In'
  if (path.startsWith('/r/')) return 'Receipt'
  return 'Dynamic Route'
}

function normalizePath(path?: string | null) {
  if (!path) return '/'
  const safe = String(path).trim()
  if (!safe.startsWith('/')) return `/${safe}`
  return safe || '/'
}

function parseUserAgent(userAgent: string | null) {
  const ua = (userAgent || '').toLowerCase()
  let deviceType: 'mobile' | 'tablet' | 'desktop' = 'desktop'
  if (/tablet|ipad/.test(ua)) deviceType = 'tablet'
  else if (/mobile|android|iphone|ipod/.test(ua)) deviceType = 'mobile'

  const browser =
    /edg\//.test(ua) ? 'Edge' :
    /opr\//.test(ua) ? 'Opera' :
    /chrome\//.test(ua) ? 'Chrome' :
    /firefox\//.test(ua) ? 'Firefox' :
    /safari\//.test(ua) && !/chrome\//.test(ua) ? 'Safari' :
    'Other'

  const os =
    /windows/.test(ua) ? 'Windows' :
    /mac os/.test(ua) ? 'macOS' :
    /android/.test(ua) ? 'Android' :
    /iphone|ipad|ios/.test(ua) ? 'iOS' :
    /linux/.test(ua) ? 'Linux' :
    'Other'

  return { deviceType, browser, os }
}

let indexesReady: Promise<void> | null = null

export async function ensureAnalyticsIndexes(db: Db) {
  const { events, sessions, dailySummary } = getAnalyticsCollections()
  await Promise.all([
    db.collection(events).createIndex({ createdAt: -1 }).catch(() => {}),
    db.collection(events).createIndex({ eventType: 1, createdAt: -1 }).catch(() => {}),
    db.collection(events).createIndex({ sessionId: 1, createdAt: -1 }).catch(() => {}),
    db.collection(events).createIndex({ path: 1, createdAt: -1 }).catch(() => {}),
    db.collection(events).createIndex({ productId: 1, createdAt: -1 }).catch(() => {}),
    db.collection(sessions).createIndex({ sessionId: 1 }, { unique: true }).catch(() => {}),
    db.collection(sessions).createIndex({ lastSeenAt: -1 }).catch(() => {}),
    db.collection(dailySummary).createIndex({ day: 1 }, { unique: true }).catch(() => {}),
  ])
}

export async function trackAnalyticsEvent(db: Db, request: Request | null, input: AnalyticsEventInput) {
  if (!indexesReady) indexesReady = ensureAnalyticsIndexes(db).catch((error) => {
    indexesReady = null
    throw error
  })
  await indexesReady

  const now = new Date()
  const path = normalizePath(input.path)
  if (!isStorefrontAnalyticsPath(path)) return
  const pageName = input.pageName?.trim() || getPageNameFromPath(path)
  const sessionId = cleanAnalyticsSessionId(input.sessionId) || (request ? `anon:${getClientIp(request)}` : `order:${now.getTime()}`)
  const userAgent = request?.headers.get('user-agent') ?? null
  const ua = parseUserAgent(userAgent)
  let country = request?.headers.get('x-vercel-ip-country') || request?.headers.get('cf-ipcountry') || null
  let city = request?.headers.get('x-vercel-ip-city') || null
  let deviceType = ua.deviceType
  let browser = ua.browser
  let os = ua.os
  const ip = request ? getClientIp(request) : null
  if (!request) {
    const existing = await db.collection(SESSIONS_COLL).findOne({ sessionId })
    if (existing) {
      country = (existing.country as string | null) || country
      city = (existing.city as string | null) || city
      deviceType = (existing.deviceType as typeof deviceType) || deviceType
      browser = (existing.browser as string) || browser
      os = (existing.os as string) || os
    }
  }
  const metadata = sanitizeAnalyticsMetadata(input.metadata)

  const eventDoc = {
    eventType: input.eventType,
    sessionId,
    path,
    pageName,
    productId: input.productId || null,
    productName: input.productName || null,
    category: input.category || null,
    searchQuery: input.searchQuery || null,
    quantity: Number.isFinite(input.quantity) ? Number(input.quantity) : null,
    value: Number.isFinite(input.value) ? Number(input.value) : null,
    orderId: input.orderId || null,
    metadata,
    ip,
    country,
    city,
    deviceType,
    browser,
    os,
    createdAt: now,
  }

  const activeSeconds = Number(metadata?.activeSeconds) || 0
  const scrollPercent = Number(metadata?.scrollPercent) || 0

  await db.collection(EVENTS_COLL).insertOne(eventDoc)

  const sessionSet: Record<string, unknown> = {
    lastSeenAt: now,
    lastPath: path,
    lastPageName: pageName,
    lastEventType: input.eventType,
  }
  if (ip) sessionSet.ip = ip
  if (country) sessionSet.country = country
  if (city) sessionSet.city = city
  if (request || deviceType) {
    sessionSet.deviceType = deviceType
    sessionSet.browser = browser
    sessionSet.os = os
  }

  const sessionUpdate: Record<string, unknown> = {
    $set: sessionSet,
    $setOnInsert: { sessionId, createdAt: now },
    $inc: { totalEvents: 1, ...(activeSeconds > 0 ? { activeSeconds } : {}) },
    $max: { maxScrollPercent: scrollPercent },
  }
  if (input.orderId) {
    sessionUpdate.$addToSet = { orderIds: input.orderId }
  }

  await db.collection(SESSIONS_COLL).updateOne({ sessionId }, sessionUpdate, { upsert: true })

  const day = now.toISOString().slice(0, 10)
  await db.collection(DAILY_SUMMARY_COLL).updateOne(
    { day },
    {
      $set: { updatedAt: now },
      $setOnInsert: { day, createdAt: now },
      $inc: {
        totalEvents: 1,
        [`events.${input.eventType}`]: 1,
        ...(activeSeconds > 0 ? { activeSeconds } : {}),
      },
    },
    { upsert: true }
  )
}
