'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

type Table = { id: string; name: string }

export default function StationTablesPage() {
  const slug = useParams<{ slug: string }>().slug
  const [tables, setTables] = useState<Table[]>([])
  const [name, setName] = useState('')
  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  const load = () => {
    fetch(`/api/station/${slug}/tables`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => setTables(data.tables || []))
      .catch(() => {})
  }
  useEffect(load, [slug])

  const add = async () => {
    await fetch(`/api/station/${slug}/tables`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    setName('')
    load()
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Tables and QR</h1>
      <p className="mt-1 text-sm text-[#78716c]">Each code opens /menu/{slug} for this station only.</p>
      <div className="mt-4 flex gap-2">
        <input className="rounded-lg border px-3 py-2" placeholder="Table name" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="rounded-lg bg-[#1f3d32] px-4 py-2 text-sm text-white" onClick={add}>Add table</button>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tables.map((table) => {
          const url = `${origin}/menu/${slug}?t=${encodeURIComponent(table.id)}`
          return (
            <article key={table.id} className="rounded-2xl border border-[#e7e0d6] bg-white p-4 text-center">
              <p className="font-medium">{table.name}</p>
              <img className="mx-auto mt-3" alt={`QR for ${table.name}`} src={`/api/qr?size=220&url=${encodeURIComponent(url)}`} />
              <p className="mt-2 break-all text-xs text-[#78716c]">{url}</p>
            </article>
          )
        })}
      </div>
    </div>
  )
}
