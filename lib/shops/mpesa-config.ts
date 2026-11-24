import type { Db } from 'mongodb'
import { CATHA_LOUNGE_SHOP_ID } from './constants'
import { runWithoutShopScope } from './als'

const SHARED_SETTINGS = {
  $or: [{ shopId: CATHA_LOUNGE_SHOP_ID }, { shopId: { $exists: false } }, { shopId: null }],
}

/** M-Pesa credentials stay on the original settings document and are shared by every shop. */
export async function readSharedMpesaConfig(db: Db): Promise<Record<string, unknown> | null> {
  return runWithoutShopScope(async () => {
    const doc = await db.collection('catha_settings').findOne(SHARED_SETTINGS)
    const mpesa = doc?.mpesa
    return mpesa && typeof mpesa === 'object' ? (mpesa as Record<string, unknown>) : null
  })
}

export async function writeSharedMpesaConfig(db: Db, mpesa: Record<string, unknown>): Promise<void> {
  await runWithoutShopScope(async () => {
    await db.collection('catha_settings').updateOne(
      SHARED_SETTINGS,
      { $set: { mpesa, updatedAt: new Date() } }
    )
  })
}

export async function readSharedIntegrationPhone(db: Db): Promise<string | null> {
  return runWithoutShopScope(async () => {
    const doc = await db.collection('catha_settings').findOne(SHARED_SETTINGS)
    const phone = doc?.notifications?.mpesaIntegrationPhone
    return typeof phone === 'string' ? phone : null
  })
}

export async function writeSharedIntegrationPhone(db: Db, phone: string): Promise<void> {
  await runWithoutShopScope(async () => {
    await db.collection('catha_settings').updateOne(
      SHARED_SETTINGS,
      {
        $set: {
          'notifications.mpesaIntegrationPhone': phone,
          updatedAt: new Date(),
        },
      }
    )
  })
}
