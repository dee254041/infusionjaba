'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

export default function StationHomePage() {
  const slug = useParams<{ slug: string }>().slug
  const [data, setData] = useState<{ shop?: { name: string; location: string }; summary?: { sales: number; paidOrders: number; products: number; openOrders: number } } | null>(null)

  useEffect(() => {
    fetch(`/api/station/${slug}/summary`, { cache: 'no-store' })
      .then((res) => res.json())
      .then(setData)
      .catch(() => {})
  }, [slug])

  const summary = data?.summary
  return (
    <div>
      <h1 className="text-2xl font-semibold">{data?.shop?.name || 'Dashboard'}</h1>
      <p className="mt-1 text-sm text-[#78716c]">{data?.shop?.location || 'Today in this station only.'}</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-4">
        <Stat label="Paid sales today" value={`KES ${summary?.sales ?? 0}`} />
        <Stat label="Paid orders" value={String(summary?.paidOrders ?? 0)} />
        <Stat label="Open orders" value={String(summary?.openOrders ?? 0)} />
        <Stat label="Products" value={String(summary?.products ?? 0)} />
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#e7e0d6] bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-[#8a7560]">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  )
}
