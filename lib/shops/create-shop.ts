import { ObjectId } from 'mongodb'
import {
  CATHA_LOUNGE_SHOP_ID,
  CATHA_SHOPS_COLLECTION,
  SHOP_TEMPLATE_COLLECTIONS,
  STANDARD_SHOP_MODULES,
  menuPathForShop,
  singletonDocId,
} from './constants'
import { mergeShopAssignment } from './access'
import { runWithShop, runWithoutShopScope } from './als'
import { ensureDefaultShopDocument } from './context'
import type { CreateShopInput } from './validate'
import { writeCathaAuditLog } from '@/lib/catha-audit-log'
import { DEFAULT_SHIFT_SETTINGS } from '@/lib/models/shift-setting'

const DB_NAME = 'infusion_jaba'

function txnUnsupported(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /transaction|replica set|IllegalOperation/i.test(message)
}

export async function createShop(input: CreateShopInput, actor: { email: string; userId?: string | null; role?: string | null }) {
  const { default: clientPromise } = await import('@/lib/mongodb')
  const client = await clientPromise
  const db = client.db(DB_NAME)
  await ensureDefaultShopDocument()

  const existing = await db.collection(CATHA_SHOPS_COLLECTION).findOne({
    $or: [{ slug: input.slug }, { shopId: input.slug }, { code: input.slug }],
  })
  if (existing) {
    const err = new Error('A shop with that code already exists.')
    ;(err as Error & { status?: number }).status = 409
    throw err
  }

  type ShopAdmin = { email: string; role?: string; shopIds?: string[] | null }
  let admin: ShopAdmin | null = null
  if (input.adminEmail) {
    admin = (await db.collection('catha_users').findOne({ email: input.adminEmail })) as ShopAdmin | null
    if (!admin) {
      const err = new Error('No staff account uses that administrator email. Ask them to sign in once, then assign them.')
      ;(err as Error & { status?: number }).status = 400
      throw err
    }
  }

  const now = new Date()
  const shopId = input.slug
  const shopDoc = {
    _id: shopId,
    shopId,
    name: input.name,
    slug: input.slug,
    code: input.slug,
    location: input.location,
    phone: input.phone,
    email: input.email,
    logoUrl: input.logoUrl,
    status: input.status,
    modules: [...STANDARD_SHOP_MODULES],
    menuPath: menuPathForShop(input.slug),
    createdAt: now,
    updatedAt: now,
    createdBy: actor.email,
  }

  const work = async (session?: import('mongodb').ClientSession) => {
    const opts = session ? { session } : undefined
    await db.collection(CATHA_SHOPS_COLLECTION).insertOne(shopDoc as any, opts)

    await runWithShop(shopId, async () => {
      for (const name of SHOP_TEMPLATE_COLLECTIONS) {
        const rows = await runWithShop(CATHA_LOUNGE_SHOP_ID, () =>
          db.collection(name).find({}).toArray()
        )
        if (!rows.length) continue
        const copies = rows.map((row) => {
          const { _id, shopId: _ignored, ...rest } = row as Record<string, unknown>
          return { ...rest, shopId, createdAt: now, updatedAt: now }
        })
        await db.collection(name).insertMany(copies as any, opts)
      }

      await db.collection('catha_settings').insertOne(
        {
          businessInfo: {
            businessName: input.name,
            phone: input.phone,
            address: input.location,
            currency: 'kes',
            vatRate: 16,
          },
          receipt: {
            autoPrint: true,
            includeVatBreakdown: true,
            footerMessage: 'Thank you for visiting!',
          },
          notifications: {
            lowStockAlerts: true,
            dailySalesSummary: true,
            newOrderNotifications: false,
            supplierDeliveryReminders: true,
            securitySmsAlertsEnabled: false,
            securityAlertNumbers: [],
            shiftNotificationPhones: [],
            onlineOrderSmsPhones: [],
            menuOrderSmsPhones: [],
            securityDeniedBurstThreshold: 10,
            manualMpesaApprovalSmsEnabled: false,
            manualMpesaApprovalPhones: [],
            manualMpesaApprovalLinkExpiryMinutes: 60,
          },
          security: { requirePinForVoids: true, autoLogout: '15', twoFactorAuth: false },
          delivery: {
            pickupAddress: input.location || input.name,
            pickupDirectionsUrl: '',
            options: [],
          },
          createdAt: now,
          updatedAt: now,
        } as any,
        opts
      )

      await db.collection('shift_settings').insertOne(
        {
          _id: singletonDocId('catha_shift_settings', shopId),
          ...DEFAULT_SHIFT_SETTINGS,
          updatedAt: now,
          updatedBy: actor.email,
        } as any,
        opts
      )
      await db.collection('pos_promotion_settings').insertOne(
        {
          _id: singletonDocId('global', shopId),
          conflictMode: 'never_stack',
          updatedBy: actor.email,
          updatedAt: now,
        } as any,
        opts
      )
    })

    if (admin?.email) {
      const shopIds = mergeShopAssignment(
        Array.isArray(admin.shopIds) ? admin.shopIds.map(String) : null,
        shopId
      )
      await db.collection('catha_users').updateOne(
        { email: admin.email },
        { $set: { shopIds, updatedAt: now } },
        opts
      )
    }
  }

  const session = client.startSession()
  try {
    try {
      await session.withTransaction(async () => {
        await work(session)
      })
    } catch (error) {
      if (!txnUnsupported(error)) throw error
      const leftover = await db.collection(CATHA_SHOPS_COLLECTION).findOne({ shopId })
      if (leftover) throw error
      await work(undefined)
    }
  } finally {
    await session.endSession()
  }

  await runWithShop(shopId, () =>
    writeCathaAuditLog({
      type: 'SYSTEM',
      action: 'SHOP_CREATED',
      status: 'SUCCESS',
      userId: actor.userId || actor.email,
      role: actor.role || 'SUPER_ADMIN',
      endpoint: '/api/catha/shops',
      payloadSummary: { shopId, name: input.name, adminEmail: input.adminEmail || null },
    })
  ).catch((error) => {
    console.error('[shops] audit log failed:', error instanceof Error ? error.message : error)
  })

  await runWithoutShopScope(async () => {
    const col = db.collection(CATHA_SHOPS_COLLECTION)
    await col.createIndex({ slug: 1 }, { unique: true, name: 'catha_shops_slug' })
    await col.createIndex({ code: 1 }, { unique: true, name: 'catha_shops_code' })
  }).catch(() => undefined)

  return {
    shopId,
    name: input.name,
    slug: input.slug,
    menuPath: menuPathForShop(input.slug),
    modules: [...STANDARD_SHOP_MODULES],
    adminRoleUnchanged: admin?.role || null,
  }
}

export function shopAdminObjectId(id: string | undefined | null): ObjectId | null {
  if (!id || !ObjectId.isValid(id)) return null
  return new ObjectId(id)
}
