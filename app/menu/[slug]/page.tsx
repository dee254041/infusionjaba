'use client'

import { FormEvent, Suspense, useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'

type Product = { id: string; name: string; price: number; category: string }
type Line = Product & { quantity: number }

export default function StationMenuPage() {
  return (
    <Suspense fallback={<div className="px-4 py-16 text-center">Loading menu…</div>}>
      <StationMenu />
    </Suspense>
  )
}

function StationMenu() {
  const slug = useParams<{ slug: string }>().slug
  const table = useSearchParams().get('t') || ''
  const [shop, setShop] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<Line[]>([])
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    fetch(`/api/menu/${slug}/catalog`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) {
          setMissing(true)
          return null
        }
        return res.json()
      })
      .then((data) => {
        if (!data) return
        setShop(data.shop?.name || slug)
        setProducts(data.products || [])
      })
      .catch(() => setMissing(true))
  }, [slug])

  const total = useMemo(() => cart.reduce((sum, line) => sum + line.price * line.quantity, 0), [cart])

  const add = (product: Product) => {
    setCart((prev) => {
      const found = prev.find((line) => line.id === product.id)
      if (found) return prev.map((line) => (line.id === product.id ? { ...line, quantity: line.quantity + 1 } : line))
      return [...prev, { ...product, quantity: 1 }]
    })
  }

  const pay = async (event: FormEvent) => {
    event.preventDefault()
    setMessage('')
    const created = await fetch(`/api/menu/${slug}/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table,
        phone,
        items: cart.map((line) => ({ productId: line.id, quantity: line.quantity })),
      }),
    })
    const data = await created.json()
    if (!created.ok) {
      setMessage(data.error || 'Could not start the order.')
      return
    }
    const stk = await fetch('/api/mpesa/stk-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phoneNumber: phone,
        amount: data.order.total,
        accountReference: data.order.id,
        transactionDesc: `${slug} menu`,
      }),
    })
    const stkData = await stk.json()
    if (!stk.ok || !stkData.success) {
      setMessage(stkData.error || 'M-Pesa prompt was not sent.')
      return
    }
    setMessage('Check your phone and enter your M-Pesa PIN.')
    for (let i = 0; i < 20; i++) {
      await new Promise((resolve) => setTimeout(resolve, 3000))
      const check = await fetch(`/api/menu/${slug}/order?id=${encodeURIComponent(data.order.id)}`, { cache: 'no-store' })
      const checkData = await check.json()
      if (checkData.order?.paymentStatus === 'PAID') {
        setCart([])
        setMessage('Payment received. The station has your order.')
        return
      }
    }
  }

  if (missing) {
    return <div className="mx-auto max-w-lg px-4 py-16 text-center">This menu is not available.</div>
  }

  return (
    <div className="mx-auto min-h-screen max-w-lg px-4 py-6">
      <p className="text-xs uppercase tracking-[0.16em] text-[#8a7560]">{table ? `Table ${table}` : 'Menu'}</p>
      <h1 className="mt-1 text-3xl font-semibold">{shop || 'Menu'}</h1>
      <div className="mt-5 space-y-2">
        {products.map((product) => (
          <button key={product.id} type="button" onClick={() => add(product)} className="flex w-full items-center justify-between rounded-2xl border border-[#e7e0d6] bg-white px-4 py-3 text-left">
            <span>
              <span className="block text-xs text-[#8a7560]">{product.category}</span>
              <span className="font-medium">{product.name}</span>
            </span>
            <span>KES {product.price}</span>
          </button>
        ))}
      </div>
      <form onSubmit={pay} className="mt-6 rounded-2xl border border-[#e7e0d6] bg-white p-4">
        {cart.map((line) => (
          <p key={line.id} className="flex justify-between text-sm">
            <span>{line.name} × {line.quantity}</span>
            <span>KES {line.price * line.quantity}</span>
          </p>
        ))}
        <p className="mt-3 font-semibold">KES {total}</p>
        <input className="mt-3 w-full rounded-lg border px-3 py-2" placeholder="M-Pesa phone" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        <button className="mt-3 w-full rounded-lg bg-[#1f3d32] px-4 py-2.5 text-sm text-white" disabled={!cart.length}>
          Pay with M-Pesa
        </button>
        {message ? <p className="mt-3 text-sm">{message}</p> : null}
      </form>
    </div>
  )
}
