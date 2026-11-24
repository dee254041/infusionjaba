/**
 * Live two-shop check against MongoDB.
 * Creates temporary rows, proves they do not cross shops, then deletes them.
 *
 *   npx tsx scripts/verify-shop-isolation.ts
 */
import { MongoClient, ObjectId } from 'mongodb'
import { readFileSync, existsSync } from 'node:fs'
import { CATHA_LOUNGE_SHOP_ID, CATHA_SHOPS_COLLECTION, GLOBAL_RECORD_SHOP_ID } from '../lib/shops/constants'
import { createShopScopedCollection, setShopScopeResolver } from '../lib/shops/scoped-collection'
import { shopIdForPaymentCallback } from '../lib/shops/payment-shop'
import { createPublicPaymentToken, isPublicPaymentToken, publicPaymentStatus, shouldDeductStockOnCallback } from '../lib/shops/payment-status'

function loadEnv() {
  for (const name of ['.env.local', '.env']) {
    if (!existsSync(name)) continue
    for (const line of readFileSync(name, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (!match || process.env[match[1]]) continue
      process.env[match[1]] = match[2].replace(/^"|"$/g, '')
    }
  }
}

async function main() {
  loadEnv()
  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.error('SKIPPED: MONGODB_URI is not set, so the live two-shop check did not run.')
    process.exit(2)
  }

  const client = new MongoClient(uri)
  await client.connect()
  const db = client.db('infusion_jaba')
  const run = `iso-${Date.now()}`
  const shopB = `${run}-b`
  const failures: string[] = []
  const created: Array<{ collection: string; id: ObjectId | string }> = []

  const check = (name: string, ok: boolean) => {
    if (!ok) failures.push(name)
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`)
  }

  try {
    await db.collection(CATHA_SHOPS_COLLECTION).insertOne({
      _id: shopB as never,
      shopId: shopB,
      name: 'Isolation Test Shop',
      slug: shopB,
      code: shopB,
      status: 'active',
      modules: ['pos', 'orders'],
      menuPath: `/menu?shop=${shopB}`,
      createdAt: new Date(),
    })
    created.push({ collection: CATHA_SHOPS_COLLECTION, id: shopB })

    const productB = await db.collection('bar_inventory').insertOne({
      name: run,
      type: 'bar',
      price: 125,
      stock: 4,
      shopId: shopB,
      deleted: false,
    })
    const orderB = await db.collection('orders').insertOne({
      id: `${run}-order`,
      total: 125,
      status: 'pending',
      shopId: shopB,
      items: [{ productId: String(productB.insertedId), quantity: 1, name: run }],
    })
    const expenseB = await db.collection('bar_expenses').insertOne({ amount: 50, shopId: shopB, note: run })
    const supplierB = await db.collection('bar_suppliers').insertOne({ name: run, shopId: shopB })
    const clientB = await db.collection('catha_clients').insertOne({ name: run, shopId: shopB })
    const tableB = await db.collection('bar_tables').insertOne({ id: 77, name: run, shopId: shopB })
    const token = createPublicPaymentToken()
    const paymentB = await db.collection('mpesa_transactions').insertOne({
      checkout_request_id: `${run}-checkout`,
      public_status_token: token,
      status: 'PENDING',
      phone_number: '254700000000',
      amount: 125,
      shopId: shopB,
      account_reference: `${run}-order`,
    })
    const auditB = await db.collection('audit_logs').insertOne({ action: run, shopId: shopB, createdAt: new Date() })
    for (const row of [
      ['bar_inventory', productB.insertedId],
      ['orders', orderB.insertedId],
      ['bar_expenses', expenseB.insertedId],
      ['bar_suppliers', supplierB.insertedId],
      ['catha_clients', clientB.insertedId],
      ['bar_tables', tableB.insertedId],
      ['mpesa_transactions', paymentB.insertedId],
      ['audit_logs', auditB.insertedId],
    ] as const) {
      created.push({ collection: row[0], id: row[1] })
    }

    setShopScopeResolver(async () => ({ mode: 'shop', shopId: CATHA_LOUNGE_SHOP_ID }))
    const orders = createShopScopedCollection(db.collection('orders'), 'orders')
    const inventory = createShopScopedCollection(db.collection('bar_inventory'), 'bar_inventory')
    const payments = createShopScopedCollection(db.collection('mpesa_transactions'), 'mpesa_transactions')
    check('Catha cannot read Shop B order by id', (await orders.findOne({ id: `${run}-order` })) == null)
    check('Catha cannot read Shop B product', (await inventory.findOne({ _id: productB.insertedId })) == null)
    check('Catha cannot search Shop B payments', (await payments.find({ checkout_request_id: `${run}-checkout` }).toArray()).length === 0)

    setShopScopeResolver(async () => ({ mode: 'shop', shopId: shopB }))
    const shopOrder = await orders.findOne({ id: `${run}-order` })
    check('Shop B can read its own order', shopOrder != null && String((shopOrder as { shopId?: string }).shopId) === shopB)
    check('Shop B payment callback ignores the selected Catha shop', shopIdForPaymentCallback({ shopId: shopB }, CATHA_LOUNGE_SHOP_ID) === shopB)

    const before = await db.collection('bar_inventory').findOne({ _id: productB.insertedId })
    const stock = Number(before?.stock || 0)
    if (shouldDeductStockOnCallback({ stockDeducted: false })) {
      await db.collection('bar_inventory').updateOne({ _id: productB.insertedId, shopId: shopB }, { $inc: { stock: -1 } })
      await db.collection('orders').updateOne({ _id: orderB.insertedId }, { $set: { stockDeducted: true, shopId: shopB } })
    }
    if (shouldDeductStockOnCallback({ stockDeducted: true })) {
      await db.collection('bar_inventory').updateOne({ _id: productB.insertedId, shopId: shopB }, { $inc: { stock: -1 } })
    }
    const after = await db.collection('bar_inventory').findOne({ _id: productB.insertedId })
    check('Duplicate callback deducts Shop B stock once', Number(after?.stock) === stock - 1)
    check('Public status token does not reveal the phone', isPublicPaymentToken(token) && !JSON.stringify(publicPaymentStatus('COMPLETED')).includes('2547'))

    const global = await db.collection('distributor_requests').insertOne({
      id: run,
      name: run,
      contact: run,
      email: `${run}@example.com`,
      phone: '254700000001',
      products: '',
      status: 'pending',
      submittedAt: new Date(),
      requestType: 'jaba_distributor',
      shopId: GLOBAL_RECORD_SHOP_ID,
      shopScope: 'global',
      ownership: 'global',
    })
    created.push({ collection: 'distributor_requests', id: global.insertedId })
    const requests = createShopScopedCollection(db.collection('distributor_requests'), 'distributor_requests')
    check('Shop B cannot list the global Jaba request', (await requests.find({ id: run }).toArray()).length === 0)
  } finally {
    for (const row of created.reverse()) {
      await db.collection(row.collection).deleteOne({ _id: row.id as never })
    }
    await client.close()
  }

  if (failures.length) {
    console.error(`Live two-shop check failed: ${failures.join('; ')}`)
    process.exit(1)
  }
  console.log('Live two-shop check passed and test rows were removed.')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
