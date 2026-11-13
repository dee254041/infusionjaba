import type { Db } from 'mongodb'
import { sendJabaSmsStrict } from '@/lib/jaba-sms'
import { createManualMpesaApprovalToken } from '@/lib/catha-manual-mpesa-approval-token'
import type { ManualMpesaVerificationForApi } from '@/lib/catha-manual-mpesa-verification'
import { getCathaNotificationSettings } from '@/lib/catha-notification-settings'
import { normalizePhoneNumbers } from '@/lib/phone-normalize'
import { buildManualPaymentAlertSms } from '@/lib/catha-manual-mpesa-approval-sms-message'

async function adminAlertPhones(db: Db, extra: string[]): Promise<string[]> {
  const admins = await db
    .collection('catha_users')
    .find({ role: 'SUPER_ADMIN', status: 'ACTIVE' })
    .project({ phoneNumber: 1 })
    .toArray()
  const fromAccounts = admins.map((user) => String(user.phoneNumber || '').trim()).filter(Boolean)
  return normalizePhoneNumbers([...extra, ...fromAccounts])
}

export async function maybeSendManualMpesaApprovalSms(
  db: Db,
  verification: ManualMpesaVerificationForApi
): Promise<{ sent: boolean; reason?: string; approveUrl?: string }> {
  try {
    const notifications = await getCathaNotificationSettings(db)
    const extra = notifications.manualMpesaApprovalSmsEnabled ? notifications.manualMpesaApprovalPhones : []
    const phones = await adminAlertPhones(db, extra)
    if (!phones.length) {
      console.warn('[manual-mpesa-approval-sms] Skipped: no super admin phone and no approval numbers')
      return { sent: false, reason: 'no_recipients' }
    }

    const expiryMinutes = notifications.manualMpesaApprovalLinkExpiryMinutes

    const { approveUrl, expiresAt } = await createManualMpesaApprovalToken(
      db,
      verification.id,
      expiryMinutes
    )

    const minsLeft = Math.max(1, Math.round((expiresAt.getTime() - Date.now()) / 60000))
    const message = buildManualPaymentAlertSms(verification, approveUrl, minsLeft)

    console.log('[manual-mpesa-approval-sms] Sending', {
      verificationId: verification.id,
      orderId: verification.orderId,
      transactionCode: verification.transactionCode,
      recipientCount: phones.length,
      recipients: phones,
      messagePreview: message.slice(0, 160),
    })

    await sendJabaSmsStrict(message, phones)

    console.log('[manual-mpesa-approval-sms] Sent successfully', {
      verificationId: verification.id,
      recipientCount: phones.length,
    })

    return { sent: true, approveUrl }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'sms_send_failed'
    console.error('[manual-mpesa-approval-sms] Failed:', error)
    return { sent: false, reason: message }
  }
}
