/**
 * Assign every existing Catha Lounge record to the original shop.
 * Does not delete data. Jaba distributor requests are marked shopScope=global.
 *
 *   npm run backfill-catha-shops
 */
import { MongoClient } from 'mongodb'
import {
  CATHA_LOUNGE_SHOP_ID,
  CATHA_SHOPS_COLLECTION,
  GLOBAL_RECORD_SCOPE,
  GLOBAL_RECORD_SHOP_ID,
  SHOP_OWNED_COLLECTIONS,
  STANDARD_SHOP_MODULES,
  menuPathForShop,
} from '../lib/shops/constants'

const DB_NAME = 'infusion_jaba'

async function main() {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI is required')
  const client = new MongoClient(uri)
  await client.connect()
  const db = client.db(DB_NAME)
  const now = new Date()
  const report: Record<string, unknown> = { assigned: {} as Record<string, number>, unassigned: [] as string[] }

  await db.collection(CATHA_SHOPS_COLLECTION).updateOne(
    { _id: CATHA_LOUNGE_SHOP_ID as any },
    {
      $setOnInsert: {
        _id: CATHA_LOUNGE_SHOP_ID,
        shopId: CATHA_LOUNGE_SHOP_ID,
        name: 'Catha Lounge',
        slug: CATHA_LOUNGE_SHOP_ID,
        code: CATHA_LOUNGE_SHOP_ID,
        location: '',
        phone: '',
        email: '',
        logoUrl: '',
        status: 'active',
        modules: [...STANDARD_SHOP_MODULES],
        menuPath: menuPathForShop(CATHA_LOUNGE_SHOP_ID),
        createdAt: now,
        createdBy: 'backfill',
      },
      $set: { updatedAt: now },
    },
    { upsert: true }
  )

  const requests = db.collection('distributor_requests')
  const requestsExist = await db.listCollections({ name: 'distributor_requests' }).hasNext()
  if (requestsExist) {
    const globalized = await requests.updateMany(
      { requestType: 'jaba_distributor', shopScope: { $ne: GLOBAL_RECORD_SCOPE } },
      { $set: { shopId: GLOBAL_RECORD_SHOP_ID, shopScope: GLOBAL_RECORD_SCOPE, ownership: 'global', updatedAt: now } }
    )
    report.globalDistributorRequests = globalized.modifiedCount
  }

  for (const name of SHOP_OWNED_COLLECTIONS) {
    const col = db.collection(name)
    const exists = await db.listCollections({ name }).hasNext()
    if (!exists) continue
    const filter =
      name === 'distributor_requests'
        ? {
            shopId: { $exists: false },
            requestType: { $ne: 'jaba_distributor' },
            shopScope: { $ne: GLOBAL_RECORD_SCOPE },
          }
        : { shopId: { $exists: false }, shopScope: { $ne: GLOBAL_RECORD_SCOPE } }
    const result = await col.updateMany(filter, { $set: { shopId: CATHA_LOUNGE_SHOP_ID } })
    ;(report.assigned as Record<string, number>)[name] = result.modifiedCount
    await col.createIndex({ shopId: 1 }, { name: `shop_${name}_idx` }).catch(() => undefined)
  }

  for (const name of SHOP_OWNED_COLLECTIONS) {
    const exists = await db.listCollections({ name }).hasNext()
    if (!exists) continue
    const leftover = await db.collection(name).countDocuments({
      $and: [
        { $or: [{ shopId: { $exists: false } }, { shopId: null }] },
        { shopScope: { $ne: GLOBAL_RECORD_SCOPE } },
      ],
    })
    if (leftover > 0) {
      ;(report.unassigned as string[]).push(`${name}: ${leftover} rows still have no shopId and are not global`)
    }
  }

  const users = db.collection('catha_users')
  const staff = await users
    .find({ shopIds: { $exists: false }, role: { $not: /^super[_-]?admin$/i } })
    .toArray()
  let assignedUsers = 0
  for (const user of staff) {
    const role = String(user.role || '').toUpperCase().replace(/-/g, '_')
    if (role === 'SUPER_ADMIN') continue
    await users.updateOne({ _id: user._id }, { $set: { shopIds: [CATHA_LOUNGE_SHOP_ID], updatedAt: now } })
    assignedUsers += 1
  }
  report.assignedUsers = assignedUsers

  await db.collection(CATHA_SHOPS_COLLECTION).createIndex({ slug: 1 }, { unique: true, name: 'catha_shops_slug' }).catch(() => undefined)
  await db.collection(CATHA_SHOPS_COLLECTION).createIndex({ code: 1 }, { unique: true, name: 'catha_shops_code' }).catch(() => undefined)

  console.log(JSON.stringify(report, null, 2))
  await client.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
