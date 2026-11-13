import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/mongodb'
import { auth } from '@/lib/auth-catha'
import {
  canApproveManualMpesaVerifications,
  normalizePermissions,
} from '@/lib/catha-permissions-model'
import {
  consumeManualMpesaApprovalToken,
  getApprovalTokenPreview,
} from '@/lib/catha-manual-mpesa-approval-token'
import { queueCathaAuditLog } from '@/lib/catha-audit-log'
import { getClientIp } from '@/lib/rate-limit-simple'

async function requireApprovingAdmin() {
  const session = await auth()
  if (!session?.user?.email) {
    return { ok: false as const, status: 401, error: 'Sign in as an admin before confirming this payment.' }
  }
  const role = (session.user as { role?: string }).role
  const perms = normalizePermissions((session.user as { permissions?: unknown }).permissions)
  if (!canApproveManualMpesaVerifications(perms, role)) {
    return { ok: false as const, status: 403, error: 'Only an admin can confirm this payment.' }
  }
  const name = (session.user as { name?: string }).name || session.user.email
  const userId = (session.user as { userId?: string }).userId ?? session.user.email
  return { ok: true as const, name, userId, role: role ?? null }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const admin = await requireApprovingAdmin()
    if (!admin.ok) {
      return NextResponse.json({ error: admin.error }, { status: admin.status })
    }
    const { token } = await params
    const db = await getDatabase('infusion_jaba')
    const preview = await getApprovalTokenPreview(db, token)
    if (!preview.ok) {
      return NextResponse.json({ error: preview.error }, { status: preview.status })
    }
    const res = NextResponse.json(preview)
    res.headers.set('Cache-Control', 'no-store')
    return res
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: 'Failed to load approval link', message }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const admin = await requireApprovingAdmin()
    if (!admin.ok) {
      return NextResponse.json({ error: admin.error }, { status: admin.status })
    }
    const { token } = await params
    const body = await request.json().catch(() => ({}))
    const action = String(body?.action || 'approve').toLowerCase() === 'reject' ? 'reject' : 'approve'
    const reason = body?.reason != null ? String(body.reason) : null
    const clientIp = getClientIp(request)

    const db = await getDatabase('infusion_jaba')
    const result = await consumeManualMpesaApprovalToken(db, token, action, reason, {
      name: admin.name,
      userId: admin.userId,
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    queueCathaAuditLog({
      type: 'FINANCIAL',
      action: action === 'approve' ? 'MANUAL_MPESA_APPROVE_SMS_LINK' : 'MANUAL_MPESA_REJECT_SMS_LINK',
      status: 'SUCCESS',
      userId: admin.userId,
      role: admin.role,
      endpoint: '/api/catha/orders/manual-mpesa/approve-token',
      payloadSummary: {
        orderId: result.orderId,
        transactionCode: result.transactionCode,
        ip: clientIp,
      },
    })

    const res = NextResponse.json({
      success: true,
      action: result.action,
      orderId: result.orderId,
      transactionCode: result.transactionCode,
    })
    res.headers.set('Cache-Control', 'no-store')
    return res
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: 'Failed to process approval link', message }, { status: 500 })
  }
}
