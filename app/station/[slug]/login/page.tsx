'use client'

import { FormEvent, Suspense, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'

export default function StationLoginPage() {
  return (
    <Suspense fallback={<div className="px-4 py-16 text-center">Loading…</div>}>
      <StationLogin />
    </Suspense>
  )
}

function StationLogin() {
  const params = useParams<{ slug: string }>()
  const slug = params.slug
  const router = useRouter()
  const search = useSearchParams()
  const [email, setEmail] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/station/${slug}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, pin }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Could not sign in.')
        return
      }
      const next = search.get('callbackUrl')
      router.replace(next && next.startsWith(`/station/${slug}`) ? next : `/station/${slug}`)
    } catch {
      setError('Could not sign in.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f6f3ee] px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-[#e7e0d6] bg-white p-6 shadow-sm">
        <p className="text-xs uppercase tracking-[0.16em] text-[#8a7560]">Station sign in</p>
        <h1 className="mt-2 text-2xl font-semibold text-[#1c1917]">{slug}</h1>
        <p className="mt-1 text-sm text-[#78716c]">Use the email and 4-digit PIN the super admin set for this station.</p>
        <label className="mt-5 block text-sm font-medium">Email</label>
        <input className="mt-1 w-full rounded-lg border border-[#e7e0d6] px-3 py-2" value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        <label className="mt-3 block text-sm font-medium">PIN</label>
        <input className="mt-1 w-full rounded-lg border border-[#e7e0d6] px-3 py-2 tracking-[0.4em]" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" autoComplete="one-time-code" placeholder="0000" required />
        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
        <button className="mt-5 w-full rounded-lg bg-[#1f3d32] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
