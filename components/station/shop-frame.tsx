'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { StationClients } from '@/app/station/[slug]/(desk)/clients/page'
import { StationExpenses } from '@/app/station/[slug]/(desk)/expenses/page'
import { StationHome } from '@/app/station/[slug]/(desk)/page'
import { StationInventory } from '@/app/station/[slug]/(desk)/inventory/page'
import { StationOrders } from '@/app/station/[slug]/(desk)/orders/page'
import { StationPayments } from '@/app/station/[slug]/(desk)/payments/page'
import { StationPos } from '@/app/station/[slug]/(desk)/pos/page'
import { StationStaff } from '@/app/station/[slug]/(desk)/staff/page'
import { StationSuppliers } from '@/app/station/[slug]/(desk)/suppliers/page'
import { StationTables } from '@/app/station/[slug]/(desk)/tables/page'
import { NetworkOverview } from '@/components/station/network-overview'

type Shop = { id: string; name: string }
type Context = { shop: Shop; shops: Shop[]; role: string }

function screenFor(path: string, shopId: string) {
  if (path.startsWith('/catha/pos')) return <StationPos shopId={shopId} />
  if (path.startsWith('/catha/orders')) return <StationOrders shopId={shopId} />
  if (path.startsWith('/catha/inventory')) return <StationInventory shopId={shopId} />
  if (path.startsWith('/catha/qr-tables') || path.startsWith('/catha/tables')) return <StationTables shopId={shopId} />
  if (path.startsWith('/catha/expenses')) return <StationExpenses shopId={shopId} />
  if (path.startsWith('/catha/clients')) return <StationClients shopId={shopId} />
  if (path.startsWith('/catha/suppliers')) return <StationSuppliers shopId={shopId} />
  if (path.startsWith('/catha/mpesa')) return <StationPayments shopId={shopId} />
  if (path.startsWith('/catha/users')) return <StationStaff shopId={shopId} />
  if (path === '/catha') return <StationHome shopId={shopId} />
  return null
}

export function ShopFrame({ children }: { children: React.ReactNode }) {
  const path = usePathname() || '/catha'
  const router = useRouter()
  const [context, setContext] = useState<Context | null>(null)

  const load = () => {
    fetch('/api/catha/shop-context', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data?.shop) setContext(data)
        else setContext({ shop: { id: 'catha', name: 'Catha Lounge' }, shops: [], role: 'STAFF' })
      })
      .catch(() => setContext({ shop: { id: 'catha', name: 'Catha Lounge' }, shops: [], role: 'STAFF' }))
  }

  useEffect(load, [path])

  const choose = async (id: string) => {
    await fetch('/api/catha/shop-context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    router.push('/catha')
    router.refresh()
    load()
  }

  if (!context) return <div className="p-8 text-sm text-muted-foreground">Loading shop…</div>

  const stationScreen = context.shop.id === 'catha' ? null : screenFor(path, context.shop.id)
  const showAllStores = context.role === 'SUPER' || context.role === 'ADMIN'
  const keepCathaPage =
    path.startsWith('/catha/stations') ||
    path.startsWith('/catha/ai-intelligence') ||
    path.startsWith('/catha/finance')

  return (
    <div>
      {context.shops.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2 border-b bg-card px-4 py-2 text-sm">
          <span className="text-muted-foreground">Shop</span>
          <select
            className="rounded-md border bg-background px-2 py-1"
            value={context.shop.id}
            onChange={(event) => choose(event.target.value)}
          >
            {context.shops.map((shop) => (
              <option key={shop.id} value={shop.id}>{shop.name}</option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">Same /catha pages. The id keeps this shop separate.</span>
        </div>
      ) : null}
      {context.shop.id !== 'catha' && showAllStores && path === '/catha' ? (
        <div className="px-4 pt-4">
          <NetworkOverview title="All stores" />
        </div>
      ) : null}
      {stationScreen && !keepCathaPage
        ? stationScreen
        : context.shop.id !== 'catha' && !keepCathaPage && context.role === 'STAFF'
          ? <StationHome shopId={context.shop.id} />
          : children}
    </div>
  )
}
