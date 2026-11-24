'use client'

import { useEffect, useState } from 'react'
import type { StationDay } from '@/lib/station/overview-math'

function todayNairobi(): string {
  const nairobi = new Date(Date.now() + 3 * 60 * 60 * 1000)
  const y = nairobi.getUTCFullYear()
  const m = String(nairobi.getUTCMonth() + 1).padStart(2, '0')
  const d = String(nairobi.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function kes(amount: number) {
  return `KES ${amount.toLocaleString('en-KE')}`
}

export function NetworkOverview({ title }: { title: string }) {
  const [date, setDate] = useState(todayNairobi)
  const [overall, setOverall] = useState<StationDay | null>(null)
  const [rows, setRows] = useState<StationDay[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setError('')
    fetch(`/api/catha/stations/overview?date=${encodeURIComponent(date)}`, { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Could not load stations')
        return data
      })
      .then((data) => {
        if (cancelled) return
        setOverall(data.overall)
        setRows(data.rows || [])
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load stations')
      })
    return () => {
      cancelled = true
    }
  }, [date])

  return (
    <section id="stations-network" className="rounded-2xl border bg-card p-4 sm:p-5 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Super admin</p>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">Catha and every station, separate, with the combined total.</p>
        </div>
        <input className="rounded-lg border bg-background px-3 py-2 text-sm" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {overall ? (
        <div className="grid gap-2 sm:grid-cols-4">
          <Metric label="All sales" value={kes(overall.sales)} />
          <Metric label="Paid orders" value={String(overall.paidOrders)} />
          <Metric label="Still open" value={String(overall.openOrders)} />
          <Metric label="M-Pesa received" value={kes(overall.mpesa)} />
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-2 pr-3">Station</th>
              <th className="py-2 pr-3">Sales</th>
              <th className="py-2 pr-3">Paid</th>
              <th className="py-2 pr-3">Open</th>
              <th className="py-2 pr-3">M-Pesa</th>
              <th className="py-2 pr-3">Expenses</th>
              <th className="py-2 pr-3">Low stock</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="py-3 pr-3">
                  <div className="font-medium">{row.name}</div>
                  <div className="text-xs text-muted-foreground">{row.active ? `${row.products} products` : 'Paused'}</div>
                </td>
                <td className="py-3 pr-3">{kes(row.sales)}</td>
                <td className="py-3 pr-3">{row.paidOrders}</td>
                <td className="py-3 pr-3">{row.openOrders}</td>
                <td className="py-3 pr-3">{kes(row.mpesa)}</td>
                <td className="py-3 pr-3">{kes(row.expenses)}</td>
                <td className="py-3 pr-3">{row.lowStock}</td>
                <td className="py-3 text-right">
                  <button
                    type="button"
                    className="text-primary underline"
                    onClick={async () => {
                      await fetch('/api/catha/shop-context', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: row.id }),
                      })
                      window.location.href = '/catha'
                    }}
                  >
                    Open
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-background px-3 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  )
}
