import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { getDatabase } from '@/lib/mongodb'
import { requireSuperAdminApi } from '@/lib/catha-auth'
import { analyticsDbName, getAnalyticsCollections } from '@/lib/commerce-analytics'
import { buildCommerceBehavior, buildCommerceInsights, activityLabel, type CommerceEventRow } from '@/lib/commerce-analytics-summary'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function parseDateRange(url: URL) {
  const range = url.searchParams.get('range') || '30d'
  const now = new Date()
  const to = new Date(now)
  const from = new Date(now)
  if (range === 'today') from.setHours(0, 0, 0, 0)
  else if (range === '7d') from.setDate(from.getDate() - 7)
  else if (range === '30d') from.setDate(from.getDate() - 30)
  else if (range === 'custom') {
    const fromRaw = url.searchParams.get('from')
    const toRaw = url.searchParams.get('to')
    const parsedFrom = fromRaw ? new Date(fromRaw) : null
    const parsedTo = toRaw ? new Date(toRaw) : null
    if (parsedFrom && Number.isFinite(parsedFrom.getTime())) from.setTime(parsedFrom.getTime())
    if (parsedTo && Number.isFinite(parsedTo.getTime())) to.setTime(parsedTo.getTime())
  } else {
    from.setDate(from.getDate() - 30)
  }
  return { range, from, to }
}

function csvEscape(value: unknown) {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}

function toPercent(num: number, den: number) {
  if (!den) return 0
  return Math.round((num / den) * 100)
}

function isUnknownLabel(value: unknown) {
  const text = String(value || '').trim().toLowerCase()
  return !text || text === 'unknown' || text === 'unknown product'
}

function normalizeGeoLabel(value: unknown) {
  const text = String(value || '').trim()
  if (!text || text.toLowerCase() === 'unknown') return null
  return text
}

async function buildProductNameMap(db: Awaited<ReturnType<typeof getDatabase>>) {
  const products = await db.collection('bar_inventory').find(
    { type: 'bar', deleted: { $ne: true } },
    { projection: { name: 1 } }
  ).toArray()
  const map = new Map<string, string>()
  for (const product of products) {
    const id = String(product._id)
    const name = String(product.name || '').trim()
    if (name && !isUnknownLabel(name)) map.set(id, name)
  }
  return map
}

function resolveProductLabel(event: any, productNameMap: Map<string, string>) {
  const direct = String(event.productName || '').trim()
  if (direct && !isUnknownLabel(direct)) return direct

  const productId = String(event.productId || '').trim()
  if (productId && productNameMap.has(productId)) return productNameMap.get(productId)!

  const path = String(event.path || '')
  if (path.startsWith('/product/')) {
    const fromPath = path.replace('/product/', '').split('/')[0]?.trim()
    if (fromPath && productNameMap.has(fromPath)) return productNameMap.get(fromPath)!
  }

  return null
}

export async function GET(request: Request) {
  const [, errResp] = await requireSuperAdminApi()
  if (errResp) return errResp

  try {
    const url = new URL(request.url)
    const format = (url.searchParams.get('format') || '').toLowerCase()
    const { from, to, range } = parseDateRange(url)
    const db = await getDatabase(analyticsDbName())
    const collections = getAnalyticsCollections()

    const events = await db.collection(collections.events).find({
      createdAt: { $gte: from, $lte: to },
    }).sort({ createdAt: -1 }).toArray()
    const shopOrders = await db.collection('orders').find({
      type: 'ecommerce',
      $or: [
        { timestamp: { $gte: from, $lte: to } },
        { createdAt: { $gte: from, $lte: to } },
      ],
    }).project({ id: 1, total: 1, items: 1, timestamp: 1, createdAt: 1 }).toArray()

    const productNameMap = await buildProductNameMap(db)

    const activeSince = new Date(Date.now() - 5 * 60 * 1000)
    const liveVisitorsNow = await db.collection(collections.sessions).countDocuments({ lastSeenAt: { $gte: activeSince } })

    const now = new Date()
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekStart = new Date(dayStart); weekStart.setDate(weekStart.getDate() - 7)
    const monthStart = new Date(dayStart); monthStart.setDate(monthStart.getDate() - 30)

    const visitorEventTypes = ['page_view', 'product_view', 'add_to_cart', 'remove_from_cart', 'begin_checkout', 'purchase', 'search', 'wishlist_add', 'click', 'page_exit']
    const countVisitorsSince = async (since: Date) => {
      const rows = await db.collection(collections.events).aggregate([
        { $match: { createdAt: { $gte: since }, eventType: { $in: visitorEventTypes } } },
        { $group: { _id: '$sessionId' } },
        { $count: 'visitors' },
      ]).toArray()
      return Number(rows[0]?.visitors) || 0
    }
    const [visitorsToday, visitorsWeek, visitorsMonth] = await Promise.all([
      countVisitorsSince(dayStart),
      countVisitorsSince(weekStart),
      countVisitorsSince(monthStart),
    ])
    const returningVisitors = await db.collection(collections.sessions).countDocuments({
      createdAt: { $lt: from },
      lastSeenAt: { $gte: from, $lte: to },
    })

    const behavior = buildCommerceBehavior(events as CommerceEventRow[], shopOrders.map((order) => ({
      id: String(order.id || ''),
      total: Number(order.total) || 0,
      timestamp: (order.timestamp || order.createdAt) as Date | string | null,
      items: Array.isArray(order.items) ? order.items : [],
    })))
    const bounceRate = toPercent(behavior.bounceCount, behavior.visitors)
    const pageVisits = behavior.pageVisits

    const productByMetric: Record<string, Record<string, { count: number; purchases: number }>> = {
      viewed: {},
      added: {},
      wishlisted: {},
      purchased: {},
    }
    for (const e of events) {
      if (!['product_view', 'add_to_cart', 'wishlist_add', 'purchase'].includes(e.eventType)) continue
      const name = resolveProductLabel(e, productNameMap)
      if (!name && e.eventType !== 'purchase') continue
      if (e.eventType === 'product_view') productByMetric.viewed[name] = { count: (productByMetric.viewed[name]?.count || 0) + 1, purchases: 0 }
      if (e.eventType === 'add_to_cart') productByMetric.added[name] = { count: (productByMetric.added[name]?.count || 0) + 1, purchases: 0 }
      if (e.eventType === 'wishlist_add') productByMetric.wishlisted[name] = { count: (productByMetric.wishlisted[name]?.count || 0) + 1, purchases: 0 }
      if (e.eventType === 'purchase') {
        const items = Array.isArray(e.metadata?.items) ? e.metadata.items : []
        if (items.length) {
          for (const item of items) {
            const itemName = String(item).replace(/\sx\d+$/i, '').trim()
            if (!itemName || isUnknownLabel(itemName)) continue
            productByMetric.purchased[itemName] = { count: (productByMetric.purchased[itemName]?.count || 0) + 1, purchases: 0 }
          }
        } else if (name) {
          productByMetric.purchased[name] = { count: (productByMetric.purchased[name]?.count || 0) + 1, purchases: 0 }
        }
      }
    }
    if (shopOrders.length) {
      productByMetric.purchased = {}
      for (const order of shopOrders) {
        const items = Array.isArray(order.items) ? order.items : []
        for (const item of items) {
          const itemName = String(item?.productName || item?.name || '').trim()
          if (!itemName || isUnknownLabel(itemName)) continue
          const qty = Math.max(1, Number(item?.quantity) || 1)
          productByMetric.purchased[itemName] = { count: (productByMetric.purchased[itemName]?.count || 0) + qty, purchases: 0 }
        }
      }
    }
    const toRanked = (bucket: Record<string, { count: number; purchases: number }>) =>
      Object.entries(bucket)
        .map(([name, v]) => ({ name, count: v.count }))
        .filter((item) => !isUnknownLabel(item.name))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8)
    const mostViewedProducts = toRanked(productByMetric.viewed)
    const mostAddedToCart = toRanked(productByMetric.added)
    const mostWishlisted = toRanked(productByMetric.wishlisted)
    const mostPurchased = toRanked(productByMetric.purchased)

    const purchasedByName = new Map(mostPurchased.map((p) => [p.name, p.count]))
    const highViewsLowPurchases = mostViewedProducts
      .map((item) => ({ ...item, purchaseCount: purchasedByName.get(item.name) || 0 }))
      .filter((item) => item.count >= 3 && item.purchaseCount <= 1)
      .slice(0, 8)

    const visitors = behavior.funnel.visitors
    const productViews = behavior.funnel.productViews
    const addToCart = behavior.funnel.addToCart
    const checkout = behavior.funnel.checkout
    const completed = behavior.funnel.completed
    const funnel = {
      visitors,
      productViews,
      addToCart,
      checkout,
      completed,
      dropOff: {
        visitorsToViews: visitors ? 100 - toPercent(productViews, visitors) : 0,
        viewsToCart: productViews ? 100 - toPercent(addToCart, productViews) : 0,
        cartToCheckout: addToCart ? 100 - toPercent(checkout, addToCart) : 0,
        checkoutToCompleted: checkout ? 100 - toPercent(completed, checkout) : 0,
      },
    }

    const searchEvents = events.filter((e: any) => e.eventType === 'search')
    const searchMap: Record<string, number> = {}
    const noResultSearchMap: Record<string, number> = {}
    searchEvents.forEach((e: any) => {
      const q = String(e.searchQuery || '').trim().toLowerCase()
      if (!q) return
      searchMap[q] = (searchMap[q] || 0) + 1
      if ((e.metadata as any)?.resultCount === 0) {
        noResultSearchMap[q] = (noResultSearchMap[q] || 0) + 1
      }
    })
    const topSearches = Object.entries(searchMap).map(([query, count]) => ({ query, count })).sort((a, b) => b.count - a.count).slice(0, 10)
    const noResultSearches = Object.entries(noResultSearchMap).map(([query, count]) => ({ query, count })).sort((a, b) => b.count - a.count).slice(0, 10)

    const liveActivity = behavior.liveActivity.map((e) => {
      const productLabel = resolveProductLabel(e, productNameMap)
      return {
        id: String(e._id),
        label: activityLabel(e, productLabel),
        when: new Date(e.createdAt || Date.now()).toISOString(),
        city: normalizeGeoLabel(e.city),
        deviceType: e.deviceType || 'desktop',
        path: e.path || '/',
      }
    })

    const { geoMap, cityMap, deviceMap, browserMap, osMap } = behavior
    const topCity = Object.entries(cityMap).sort((a, b) => b[1] - a[1])[0]
    let mobileSessions = 0
    let desktopSessions = 0
    for (const device of behavior.sessionDevice.values()) {
      if (device === 'mobile') mobileSessions += 1
      if (device === 'desktop') desktopSessions += 1
    }
    const aiInsights = buildCommerceInsights({
      trendingProduct: mostViewedProducts[0]?.name,
      highViewProduct: highViewsLowPurchases[0]?.name,
      checkoutDropOff: funnel.dropOff.checkoutToCompleted,
      topCity: topCity?.[0],
      cityIsOrders: false,
      browseHours: behavior.browseHours,
      orderHours: behavior.orderHours,
      avgScroll: behavior.avgScroll,
      activeSeconds: behavior.activeSeconds,
      completed: behavior.completed,
      revenue: behavior.revenue,
      mobileSessions,
      desktopSessions,
      mobilePurchases: behavior.purchaseByDevice.mobile,
      desktopPurchases: behavior.purchaseByDevice.desktop,
    })

    const payload = {
      success: true,
      generatedAt: new Date().toISOString(),
      range,
      from: from.toISOString(),
      to: to.toISOString(),
      dashboard: {
        visitorsToday,
        visitorsWeek,
        visitorsMonth,
        liveVisitorsNow,
        returningVisitors,
        bounceRate,
      },
      pageVisits,
      products: {
        mostViewedProducts,
        mostAddedToCart,
        mostWishlisted,
        mostPurchased,
        highViewsLowPurchases,
      },
      funnel,
      search: { topSearches, noResultSearches },
      liveActivity,
      geoDevice: {
        countries: Object.entries(geoMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10),
        cities: Object.entries(cityMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10),
        devices: Object.entries(deviceMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
        browsers: Object.entries(browserMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
        os: Object.entries(osMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      },
      aiInsights,
    }

    if (format === 'csv') {
      const rows: string[] = []
      rows.push(['Metric', 'Value'].map(csvEscape).join(','))
      rows.push(['Visitors Today', payload.dashboard.visitorsToday].map(csvEscape).join(','))
      rows.push(['Visitors This Week', payload.dashboard.visitorsWeek].map(csvEscape).join(','))
      rows.push(['Visitors This Month', payload.dashboard.visitorsMonth].map(csvEscape).join(','))
      rows.push(['Live Visitors Now', payload.dashboard.liveVisitorsNow].map(csvEscape).join(','))
      rows.push(['Returning Visitors', payload.dashboard.returningVisitors].map(csvEscape).join(','))
      rows.push(['Bounce Rate %', payload.dashboard.bounceRate].map(csvEscape).join(','))
      const csv = rows.join('\n')
      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="catha-commerce-analytics-${range}.csv"`,
        },
      })
    }

    if (format === 'xlsx' || format === 'excel') {
      const wb = XLSX.utils.book_new()
      const wsMetrics = XLSX.utils.json_to_sheet([
        { metric: 'Visitors Today', value: payload.dashboard.visitorsToday },
        { metric: 'Visitors This Week', value: payload.dashboard.visitorsWeek },
        { metric: 'Visitors This Month', value: payload.dashboard.visitorsMonth },
        { metric: 'Live Visitors Now', value: payload.dashboard.liveVisitorsNow },
        { metric: 'Returning Visitors', value: payload.dashboard.returningVisitors },
        { metric: 'Bounce Rate %', value: payload.dashboard.bounceRate },
      ])
      const wsPages = XLSX.utils.json_to_sheet(payload.pageVisits)
      XLSX.utils.book_append_sheet(wb, wsMetrics, 'Metrics')
      XLSX.utils.book_append_sheet(wb, wsPages, 'Page Visits')
      const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' })
      return new Response(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="catha-commerce-analytics-${range}.xlsx"`,
        },
      })
    }

    return NextResponse.json(payload)
  } catch (error: any) {
    console.error('[catha/ai-intelligence/commerce] Error:', error)
    return NextResponse.json({ success: false, error: 'Failed to load commerce analytics' }, { status: 500 })
  }
}
