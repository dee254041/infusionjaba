'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

type Product = { id: string; name: string; category: string; price: number; stock: number; visible: boolean }

export default function StationInventoryPage() {
  const slug = useParams<{ slug: string }>().slug
  const [products, setProducts] = useState<Product[]>([])
  const [form, setForm] = useState({ name: '', category: 'General', price: '', stock: '' })
  const [error, setError] = useState('')

  const load = () => {
    fetch(`/api/station/${slug}/products`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => setProducts(data.products || []))
      .catch(() => {})
  }
  useEffect(load, [slug])

  const save = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    const res = await fetch(`/api/station/${slug}/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, price: Number(form.price), stock: Number(form.stock) }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Could not save the product.')
      return
    }
    setForm({ name: '', category: 'General', price: '', stock: '' })
    load()
  }

  const updateStock = async (product: Product, stock: number) => {
    await fetch(`/api/station/${slug}/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...product, stock }),
    })
    load()
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Inventory</h1>
      <p className="mt-1 text-sm text-[#78716c]">Products here are not in the Catha catalogue.</p>
      <form onSubmit={save} className="mt-4 grid gap-2 rounded-2xl border border-[#e7e0d6] bg-white p-4 sm:grid-cols-5">
        <input className="rounded-lg border px-3 py-2" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <input className="rounded-lg border px-3 py-2" placeholder="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
        <input className="rounded-lg border px-3 py-2" placeholder="Price" type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
        <input className="rounded-lg border px-3 py-2" placeholder="Stock" type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} required />
        <button className="rounded-lg bg-[#1f3d32] px-3 py-2 text-sm text-white">Add product</button>
        {error ? <p className="text-sm text-red-700 sm:col-span-5">{error}</p> : null}
      </form>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-[#e7e0d6] bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b text-[#8a7560]">
            <tr><th className="px-4 py-3">Product</th><th>Price</th><th>Stock</th><th></th></tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id} className="border-b last:border-0">
                <td className="px-4 py-3">{product.name}<div className="text-xs text-[#8a7560]">{product.category}</div></td>
                <td>KES {product.price}</td>
                <td>{product.stock}</td>
                <td className="pr-4 text-right">
                  <button className="mr-2" onClick={() => updateStock(product, product.stock + 1)}>+1</button>
                  <button onClick={() => updateStock(product, Math.max(0, product.stock - 1))}>-1</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
