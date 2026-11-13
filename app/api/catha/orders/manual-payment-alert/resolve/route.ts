import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/mongodb'
import { auth } from '@/lib/auth-catha'
import {
  canApproveManualMpesaVerifications,
  normalizePermissions,
} from '@/lib/catha-permissions-model'
import { resolveRejectedManualPaymentAlert } from '@/lib/catha-manual-mpesa-verification'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const role = (session.user as { role?: string }).role
  const perms = normalizePermissions((session.user as { permissions?: unknown }).permissions)
  if (!canApproveManualMpesaVerifications(perms, role)) {
    return NextResponse.json({ error: 'Only an admin can resolve this.' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const orderId = String(body?.orderId || '').trim()
  const db = await getDatabase('infusion_jaba')
  const result = await resolveRejectedManualPaymentAlert(db, orderId)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ success: true })
}
