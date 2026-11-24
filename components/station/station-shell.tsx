'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

const LINKS = [
  { href: '', label: 'Dashboard', owner: false },
  { href: '/pos', label: 'POS', owner: false },
  { href: '/orders', label: 'Orders', owner: false },
  { href: '/inventory', label: 'Inventory', owner: false },
  { href: '/tables', label: 'Tables & QR', owner: false },
  { href: '/payments', label: 'M-Pesa', owner: false },
  { href: '/staff', label: 'Staff', owner: true },
  { href: '/expenses', label: 'Expenses', owner: true },
  { href: '/clients', label: 'Clients', owner: true },
  { href: '/suppliers', label: 'Suppliers', owner: true },
]

export function StationShell({ slug, children }: { slug: string; children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [shopName, setShopName] = useState(slug)
  const [role, setRole] = useState<'OWNER' | 'STAFF' | ''>('')

  useEffect(() => {
    let cancelled = false
    fetch(`/api/station/${slug}/summary`, { cache: 'no-store' })
      .then(async (res) => {
        if (res.status === 401) {
          router.replace(`/station/${slug}/login`)
          return null
        }
        return res.json()
      })
      .then((data) => {
        if (cancelled || !data?.shop) return
        setShopName(data.shop.name || slug)
        setRole(data.me?.role === 'OWNER' ? 'OWNER' : 'STAFF')
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [slug, router])

  const logout = async () => {
    await fetch(`/api/station/${slug}/logout`, { method: 'POST' })
    router.replace(`/station/${slug}/login`)
  }

  return (
    <div className="min-h-screen bg-[#f6f3ee] text-[#1c1917] md:grid md:grid-cols-[240px_1fr]">
      <aside className="border-b border-[#e7e0d6] bg-[#1f3d32] text-[#f6f1e7] md:min-h-screen md:border-b-0 md:border-r">
        <div className="px-5 py-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#d7c4a3]">Station</p>
          <h1 className="mt-1 text-lg font-semibold">{shopName}</h1>
          <a className="mt-2 inline-block text-xs text-[#d7c4a3] underline" href={`/menu/${slug}`} target="_blank" rel="noreferrer">
            Open this shop&apos;s menu
          </a>
        </div>
        <nav className="flex gap-2 overflow-x-auto px-3 pb-3 md:block md:space-y-1 md:px-3">
          {LINKS.filter((link) => !link.owner || role === 'OWNER').map((link) => {
            const href = `/station/${slug}${link.href}`
            const active = pathname === href
            return (
              <Link
                key={href}
                prefetch={false}
                href={href}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm ${active ? 'bg-white text-[#1f3d32]' : 'text-[#f6f1e7]/90 hover:bg-white/10'}`}
              >
                {link.label}
              </Link>
            )
          })}
        </nav>
        <button type="button" onClick={logout} className="m-3 rounded-lg px-3 py-2 text-sm text-[#f6f1e7]/80 hover:bg-white/10">
          Sign out
        </button>
      </aside>
      <main className="min-w-0 px-4 py-6 sm:px-8">{children}</main>
    </div>
  )
}
