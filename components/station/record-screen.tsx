'use client'

import { FormEvent, useEffect, useState } from 'react'

type RecordRow = { id: string; title: string; detail: string; amount: number }

export function RecordScreen({
  slug,
  kind,
  title,
  amountLabel,
}: {
  slug: string
  kind: 'expenses' | 'clients' | 'suppliers'
  title: string
  amountLabel?: string
}) {
  const [rows, setRows] = useState<RecordRow[]>([])
  const [form, setForm] = useState({ title: '', detail: '', amount: '' })
  const [error, setError] = useState('')

  const load = () => {
    fetch(`/api/station/${slug}/records?kind=${kind}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => setRows(data.records || []))
      .catch(() => {})
  }
  useEffect(load, [slug, kind])

  const save = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    const res = await fetch(`/api/station/${slug}/records?kind=${kind}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, amount: Number(form.amount || 0) }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Could not save.')
      return
    }
    setRows(data.records || [])
    setForm({ title: '', detail: '', amount: '' })
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-1 text-sm text-[#78716c]">Kept only for this station.</p>
      <form onSubmit={save} className="mt-4 grid gap-2 rounded-2xl border border-[#e7e0d6] bg-white p-4 sm:grid-cols-4">
        <input className="rounded-lg border px-3 py-2" placeholder="Name" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        <input className="rounded-lg border px-3 py-2" placeholder="Note" value={form.detail} onChange={(e) => setForm({ ...form, detail: e.target.value })} />
        {amountLabel ? (
          <input className="rounded-lg border px-3 py-2" placeholder={amountLabel} type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        ) : <span />}
        <button className="rounded-lg bg-[#1f3d32] px-3 py-2 text-sm text-white">Save</button>
        {error ? <p className="text-sm text-red-700 sm:col-span-4">{error}</p> : null}
      </form>
      <ul className="mt-4 space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="rounded-xl border border-[#e7e0d6] bg-white px-4 py-3 text-sm">
            <span className="font-medium">{row.title}</span>
            {amountLabel ? ` · KES ${row.amount}` : ''} {row.detail ? `· ${row.detail}` : ''}
          </li>
        ))}
      </ul>
    </div>
  )
}
