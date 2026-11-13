import { describe, expect, it } from 'vitest'
import { isStorefrontAnalyticsPath, sanitizeAnalyticsMetadata } from '@/lib/commerce-analytics'
import { buildCommerceBehavior, buildCommerceInsights, nairobiHour } from '@/lib/commerce-analytics-summary'

describe('storefront analytics paths', () => {
  it('tracks the shop and skips staff pages', () => {
    expect(isStorefrontAnalyticsPath('/')).toBe(true)
    expect(isStorefrontAnalyticsPath('/shop')).toBe(true)
    expect(isStorefrontAnalyticsPath('/product/abc')).toBe(true)
    expect(isStorefrontAnalyticsPath('/checkout')).toBe(true)
    expect(isStorefrontAnalyticsPath('/catha/pos')).toBe(false)
    expect(isStorefrontAnalyticsPath('/jaba/ai-intelligence')).toBe(false)
    expect(isStorefrontAnalyticsPath('/menu')).toBe(false)
  })

  it('drops phone-like click labels and keeps scroll time', () => {
    expect(sanitizeAnalyticsMetadata({
      scrollPercent: 140,
      activeSeconds: 15,
      durationSeconds: 15,
      label: '+254712345678',
      href: '/shop',
    })).toEqual({
      scrollPercent: 100,
      activeSeconds: 15,
      durationSeconds: 15,
      href: '/shop',
    })
  })
})

describe('commerce behavior summary', () => {
  it('uses saved active time and real orders', () => {
    const behavior = buildCommerceBehavior(
      [
        {
          _id: '1',
          eventType: 'page_view',
          sessionId: 'sess_a',
          pageName: 'Shop Page',
          path: '/shop',
          deviceType: 'mobile',
          city: 'Nairobi',
          country: 'KE',
          createdAt: '2026-11-13T16:00:00.000Z',
        },
        {
          _id: '2',
          eventType: 'engagement',
          sessionId: 'sess_a',
          pageName: 'Shop Page',
          path: '/shop',
          metadata: { activeSeconds: 15, scrollPercent: 50 },
          createdAt: '2026-11-13T16:00:15.000Z',
        },
        {
          _id: '3',
          eventType: 'scroll',
          sessionId: 'sess_a',
          pageName: 'Shop Page',
          path: '/shop',
          metadata: { scrollPercent: 100 },
          createdAt: '2026-11-13T16:00:20.000Z',
        },
        {
          _id: '4',
          eventType: 'page_exit',
          sessionId: 'sess_a',
          pageName: 'Shop Page',
          path: '/shop',
          metadata: { durationSeconds: 20, activeSeconds: 5, scrollPercent: 100 },
          createdAt: '2026-11-13T16:00:20.000Z',
        },
      ],
      [{ id: 'ECO1', total: 2400, timestamp: '2026-11-13T18:00:00.000Z', items: [{ name: 'Jaba Juice', quantity: 2 }] }]
    )

    expect(behavior.pageVisits[0]).toMatchObject({ name: 'Shop Page', visits: 1, avgTimeSpentSec: 20 })
    expect(behavior.funnel.visitors).toBe(1)
    expect(behavior.funnel.completed).toBe(1)
    expect(behavior.revenue).toBe(2400)
    expect(behavior.avgScroll).toBe(100)
    expect(behavior.liveActivity.some((event) => event.eventType === 'engagement')).toBe(false)
    expect(nairobiHour('2026-11-13T16:00:00.000Z')).toBe(19)

    const insights = buildCommerceInsights({
      checkoutDropOff: 0,
      browseHours: behavior.browseHours,
      orderHours: behavior.orderHours,
      avgScroll: behavior.avgScroll,
      activeSeconds: behavior.activeSeconds,
      completed: behavior.completed,
      revenue: behavior.revenue,
      mobileSessions: 1,
      desktopSessions: 0,
      mobilePurchases: 0,
      desktopPurchases: 0,
      cityIsOrders: false,
      topCity: 'Nairobi',
    })
    expect(insights.some((line) => line.includes('7PM and 9PM'))).toBe(false)
    expect(insights.some((line) => line.includes('KSh'))).toBe(true)
    expect(insights.some((line) => line.includes('Nairobi time'))).toBe(true)
  })
})
