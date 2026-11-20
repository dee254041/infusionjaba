import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { asMoney, asText, normalizeTransaction } from '../app/catha/(protected)/mpesa-transactions/page'

describe('mpesa page render', () => {
  it('renders empty state', () => {
    return import('../app/catha/(protected)/mpesa-transactions/page').then((mod) => {
      const html = renderToString(createElement(mod.default))
      expect(html).toContain('M-Pesa')
    })
  })

  it('turns dirty payment rows into text and numbers', () => {
    const row = normalizeTransaction({
      id: 'abc123456789',
      amount: { $numberDecimal: '250.5' } as unknown as number,
      phoneNumber: 254712345678 as unknown as string,
      accountReference: 12345 as unknown as string,
      checkoutRequestId: 99887766 as unknown as string,
      status: 'COMPLETED',
      createdAt: '2026-11-20T08:00:00.000Z',
      updatedAt: '2026-11-20T08:00:00.000Z',
    })

    expect(asMoney(row.amount)).toBe(250.5)
    expect(asText(row.accountReference).startsWith('TXN')).toBe(false)
    expect(asText(row.phoneNumber).slice(0, 4)).toBe('2547')
    expect(asText(row.checkoutRequestId).slice(-6)).toBe('887766')
    expect(row.amount.toLocaleString('en-KE', { minimumFractionDigits: 2 })).toContain('250')
  })
})
