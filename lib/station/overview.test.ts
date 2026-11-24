import { describe, expect, it } from 'vitest'
import { sumStationDays, type StationDay } from './overview-math'

const row = (partial: Partial<StationDay>): StationDay => ({
  id: 'a',
  name: 'A',
  kind: 'station',
  active: true,
  sales: 0,
  paidOrders: 0,
  openOrders: 0,
  orders: 0,
  lowStock: 0,
  products: 0,
  mpesa: 0,
  expenses: 0,
  ...partial,
})

describe('station network totals', () => {
  it('adds each station without dropping Catha', () => {
    const overall = sumStationDays([
      row({ id: 'catha', kind: 'catha', sales: 1000, paidOrders: 2, mpesa: 800, expenses: 100, products: 10 }),
      row({ id: 'westlands', sales: 500, paidOrders: 1, openOrders: 1, orders: 2, lowStock: 3, products: 4, mpesa: 500, expenses: 50 }),
    ])
    expect(overall.sales).toBe(1500)
    expect(overall.paidOrders).toBe(3)
    expect(overall.openOrders).toBe(1)
    expect(overall.mpesa).toBe(1300)
    expect(overall.expenses).toBe(150)
    expect(overall.products).toBe(14)
    expect(overall.lowStock).toBe(3)
  })
})
