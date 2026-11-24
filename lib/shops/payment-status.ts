import { randomBytes } from 'node:crypto'
import { normalizeMpesaStatus, type MpesaStatus } from '@/lib/mpesa-status'

/** 32 random bytes. Long enough that it cannot be guessed from a shop code or order id. */
export function createPublicPaymentToken(): string {
  return randomBytes(32).toString('base64url')
}

export function isPublicPaymentToken(value: string | null | undefined): boolean {
  return /^[A-Za-z0-9_-]{43,128}$/.test(String(value || '').trim())
}

/** Public pollers only learn whether this one payment is still pending, paid, or failed. */
export function publicPaymentStatus(status: unknown): { status: MpesaStatus } {
  return { status: normalizeMpesaStatus(status) }
}

/**
 * A repeated M-Pesa callback must not deduct stock again.
 * The first successful callback sets stockDeducted; later deliveries only reconcile status.
 */
export function shouldDeductStockOnCallback(order: { stockDeducted?: unknown } | null | undefined): boolean {
  return Boolean(order) && order?.stockDeducted !== true
}
