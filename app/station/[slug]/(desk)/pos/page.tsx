'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'

type Product = { id: string; name: string; price: number; stock: number; category: string }
type Line = Product & { quantity: number }

export function StationPos({ shopId }: { shopId: string }) {
  const slug = shopId
  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<Line[]>([])
  const [phone, setPhone] = useState('')
  const [table, setTable] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => {
    fetch(`/api/station/${slug}/products`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => setProducts((data.products || []).filter((product: Product) => product.stock > 0)))
      .catch(() => {})
  }
  useEffect(load, [slug])

  const total = useMemo(() => cart.reduce((sum, line) => sum + line.price * line.quantity, 0), [cart])

  const add = (product: Product) => {
    setCart((prev) => {
      const found = prev.find((line) => line.id === product.id)
      if (found) {
        if (found.quantity >= product.stock) return prev
        return prev.map((line) => (line.id === product.id ? { ...line, quantity: line.quantity + 1 } : line))
      }
      return [...prev, { ...product, quantity: 1 }]
    })
  }

  const sell = async (paymentMethod: 'cash' | 'mpesa') => {
    if (!cart.length) return
    setBusy(true)
    setMessage('')
    try {
      const created = await fetch(`/api/station/${slug}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentMethod,
          table,
          customerPhone: phone,
          items: cart.map((line) => ({ productId: line.id, quantity: line.quantity })),
        }),
      })
      const data = await created.json()
      if (!created.ok) {
        setMessage(data.error || 'Could not save the order.')
        return
      }
      if (paymentMethod === 'cash') {
        setCart([])
        setMessage(`Cash sale saved. ${data.order.id}`)
        load()
        return
      }
      const pay = await fetch('/api/mpesa/stk-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: phone,
          amount: data.order.total,
          accountReference: data.order.id,
          transactionDesc: `${slug} POS`,
        }),
      })
      const payData = await pay.json()
      if (!pay.ok || !payData.success) {
        setMessage(payData.error || 'M-Pesa prompt was not sent. The order is still open.')
        return
      }
      setMessage('M-Pesa prompt sent. Waiting for payment…')
      const orderId = data.order.id as string
      for (let i = 0; i < 20; i++) {
        await new Promise((resolve) => setTimeout(resolve, 3000))
        const check = await fetch(`/api/station/${slug}/orders?id=${encodeURIComponent(orderId)}`, { cache: 'no-store' })
        const checkData = await check.json()
        if (checkData.order?.paymentStatus === 'PAID') {
          setCart([])
          setMessage(`Paid. Receipt ${checkData.order.mpesaReceiptNumber || orderId}`)
          load()
          return
        }
      }
      setMessage('The prompt was sent. If the customer pays, it will show under Orders.')
    } catch {
      setMessage('Could not complete the sale.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        <h1 className="text-2xl font-semibold">POS</h1>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {products.map((product) => (
            <button key={product.id} type="button" onClick={() => add(product)} className="rounded-2xl border border-[#e7e0d6] bg-white p-4 text-left">
              <p className="text-xs text-[#8a7560]">{product.category}</p>
              <p className="mt-1 font-medium">{product.name}</p>
              <p className="mt-2 text-sm">KES {product.price} · {product.stock} left</p>
            </button>
          ))}
        </div>
      </div>
      <aside className="h-fit rounded-2xl border border-[#e7e0d6] bg-white p-4">
        <h2 className="font-semibold">This sale</h2>
        <div className="mt-3 space-y-2">
          {cart.map((line) => (
            <div key={line.id} className="flex justify-between text-sm">
              <span>{line.name} × {line.quantity}</span>
              <span>KES {line.price * line.quantity}</span>
            </div>
          ))}
          {cart.length === 0 ? <p className="text-sm text-[#78716c]">Tap a product.</p> : null}
        </div>
        <p className="mt-4 text-lg font-semibold">KES {total}</p>
        <input className="mt-3 w-full rounded-lg border px-3 py-2 text-sm" placeholder="Table" value={table} onChange={(e) => setTable(e.target.value)} />
        <input className="mt-2 w-full rounded-lg border px-3 py-2 text-sm" placeholder="M-Pesa phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button className="rounded-lg border px-3 py-2 text-sm" disabled={busy} onClick={() => sell('cash')}>Cash</button>
          <button className="rounded-lg bg-[#1f3d32] px-3 py-2 text-sm text-white" disabled={busy} onClick={() => sell('mpesa')}>M-Pesa</button>
        </div>
        {message ? <p className="mt-3 text-sm">{message}</p> : null}
      </aside>
    </div>
  )
}

export default function Page() {
  return <StationPos shopId={useParams<{ slug: string }>().slug} />
}
