export type StationDay = {
  id: string
  name: string
  kind: 'catha' | 'station'
  active: boolean
  sales: number
  paidOrders: number
  openOrders: number
  orders: number
  lowStock: number
  products: number
  mpesa: number
  expenses: number
}

export function sumStationDays(rows: StationDay[]): StationDay {
  return rows.reduce<StationDay>(
    (sum, row) => ({
      id: 'all',
      name: 'All stations',
      kind: 'catha',
      active: true,
      sales: sum.sales + row.sales,
      paidOrders: sum.paidOrders + row.paidOrders,
      openOrders: sum.openOrders + row.openOrders,
      orders: sum.orders + row.orders,
      lowStock: sum.lowStock + row.lowStock,
      products: sum.products + row.products,
      mpesa: sum.mpesa + row.mpesa,
      expenses: sum.expenses + row.expenses,
    }),
    {
      id: 'all',
      name: 'All stations',
      kind: 'catha',
      active: true,
      sales: 0,
      paidOrders: 0,
      openOrders: 0,
      orders: 0,
      lowStock: 0,
      products: 0,
      mpesa: 0,
      expenses: 0,
    },
  )
}
