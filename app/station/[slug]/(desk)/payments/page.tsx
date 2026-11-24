'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

type Payment = { id: string; amount: number; phone: string; receipt: string; status: string; reference: string }

export function StationPayments({ shopId }: { shopId: string }) {
  const slug = shopId
  const [payments, setPayments] = useState<Payment[]>([])

  useEffect(() => {
    fetch(`/api/station/${slug}/payments`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => setPayments(data.payments || []))
      .catch(() => {})
  }, [slug])

  return (
    <div>
      <h1 className="text-2xl font-semibold">M-Pesa</h1>
      <p className="mt-1 text-sm text-[#78716c]">Same till as the rest of the site. This list is only this station.</p>
      <div className="mt-4 space-y-2">
        {payments.map((payment) => (
          <article key={payment.id} className="rounded-xl border border-[#e7e0d6] bg-white px-4 py-3 text-sm">
            <p className="font-medium">KES {payment.amount} · {payment.status}</p>
            <p className="text-[#78716c]">{payment.phone} {payment.receipt ? `· ${payment.receipt}` : ''}</p>
          </article>
        ))}
        {payments.length === 0 ? <p className="text-sm text-[#78716c]">No M-Pesa prompts for this station yet.</p> : null}
      </div>
    </div>
  )
}

export default function Page() {
  return <StationPayments shopId={useParams<{ slug: string }>().slug} />
}
