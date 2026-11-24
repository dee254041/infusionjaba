import type { Db } from 'mongodb'
import { CATHA_ORDERS_MAIN_LIST_EXCLUSION } from '@/lib/catha-orders-list-filter'
import { nairobiDayBounds } from '@/lib/catha-finance-dashboard'
import { STATION, listStations } from '@/lib/station/store'
import { sumStationDays, type StationDay } from '@/lib/station/overview-math'

export type { StationDay } from '@/lib/station/overview-math'
export { sumStationDays } from '@/lib/station/overview-math'

function paid(status: unknown): boolean {
  const value = String(status || '').toUpperCase()
  return value === 'PAID' || value === 'OVERPAID' || value === 'COMPLETED'
}

function tally(orders: Array<{ total?: unknown; paymentStatus?: unknown; status?: unknown }>) {
  let sales = 0
  let paidOrders = 0
  let openOrders = 0
  for (const order of orders) {
    if (String(order.status || '').toLowerCase() === 'cancelled') continue
    const total = Number(order.total) || 0
    if (paid(order.paymentStatus) || String(order.status || '').toLowerCase() === 'completed') {
      sales += total
      paidOrders += 1
    } else {
      openOrders += 1
    }
  }
  return {
    sales: Math.round(sales),
    paidOrders,
    openOrders,
    orders: paidOrders + openOrders,
  }
}

async function mpesaTotal(db: Db, start: Date, end: Date, shopId: string | null) {
  const shopFilter = shopId
    ? { shopId }
    : { $or: [{ shopId: { $exists: false } }, { shopId: null }, { shopId: '' }, { shopId: 'catha' }] }
  const rows = await db
    .collection('mpesa_transactions')
    .find({
      createdAt: { $gte: start, $lt: end },
      status: 'COMPLETED',
      ...shopFilter,
    })
    .project({ amount: 1 })
    .toArray()
  return Math.round(rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0))
}

export async function computeStationNetwork(db: Db, dateStr?: string) {
  const { start, end, dateLabel } = nairobiDayBounds(dateStr)
  const [cathaOrders, cathaProducts, cathaLow, cathaExpenses, cathaMpesa, stations] = await Promise.all([
    db
      .collection('orders')
      .find({
        $and: [CATHA_ORDERS_MAIN_LIST_EXCLUSION, { timestamp: { $gte: start, $lt: end } }],
      })
      .project({ total: 1, paymentStatus: 1, status: 1 })
      .toArray(),
    db.collection('bar_inventory').countDocuments({
      type: 'bar',
      deleted: { $ne: true },
      status: { $ne: 'archived' },
    }),
    db.collection('bar_inventory').countDocuments({
      type: 'bar',
      deleted: { $ne: true },
      status: { $ne: 'archived' },
      stock: { $lte: 5 },
    }),
    db
      .collection('bar_expenses')
      .find({ type: 'bar', date: { $gte: start, $lt: end } })
      .project({ amount: 1 })
      .toArray(),
    mpesaTotal(db, start, end, null),
    listStations(db),
  ])
  const cathaSales = tally(cathaOrders)
  const catha: StationDay = {
    id: 'catha',
    name: 'Catha Lounge',
    kind: 'catha',
    active: true,
    ...cathaSales,
    lowStock: cathaLow,
    products: cathaProducts,
    mpesa: cathaMpesa,
    expenses: Math.round(cathaExpenses.reduce((sum, row) => sum + (Number(row.amount) || 0), 0)),
  }

  const stationRows = await Promise.all(
    stations.map(async (shop): Promise<StationDay> => {
      const [orders, products, lowStock, expenses, mpesa] = await Promise.all([
        db
          .collection(STATION.orders)
          .find({ shopId: shop.slug, createdAt: { $gte: start, $lt: end } })
          .project({ total: 1, paymentStatus: 1, status: 1 })
          .toArray(),
        db.collection(STATION.products).countDocuments({ shopId: shop.slug, visible: { $ne: false } }),
        db.collection(STATION.products).countDocuments({
          shopId: shop.slug,
          visible: { $ne: false },
          stock: { $lte: 5 },
        }),
        db
          .collection(STATION.expenses)
          .find({ shopId: shop.slug, createdAt: { $gte: start, $lt: end } })
          .project({ amount: 1 })
          .toArray(),
        mpesaTotal(db, start, end, shop.slug),
      ])
      return {
        id: shop.slug,
        name: shop.name,
        kind: 'station',
        active: shop.active,
        ...tally(orders),
        lowStock,
        products,
        mpesa,
        expenses: Math.round(expenses.reduce((sum, row) => sum + (Number(row.amount) || 0), 0)),
      }
    }),
  )

  const rows = [catha, ...stationRows]
  return { date: dateLabel, overall: sumStationDays(rows), rows }
}
