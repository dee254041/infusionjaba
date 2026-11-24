'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

type Person = { id: string; name: string; email: string; role: string }

export default function StationStaffPage() {
  const slug = useParams<{ slug: string }>().slug
  const [staff, setStaff] = useState<Person[]>([])
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'STAFF' })
  const [error, setError] = useState('')

  const load = () => {
    fetch(`/api/station/${slug}/staff`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => setStaff(data.staff || []))
      .catch(() => {})
  }
  useEffect(load, [slug])

  const save = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    const res = await fetch(`/api/station/${slug}/staff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Could not add staff.')
      return
    }
    setForm({ name: '', email: '', password: '', role: 'STAFF' })
    load()
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Staff</h1>
      <p className="mt-1 text-sm text-[#78716c]">These people can sign in only at /station/{slug}.</p>
      <form onSubmit={save} className="mt-4 grid gap-2 rounded-2xl border border-[#e7e0d6] bg-white p-4 sm:grid-cols-2">
        <input className="rounded-lg border px-3 py-2" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <input className="rounded-lg border px-3 py-2" placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        <input className="rounded-lg border px-3 py-2" placeholder="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        <select className="rounded-lg border px-3 py-2" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option value="STAFF">Staff</option>
          <option value="OWNER">Owner</option>
        </select>
        <button className="rounded-lg bg-[#1f3d32] px-3 py-2 text-sm text-white sm:col-span-2">Add staff</button>
        {error ? <p className="text-sm text-red-700 sm:col-span-2">{error}</p> : null}
      </form>
      <ul className="mt-4 space-y-2">
        {staff.map((person) => (
          <li key={person.id} className="rounded-xl border border-[#e7e0d6] bg-white px-4 py-3 text-sm">
            {person.name} · {person.email} · {person.role}
          </li>
        ))}
      </ul>
    </div>
  )
}
