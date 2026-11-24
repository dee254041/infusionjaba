'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

type Order = {
  id: string
  total: number
  source: string
  table: string
  paymentStatus: string
  paymentMethod: string | null
  status: string
  stockWarning?: string
  items: { name: string; quantity: number }[]
}

export default function StationOrdersPage() {
  const slug = useParams<{ slug: string }>().slug
  const [orders, setOrders] = useState<Order[]>([])
  const [error, setError] = useState('')

  const load = () => {
    fetch(`/api/station/${slug}/orders`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => setOrders(data.orders || []))
      .catch(() => {})
  }
  useEffect(load, [slug])

  const cash = async (id: string) => {
    setError('')
    const res = await fetch(`/api/station/${slug}/orders`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'cash' }),
    })
    const data = await res.json()
    if (!res.ok) setError(data.error || 'Could not mark this order paid.')
    load()
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Orders</h1>
      <p className="mt-1 text-sm text-[#78716c]">Only orders placed in this station.</p>
      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      <div className="mt-4 space-y-3">
        {orders.map((order) => (
          <article key={order.id} className="rounded-2xl border border-[#e7e0d6] bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">KES {order.total} · {order.paymentStatus}</p>
                <p className="text-sm text-[#78716c]">
                  {order.source === 'menu' ? 'Menu' : 'POS'}
                  {order.table ? ` · Table ${order.table}` : ''} · {order.paymentMethod || 'unpaid'}
                </p>
              </div>
              {order.paymentStatus !== 'PAID' && order.status !== 'cancelled' ? (
                <button className="rounded-lg border px-3 py-2 text-sm" onClick={() => cash(order.id)}>Mark cash paid</button>
              ) : null}
            </div>
            <p className="mt-2 text-sm">{order.items.map((item) => `${item.quantity} ${item.name}`).join(', ')}</p>
            {order.stockWarning ? <p className="mt-1 text-sm text-red-700">{order.stockWarning}</p> : null}
          </article>
        ))}
      </div>
    </div>
  )
}
