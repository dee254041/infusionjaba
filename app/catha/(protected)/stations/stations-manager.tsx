'use client'

import { FormEvent, useEffect, useState } from 'react'

type Shop = {
  slug: string
  name: string
  phone: string
  location: string
  active: boolean
  createdAt: string | null
}

const empty = {
  name: '',
  slug: '',
  phone: '',
  location: '',
  ownerName: '',
  ownerEmail: '',
  ownerPassword: '',
}

export function StationsManager() {
  const [shops, setShops] = useState<Shop[]>([])
  const [form, setForm] = useState(empty)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const res = await fetch('/api/catha/stations', { cache: 'no-store' })
    const data = await res.json()
    if (res.ok) setShops(data.shops || [])
  }

  useEffect(() => {
    load().catch(() => {})
  }, [])

  const set = (key: keyof typeof empty, value: string) => setForm((prev) => ({ ...prev, [key]: value }))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/catha/stations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Could not create the shop.')
        return
      }
      setForm(empty)
      await load()
    } catch {
      setError('Could not create the shop.')
    } finally {
      setBusy(false)
    }
  }

  const toggle = async (shop: Shop) => {
    await fetch('/api/catha/stations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: shop.slug, active: !shop.active }),
    })
    await load()
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Super admin</p>
      <h1 className="mt-1 text-3xl font-semibold">New station</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Each station gets its own POS, orders, inventory, staff, menu, and table QR codes. Nothing is shared with Catha or with another station. Payments still use this site&apos;s existing M-Pesa till.
      </p>

      <form onSubmit={submit} className="mt-6 grid gap-4 rounded-2xl border bg-card p-5 sm:grid-cols-2">
        <Field label="Shop name" value={form.name} onChange={(value) => set('name', value)} placeholder="Westlands Bar" />
        <Field label="Address in the URL" value={form.slug} onChange={(value) => set('slug', value)} placeholder="westlands-bar" />
        <Field label="Phone" value={form.phone} onChange={(value) => set('phone', value)} placeholder="0712 000 000" />
        <Field label="Location" value={form.location} onChange={(value) => set('location', value)} placeholder="Westlands, Nairobi" />
        <Field label="Owner name" value={form.ownerName} onChange={(value) => set('ownerName', value)} placeholder="Asha" />
        <Field label="Owner email" value={form.ownerEmail} onChange={(value) => set('ownerEmail', value)} placeholder="asha@shop.com" type="email" />
        <Field label="Owner password" value={form.ownerPassword} onChange={(value) => set('ownerPassword', value)} placeholder="At least 8 characters" type="password" />
        <div className="flex items-end">
          <button className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60" disabled={busy}>
            {busy ? 'Creating…' : 'Create station'}
          </button>
        </div>
        {error ? <p className="text-sm text-red-600 sm:col-span-2">{error}</p> : null}
      </form>

      <div className="mt-8 space-y-3">
        {shops.length === 0 ? <p className="text-sm text-muted-foreground">No extra stations yet. Catha stays as it is.</p> : null}
        {shops.map((shop) => (
          <article key={shop.slug} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3">
            <div>
              <h2 className="font-medium">{shop.name}</h2>
              <p className="text-sm text-muted-foreground">
                /station/{shop.slug} · /menu/{shop.slug}
                {shop.location ? ` · ${shop.location}` : ''}
              </p>
            </div>
            <div className="flex gap-2">
              <a className="rounded-lg border px-3 py-2 text-sm" href={`/station/${shop.slug}/login`}>
                Open login
              </a>
              <button className="rounded-lg border px-3 py-2 text-sm" onClick={() => toggle(shop)}>
                {shop.active ? 'Pause shop' : 'Resume shop'}
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  type?: string
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      <input
        className="mt-1 w-full rounded-lg border bg-background px-3 py-2"
        value={value}
        placeholder={placeholder}
        type={type}
        onChange={(event) => onChange(event.target.value)}
        required={type !== 'text' || label !== 'Phone'}
      />
    </label>
  )
}
