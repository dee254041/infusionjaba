export type CommerceEventRow = {
  _id?: unknown
  eventType?: string
  sessionId?: string
  path?: string
  pageName?: string
  productId?: string | null
  productName?: string | null
  searchQuery?: string | null
  value?: number | null
  orderId?: string | null
  metadata?: Record<string, unknown> | null
  country?: string | null
  city?: string | null
  deviceType?: string | null
  browser?: string | null
  os?: string | null
  createdAt?: Date | string | null
}

export type CommerceOrderRow = {
  id?: string
  total?: number
  timestamp?: Date | string | null
  items?: Array<{ name?: string; productName?: string; quantity?: number }>
}

const MEANINGFUL = new Set([
  'product_view',
  'add_to_cart',
  'remove_from_cart',
  'search',
  'click',
  'begin_checkout',
  'purchase',
  'wishlist_add',
])

const LIVE_TYPES = new Set([
  'page_view',
  'product_view',
  'add_to_cart',
  'remove_from_cart',
  'begin_checkout',
  'purchase',
  'search',
  'wishlist_add',
  'click',
  'page_exit',
  'scroll',
])

export function nairobiHour(value: unknown) {
  const date = value instanceof Date ? value : new Date(String(value || ''))
  if (!Number.isFinite(date.getTime())) return null
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Nairobi',
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(date)
  const parsed = Number(hour)
  return Number.isFinite(parsed) ? parsed : null
}

export function formatNairobiHour(hour: number) {
  const suffix = hour >= 12 ? 'PM' : 'AM'
  const h = hour % 12 || 12
  return `${h}:00 ${suffix}`
}

function metaNumber(event: CommerceEventRow, key: string) {
  const raw = Number(event.metadata?.[key])
  return Number.isFinite(raw) ? raw : 0
}

function pageKey(event: CommerceEventRow) {
  return String(event.pageName || event.path || 'Page')
}

export function activityLabel(event: CommerceEventRow, productLabel: string | null) {
  const type = String(event.eventType || 'activity')
  if (type === 'click') {
    const label = String(event.metadata?.label || event.metadata?.href || 'a control')
    return `click · ${label}`
  }
  if (type === 'page_exit') {
    const seconds = Math.round(metaNumber(event, 'durationSeconds'))
    return seconds > 0 ? `left page after ${seconds}s` : 'left page'
  }
  if (type === 'scroll') return `scrolled ${Math.round(metaNumber(event, 'scrollPercent'))}%`
  if (type === 'purchase') {
    const items = Array.isArray(event.metadata?.items) ? event.metadata?.items.map((item) => String(item)).filter(Boolean) : []
    return items.length ? `purchase · ${items.slice(0, 2).join(', ')}` : 'purchase'
  }
  return `${type.replace(/_/g, ' ')}${productLabel ? ` · ${productLabel}` : ''}`
}

export function buildCommerceBehavior(events: CommerceEventRow[], orders: CommerceOrderRow[]) {
  const pageMap: Record<string, { visits: number; totalTime: number; exits: number; measured: boolean }> = {}
  const ensure = (key: string) => {
    if (!pageMap[key]) pageMap[key] = { visits: 0, totalTime: 0, exits: 0, measured: false }
    return pageMap[key]
  }

  const sessionDevice = new Map<string, string>()
  const sessionScroll = new Map<string, number>()
  const sessionActive = new Map<string, number>()
  const sessionMeaningful = new Set<string>()
  const sessionPageViews = new Map<string, number>()
  const measuredSessions = new Set<string>()
  const browseHours: Record<number, number> = {}
  const orderHours: Record<number, number> = {}

  const chronological = [...events].sort(
    (a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
  )

  for (const event of chronological) {
    const sid = String(event.sessionId || '')
    const type = String(event.eventType || '')
    if (sid && event.deviceType && !sessionDevice.has(sid)) sessionDevice.set(sid, event.deviceType)
    if (type === 'page_view') {
      ensure(pageKey(event)).visits += 1
      if (sid) sessionPageViews.set(sid, (sessionPageViews.get(sid) || 0) + 1)
      const hour = nairobiHour(event.createdAt)
      if (hour != null) browseHours[hour] = (browseHours[hour] || 0) + 1
    }
    if (type === 'engagement' || type === 'page_exit') {
      const add = Math.max(0, Math.min(30 * 60, Math.round(metaNumber(event, 'activeSeconds'))))
      if (add > 0) {
        const page = ensure(pageKey(event))
        page.totalTime += add
        page.measured = true
        if (sid) {
          measuredSessions.add(sid)
          sessionActive.set(sid, (sessionActive.get(sid) || 0) + add)
        }
      }
    }
    if (type === 'page_exit') {
      const duration = metaNumber(event, 'durationSeconds')
      if (duration > 0 && duration < 15) ensure(pageKey(event)).exits += 1
    }
    if (type === 'scroll' || type === 'engagement' || type === 'page_exit') {
      const percent = Math.max(0, Math.min(100, Math.round(metaNumber(event, 'scrollPercent'))))
      if (sid && percent > 0) sessionScroll.set(sid, Math.max(sessionScroll.get(sid) || 0, percent))
    }
    if (sid && MEANINGFUL.has(type)) sessionMeaningful.add(sid)
  }

  const bySession = new Map<string, CommerceEventRow[]>()
  for (const event of chronological) {
    const sid = String(event.sessionId || '')
    if (!sid || measuredSessions.has(sid)) continue
    const list = bySession.get(sid) || []
    list.push(event)
    bySession.set(sid, list)
  }
  for (const list of bySession.values()) {
    for (let i = 0; i < list.length; i += 1) {
      const event = list[i]
      if (event.eventType !== 'page_view') continue
      const next = list.slice(i + 1).find((item) => item.eventType === 'page_view' || item.eventType === 'page_exit')
      if (!next) continue
      const spent = Math.max(
        0,
        Math.min(15 * 60, Math.round((new Date(next.createdAt || 0).getTime() - new Date(event.createdAt || 0).getTime()) / 1000))
      )
      const page = ensure(pageKey(event))
      page.totalTime += spent
      if (spent < 15) page.exits += 1
    }
  }

  const pageVisits = Object.entries(pageMap)
    .map(([name, data]) => ({
      name,
      visits: data.visits,
      avgTimeSpentSec: data.visits ? Math.round(data.totalTime / data.visits) : 0,
      exitRate: data.visits ? Math.round((data.exits / data.visits) * 100) : 0,
    }))
    .sort((a, b) => b.visits - a.visits)

  const visitors = new Set(
    events
      .filter((event) => event.eventType !== 'engagement' && event.eventType !== 'scroll')
      .map((event) => String(event.sessionId || ''))
      .filter(Boolean)
  )
  let bounceCount = 0
  for (const sid of visitors) {
    const views = sessionPageViews.get(sid) || 0
    const active = sessionActive.get(sid) || 0
    if (views <= 1 && !sessionMeaningful.has(sid) && active < 15) bounceCount += 1
  }

  const purchaseEvents = events.filter((event) => event.eventType === 'purchase')
  const completedIds = new Set<string>()
  for (const order of orders) {
    if (order.id) completedIds.add(String(order.id))
  }
  for (const event of purchaseEvents) {
    if (event.orderId) completedIds.add(String(event.orderId))
  }
  const completed = completedIds.size || purchaseEvents.length
  const revenue = orders.reduce((sum, order) => sum + (Number(order.total) || 0), 0)

  const unique = (type: string) =>
    new Set(events.filter((event) => event.eventType === type).map((event) => String(event.sessionId || '')).filter(Boolean)).size

  const funnel = {
    visitors: visitors.size,
    productViews: unique('product_view'),
    addToCart: unique('add_to_cart'),
    checkout: unique('begin_checkout'),
    completed,
  }

  const seenGeo = new Set<string>()
  const geoMap: Record<string, number> = {}
  const cityMap: Record<string, number> = {}
  const deviceMap: Record<string, number> = {}
  const browserMap: Record<string, number> = {}
  const osMap: Record<string, number> = {}
  const newestFirst = [...events].sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  )
  for (const event of newestFirst) {
    if (event.eventType === 'engagement' || event.eventType === 'scroll' || event.eventType === 'click') continue
    const sid = String(event.sessionId || '')
    if (!sid || seenGeo.has(sid)) continue
    seenGeo.add(sid)
    const country = String(event.country || '').trim()
    const city = String(event.city || '').trim()
    if (country && country.toLowerCase() !== 'unknown') geoMap[country] = (geoMap[country] || 0) + 1
    if (city && city.toLowerCase() !== 'unknown') cityMap[city] = (cityMap[city] || 0) + 1
    deviceMap[String(event.deviceType || 'desktop')] = (deviceMap[String(event.deviceType || 'desktop')] || 0) + 1
    browserMap[String(event.browser || 'Other')] = (browserMap[String(event.browser || 'Other')] || 0) + 1
    osMap[String(event.os || 'Other')] = (osMap[String(event.os || 'Other')] || 0) + 1
  }

  const purchaseByDevice = { mobile: 0, desktop: 0 }
  for (const event of purchaseEvents) {
    const device = sessionDevice.get(String(event.sessionId || ''))
    if (device === 'mobile' || device === 'desktop') purchaseByDevice[device] += 1
  }
  for (const order of orders) {
    const hour = nairobiHour(order.timestamp)
    if (hour != null) orderHours[hour] = (orderHours[hour] || 0) + 1
  }

  const liveActivity = newestFirst
    .filter((event) => {
      const type = String(event.eventType || '')
      if (!LIVE_TYPES.has(type)) return false
      if (type === 'scroll' && metaNumber(event, 'scrollPercent') < 75) return false
      return true
    })
    .slice(0, 25)

  const scrollValues = [...sessionScroll.values()]
  const avgScroll = scrollValues.length
    ? Math.round(scrollValues.reduce((sum, value) => sum + value, 0) / scrollValues.length)
    : 0
  const activeSeconds = [...sessionActive.values()].reduce((sum, value) => sum + value, 0)

  return {
    pageVisits,
    visitors: visitors.size,
    bounceCount,
    funnel,
    completed,
    revenue,
    geoMap,
    cityMap,
    deviceMap,
    browserMap,
    osMap,
    browseHours,
    orderHours,
    liveActivity,
    avgScroll,
    activeSeconds,
    sessionDevice,
    purchaseByDevice,
    purchaseEvents,
  }
}

function peak(map: Record<number, number>) {
  const entries = Object.entries(map)
  if (!entries.length) return null
  entries.sort((a, b) => Number(b[1]) - Number(a[1]))
  return { hour: Number(entries[0][0]), count: Number(entries[0][1]) }
}

export function buildCommerceInsights(input: {
  trendingProduct?: string | null
  highViewProduct?: string | null
  checkoutDropOff: number
  topCity?: string | null
  cityIsOrders: boolean
  browseHours: Record<number, number>
  orderHours: Record<number, number>
  avgScroll: number
  activeSeconds: number
  completed: number
  revenue: number
  mobileSessions: number
  desktopSessions: number
  mobilePurchases: number
  desktopPurchases: number
}) {
  const browsePeak = peak(input.browseHours)
  const orderPeak = peak(input.orderHours)
  const mobileRate = input.mobileSessions ? input.mobilePurchases / input.mobileSessions : 0
  const desktopRate = input.desktopSessions ? input.desktopPurchases / input.desktopSessions : 0
  const lines = [
    input.trendingProduct ? `Product ${input.trendingProduct} is trending fast in this period.` : null,
    input.checkoutDropOff > 50 ? 'Checkout abandonment increased and needs immediate review.' : null,
    input.completed > 0
      ? `Shoppers completed ${input.completed} online order${input.completed === 1 ? '' : 's'}${input.revenue > 0 ? ` worth KSh ${Math.round(input.revenue).toLocaleString('en-KE')}` : ''}.`
      : null,
    browsePeak ? `Most browsing is around ${formatNairobiHour(browsePeak.hour)} Nairobi time (${browsePeak.count} page views).` : null,
    orderPeak ? `Most completed orders are around ${formatNairobiHour(orderPeak.hour)} Nairobi time (${orderPeak.count} orders).` : null,
    input.avgScroll > 0 ? `Shoppers scroll about ${input.avgScroll}% of a page before they leave.` : null,
    input.activeSeconds >= 60
      ? `Shoppers spent ${Math.round(input.activeSeconds / 60)} minutes actively browsing in this period.`
      : null,
    input.mobilePurchases + input.desktopPurchases > 0 && mobileRate !== desktopRate
      ? mobileRate > desktopRate
        ? 'Mobile shoppers are completing a higher share of orders than desktop shoppers.'
        : 'Desktop shoppers are completing a higher share of orders than mobile shoppers.'
      : input.mobileSessions > input.desktopSessions
        ? 'More shoppers are browsing on mobile than on desktop.'
        : input.desktopSessions > input.mobileSessions
          ? 'More shoppers are browsing on desktop than on mobile.'
          : null,
    input.topCity
      ? input.cityIsOrders
        ? `${input.topCity} currently has the highest buying activity.`
        : `${input.topCity} currently has the most shoppers.`
      : null,
    input.highViewProduct
      ? `Product ${input.highViewProduct} has high views but low purchases; review pricing and PDP content.`
      : null,
  ]
  return lines.filter((line): line is string => Boolean(line))
}
