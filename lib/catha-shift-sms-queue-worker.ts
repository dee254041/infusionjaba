import { sendJabaSmsStrict } from '@/lib/jaba-sms'
import { createShiftUserSmsLog } from '@/lib/models/shift-user-sms-log'
import {
  claimProcessableShiftSmsBatch,
  markShiftSmsFailed,
  markShiftSmsSent,
  type ShiftSmsQueueItem,
} from '@/lib/models/shift-sms-queue'
import { randomUUID } from 'crypto'
import { runWithShop, runWithoutShopScope } from '@/lib/shops/als'
import { CATHA_LOUNGE_SHOP_ID } from '@/lib/shops/constants'

async function processOne(item: ShiftSmsQueueItem): Promise<'sent' | 'failed'> {
  try {
    const result = await sendJabaSmsStrict(item.message, [item.phone])
    await markShiftSmsSent(String(item._id), result.transactionId ?? null)
    await createShiftUserSmsLog({
      userId: item.userId,
      shiftId: undefined,
      phone: item.phone,
      message: item.message,
      status: 'sent',
      eventType:
        item.eventType === 'OPEN' ? 'SHIFT_OPENED' : item.eventType === 'AUTO_CLOSE' ? 'SHIFT_AUTO_CLOSED' : 'SHIFT_CLOSED',
    })
    return 'sent'
  } catch (error: any) {
    const nextAttempt = Number(item.attempts || 0) + 1
    const message = error?.message || 'sms_send_failed'
    await markShiftSmsFailed(String(item._id), nextAttempt, message)
    await createShiftUserSmsLog({
      userId: item.userId,
      shiftId: undefined,
      phone: item.phone,
      message: item.message,
      status: 'failed',
      eventType:
        item.eventType === 'OPEN' ? 'SHIFT_OPENED' : item.eventType === 'AUTO_CLOSE' ? 'SHIFT_AUTO_CLOSED' : 'SHIFT_CLOSED',
      error: message,
    })
    return 'failed'
  }
}

export async function processShiftSmsQueueBatch(limit = 50): Promise<{ processed: number; sent: number; failed: number }> {
  const workerId = `sms-worker-${randomUUID()}`
  const jobs = await runWithoutShopScope(() => claimProcessableShiftSmsBatch(limit, workerId))
  let sent = 0
  let failed = 0
  for (const job of jobs) {
    const shopId = String((job as { shopId?: string }).shopId || CATHA_LOUNGE_SHOP_ID)
    const result = await runWithShop(shopId, () => processOne(job))
    if (result === 'sent') sent += 1
    else failed += 1
  }
  return { processed: jobs.length, sent, failed }
}

