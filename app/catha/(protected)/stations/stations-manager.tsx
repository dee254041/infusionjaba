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
  adminName: '',
  adminEmail: '',
  adminPin: '',
}

type Assignment = { shopId: string; role: 'ADMIN' | 'STAFF' }
type Person = { id: string; name: string; email: string; assignments: Assignment[] }

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
        You are the one super admin for every shop. Each shop has its own name and id, and its own orders, stock, and menu. Everyone still uses /catha. Payments stay on the same M-Pesa till.
      </p>

      <form onSubmit={submit} className="mt-6 grid gap-4 rounded-2xl border bg-card p-5 sm:grid-cols-2">
        <Field label="Shop name" value={form.name} onChange={(value) => set('name', value)} placeholder="Westlands Bar" />
        <Field label="Shop id" value={form.slug} onChange={(value) => set('slug', value)} placeholder="westlands-bar" />
        <Field label="Phone" value={form.phone} onChange={(value) => set('phone', value)} placeholder="0712 000 000" />
        <Field label="Location" value={form.location} onChange={(value) => set('location', value)} placeholder="Westlands, Nairobi" />
        <Field label="Station admin name" value={form.adminName} onChange={(value) => set('adminName', value)} placeholder="Asha" />
        <Field label="Station admin email" value={form.adminEmail} onChange={(value) => set('adminEmail', value)} placeholder="asha@shop.com" type="email" />
        <Field label="Station admin PIN" value={form.adminPin} onChange={(value) => set('adminPin', value.replace(/\D/g, '').slice(0, 4))} placeholder="4 digits" />
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
                Id {shop.slug}
                {shop.location ? ` · ${shop.location}` : ''}
                {' · '}menu /catha/menu?id={shop.slug}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                className="rounded-lg border px-3 py-2 text-sm"
                onClick={async () => {
                  await fetch('/api/catha/shop-context', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: shop.slug }),
                  })
                  window.location.href = '/catha'
                }}
              >
                Work in this shop
              </button>
              <button className="rounded-lg border px-3 py-2 text-sm" onClick={() => toggle(shop)}>
                {shop.active ? 'Pause shop' : 'Resume shop'}
              </button>
            </div>
          </article>
        ))}
      </div>

      <PeopleBoard shops={shops} />
    </div>
  )
}

function PeopleBoard({ shops }: { shops: Shop[] }) {
  const [people, setPeople] = useState<Person[]>([])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [pin, setPin] = useState('')
  const [roles, setRoles] = useState<Record<string, '' | 'ADMIN' | 'STAFF'>>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const res = await fetch('/api/catha/stations/people', { cache: 'no-store' })
    const data = await res.json()
    if (res.ok) setPeople(data.people || [])
  }

  useEffect(() => {
    load().catch(() => {})
  }, [])

  const edit = (person: Person) => {
    setName(person.name)
    setEmail(person.email)
    setPin('')
    const next: Record<string, '' | 'ADMIN' | 'STAFF'> = {}
    for (const shop of shops) {
      const found = person.assignments.find((item) => item.shopId === shop.slug)
      next[shop.slug] = found?.role || ''
    }
    setRoles(next)
  }

  const save = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    const assignments = Object.entries(roles)
      .filter(([, role]) => role === 'ADMIN' || role === 'STAFF')
      .map(([shopId, role]) => ({ shopId, role }))
    try {
      const res = await fetch('/api/catha/stations/people', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, pin: pin || undefined, assignments }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Could not save this person.')
        return
      }
      setPeople(data.people || [])
      setName('')
      setEmail('')
      setPin('')
      setRoles({})
    } catch {
      setError('Could not save this person.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold">Place people</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        One email and one PIN. Choose Admin or Staff on each station. Leave a station blank and they cannot sign in there. The same person can be on one station or several.
      </p>
      <form onSubmit={save} className="mt-4 space-y-3 rounded-2xl border bg-card p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Name" value={name} onChange={setName} placeholder="Brian" />
          <Field label="Email" value={email} onChange={setEmail} placeholder="brian@shop.com" type="email" />
          <Field label="PIN" value={pin} onChange={(value) => setPin(value.replace(/\D/g, '').slice(0, 4))} placeholder="4 digits, blank keeps the old PIN" required={false} />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {shops.map((shop) => (
            <label key={shop.slug} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
              <span>{shop.name}</span>
              <select
                className="rounded-md border bg-background px-2 py-1"
                value={roles[shop.slug] || ''}
                onChange={(event) => setRoles((prev) => ({ ...prev, [shop.slug]: event.target.value as '' | 'ADMIN' | 'STAFF' }))}
              >
                <option value="">Not on this station</option>
                <option value="ADMIN">Admin</option>
                <option value="STAFF">Staff</option>
              </select>
            </label>
          ))}
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60" disabled={busy}>
          {busy ? 'Saving…' : 'Save placement'}
        </button>
      </form>
      <ul className="mt-4 space-y-2">
        {people.map((person) => (
          <li key={person.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-4 py-3 text-sm">
            <span>
              <span className="font-medium">{person.name}</span> · {person.email}
              <span className="block text-muted-foreground">
                {person.assignments.length
                  ? person.assignments.map((item) => `${item.shopId} (${item.role === 'ADMIN' ? 'admin' : 'staff'})`).join(', ')
                  : 'Not placed on a station'}
              </span>
            </span>
            <button type="button" className="rounded-lg border px-3 py-2" onClick={() => edit(person)}>Edit</button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  required,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  type?: string
  required?: boolean
}) {
  const mustFill = required ?? (label !== 'Phone' && label !== 'Location')
  return (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      <input
        className="mt-1 w-full rounded-lg border bg-background px-3 py-2"
        value={value}
        placeholder={placeholder}
        type={type}
        inputMode={label.includes('PIN') ? 'numeric' : undefined}
        onChange={(event) => onChange(event.target.value)}
        required={mustFill}
      />
    </label>
  )
}
