'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

type Person = { id: string; name: string; email: string; role: string }

export function StationStaff({ shopId }: { shopId: string }) {
  const slug = shopId
  const [staff, setStaff] = useState<Person[]>([])

  useEffect(() => {
    fetch(`/api/station/${slug}/staff`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => setStaff(data.staff || []))
      .catch(() => {})
  }, [slug])

  return (
    <div>
      <h1 className="text-2xl font-semibold">People on this station</h1>
      <p className="mt-1 text-sm text-[#78716c]">The super admin places each person on this shop and sets the email and PIN. They still sign in at /catha.</p>
      <ul className="mt-4 space-y-2">
        {staff.map((person) => (
          <li key={person.id} className="rounded-xl border border-[#e7e0d6] bg-white px-4 py-3 text-sm">
            {person.name} · {person.email} · {person.role === 'ADMIN' ? 'Station admin' : 'Staff'}
          </li>
        ))}
        {staff.length === 0 ? <li className="text-sm text-[#78716c]">Nobody is placed on this station yet.</li> : null}
      </ul>
    </div>
  )
}

export default function Page() {
  return <StationStaff shopId={useParams<{ slug: string }>().slug} />
}
