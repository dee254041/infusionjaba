import { describe, expect, it } from 'vitest'
import { getOrderReceiptUrl, publicSiteOrigin } from '@/lib/pay-url'

describe('public receipt links', () => {
  it('uses www so the link hits the shop, not the bare domain', () => {
    const previousBase = process.env.NEXT_PUBLIC_BASE_URL
    const previousAuth = process.env.NEXTAUTH_URL
    delete process.env.NEXT_PUBLIC_BASE_URL
    delete process.env.NEXTAUTH_URL
    expect(getOrderReceiptUrl('P068657')).toBe('https://www.infusionjaba.co.ke/r/P068657')
    if (previousBase === undefined) delete process.env.NEXT_PUBLIC_BASE_URL
    else process.env.NEXT_PUBLIC_BASE_URL = previousBase
    if (previousAuth === undefined) delete process.env.NEXTAUTH_URL
    else process.env.NEXTAUTH_URL = previousAuth
  })

  it('rewrites a bare infusionjaba.co.ke base to www', () => {
    expect(publicSiteOrigin('https://infusionjaba.co.ke')).toBe('https://www.infusionjaba.co.ke')
    expect(getOrderReceiptUrl('P068657', 'https://infusionjaba.co.ke')).toBe(
      'https://www.infusionjaba.co.ke/r/P068657'
    )
  })
})
