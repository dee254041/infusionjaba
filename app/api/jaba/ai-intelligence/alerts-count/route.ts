import { NextResponse } from 'next/server'
import clientPromise from '@/lib/mongodb'
import { requireJabaSuperAdmin } from '@/lib/jaba-ai-auth'
import { findDistributorsWithoutRecentStock } from '@/lib/jaba-distributor-restock-alerts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Lightweight badge count for super-admin sidebar (plant ops signals).
 */
export async function GET() {
  const auth = await requireJabaSuperAdmin()
  if ('response' in auth) return auth.response

  try {
    const client = await clientPromise
    const db = client.db('infusion_jaba')

    const [rawMaterials, batches, distributors, deliveryNotes] = await Promise.all([
      db.collection('jaba_rawMaterials').find({}).project({ currentStock: 1, minStock: 1 }).toArray(),
      db.collection('jaba_batches').find({}).project({ status: 1 }).toArray(),
      db.collection('jaba_distributors').find({}).project({ name: 1, phone: 1, region: 1, createdAt: 1 }).toArray(),
      db.collection('jaba_deliveryNotes').find({}).project({ distributorId: 1, distributorName: 1, date: 1, createdAt: 1 }).toArray(),
    ])

    const lowStock = rawMaterials.filter((rm: any) => {
      const c = parseFloat(rm.currentStock) || 0
      const m = parseFloat(rm.minStock) || 0
      return c <= m
    }).length

    const packagingBacklog = batches.filter((b: any) => b.status === 'QC Pending').length

    let criticalCount = 0
    if (lowStock > 0) criticalCount++
    if (packagingBacklog >= 5) criticalCount++
    if (lowStock > 3) criticalCount++
    const quietDistributors = findDistributorsWithoutRecentStock(
      distributors as Record<string, unknown>[],
      deliveryNotes as Record<string, unknown>[]
    ).length
    if (quietDistributors > 0) criticalCount += Math.min(quietDistributors, 20)

    return NextResponse.json({ count: Math.min(99, criticalCount) })
  } catch {
    return NextResponse.json({ count: 0 })
  }
}
