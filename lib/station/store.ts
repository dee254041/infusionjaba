import { randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'
import type { Db } from 'mongodb'
import { getDatabase } from '@/lib/mongodb'
import { allocateStationId, stationOrderId } from '@/lib/station/slug'
import type { StationRole } from '@/lib/station/token'

export const STATION = {
  shops: 'stations',
  users: 'station_users',
  products: 'station_products',
  orders: 'station_orders',
  tables: 'station_tables',
  expenses: 'station_expenses',
  clients: 'station_clients',
  suppliers: 'station_suppliers',
  movements: 'station_stock_movements',
} as const

export type StationShop = {
  slug: string
  name: string
  phone: string
  location: string
  active: boolean
  payment: 'shared-mpesa'
  createdAt: Date
}

let indexesReady: Promise<void> | null = null

export async function stationDb(): Promise<Db> {
  const db = await getDatabase('infusion_jaba')
  if (!indexesReady) {
    indexesReady = ensureStationIndexes(db).catch((error) => {
      indexesReady = null
      throw error
    })
  }
  await indexesReady
  return db
}

async function ensureStationIndexes(db: Db) {
  await db.collection(STATION.users).createIndex({ email: 1 }, { unique: true })
  await db.collection(STATION.products).createIndex({ shopId: 1, id: 1 }, { unique: true })
  await db.collection(STATION.orders).createIndex({ shopId: 1, id: 1 }, { unique: true })
  await db.collection(STATION.orders).createIndex({ id: 1 }, { unique: true })
  await db.collection(STATION.tables).createIndex({ shopId: 1, tableId: 1 }, { unique: true })
}

function id(prefix: string): string {
  return `${prefix}_${randomBytes(6).toString('hex')}`
}

export async function listStations(db: Db) {
  const rows = await db.collection(STATION.shops).find({}).sort({ createdAt: -1 }).toArray()
  return rows.map(publicShop)
}

export function publicShop(row: Record<string, unknown>) {
  return {
    slug: String(row.slug || row._id || ''),
    name: String(row.name || ''),
    phone: String(row.phone || ''),
    location: String(row.location || ''),
    active: row.active !== false,
    payment: 'shared-mpesa' as const,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : null,
  }
}

export async function getStation(db: Db, slug: string) {
  const row = await db.collection(STATION.shops).findOne({ slug })
  return row ? publicShop(row as Record<string, unknown>) : null
}

export async function createStation(
  db: Db,
  input: {
    name: string
    phone: string
    location: string
    adminName: string
    adminEmail: string
    adminPin: string
  },
) {
  const name = input.name.trim()
  if (name.length < 2 || name.length > 80) return { ok: false as const, error: 'Enter the shop name.' }
  const existingRows = await db.collection(STATION.shops).find({}, { projection: { slug: 1 } }).toArray()
  const taken = new Set(existingRows.map((row) => String(row.slug || row._id || '')))
  let slug = ''
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = allocateStationId(name, taken)
    const existing = await db.collection(STATION.shops).findOne({ slug: candidate })
    if (!existing) {
      slug = candidate
      break
    }
    taken.add(candidate)
  }
  if (!slug) return { ok: false as const, error: 'Could not create a shop id. Try again.' }

  const now = new Date()
  await db.collection(STATION.shops).insertOne({
    _id: slug,
    slug,
    name,
    phone: input.phone.trim().slice(0, 40),
    location: input.location.trim().slice(0, 120),
    active: true,
    payment: 'shared-mpesa',
    createdAt: now,
  })
  const placed = await placeStationPerson(db, {
    name: input.adminName.trim() || name,
    email: input.adminEmail,
    pin: input.adminPin,
    assignments: [{ shopId: slug, role: 'ADMIN' }],
    mode: 'add',
  })
  if (!placed.ok) {
    await db.collection(STATION.shops).deleteOne({ slug })
    return placed
  }
  return { ok: true as const, shop: await getStation(db, slug) }
}

export async function setStationActive(db: Db, slug: string, active: boolean) {
  const res = await db.collection(STATION.shops).updateOne({ slug }, { $set: { active } })
  return res.matchedCount > 0
}

function cleanPin(pin: string): string | null {
  const value = String(pin || '').trim()
  return /^\d{4}$/.test(value) ? value : null
}

type Assignment = { shopId: string; role: 'ADMIN' | 'STAFF' }

function readAssignments(row: Record<string, unknown>): Assignment[] {
  const raw = Array.isArray(row.assignments) ? row.assignments : []
  return raw
    .map((item) => {
      const shopId = String((item as { shopId?: string }).shopId || '')
      const role = (item as { role?: string }).role === 'ADMIN' ? 'ADMIN' : 'STAFF'
      return shopId ? { shopId, role } : null
    })
    .filter((item): item is Assignment => Boolean(item))
}

export async function placeStationPerson(
  db: Db,
  input: { name: string; email: string; pin?: string; assignments: Assignment[]; mode?: 'replace' | 'add' },
) {
  const email = input.email.trim().toLowerCase()
  const name = input.name.trim()
  if (name.length < 2 || name.length > 80) return { ok: false as const, error: 'Enter the person\'s name.' }
  if (!email.includes('@') || email.length > 120) return { ok: false as const, error: 'Enter a valid email.' }
  const pin = input.pin ? cleanPin(input.pin) : null
  if (input.pin && !pin) return { ok: false as const, error: 'PIN must be 4 digits.' }
  const wanted = new Map<string, Assignment>()
  for (const assignment of input.assignments) {
    const shop = await db.collection(STATION.shops).findOne({ slug: assignment.shopId })
    if (!shop) return { ok: false as const, error: 'Choose a station that exists.' }
    wanted.set(assignment.shopId, {
      shopId: assignment.shopId,
      role: assignment.role === 'ADMIN' ? 'ADMIN' : 'STAFF',
    })
  }
  const existing = await db.collection(STATION.users).findOne({ email })
  if (!existing && !pin) return { ok: false as const, error: 'Set a 4-digit PIN for a new person.' }
  let assignments = [...wanted.values()]
  if (existing && input.mode === 'add') {
    const merged = new Map(readAssignments(existing as Record<string, unknown>).map((item) => [item.shopId, item]))
    for (const item of wanted.values()) merged.set(item.shopId, item)
    assignments = [...merged.values()]
  }
  const now = new Date()
  const set: Record<string, unknown> = {
    name: name.slice(0, 80),
    email,
    assignments,
    active: true,
    updatedAt: now,
  }
  if (pin) {
    set.pinHash = await bcrypt.hash(pin, 10)
    set.pinFailedAttempts = 0
    set.pinLockedUntil = null
  }
  if (existing) {
    await db.collection(STATION.users).updateOne({ email }, { $set: set })
  } else {
    await db.collection(STATION.users).insertOne({
      id: id('usr'),
      ...set,
      pinFailedAttempts: 0,
      pinLockedUntil: null,
      createdAt: now,
    })
  }
  return { ok: true as const }
}

export async function listStationPeople(db: Db) {
  const rows = await db.collection(STATION.users).find({}).sort({ name: 1 }).limit(300).toArray()
  return rows.map((row) => ({
    id: String(row.id || ''),
    name: String(row.name || ''),
    email: String(row.email || ''),
    active: row.active !== false,
    assignments: readAssignments(row as Record<string, unknown>),
  }))
}

export async function verifyStationLogin(db: Db, slug: string, email: string, pin: string) {
  const shop = await db.collection(STATION.shops).findOne({ slug })
  if (!shop || shop.active === false) return { ok: false as const, error: 'This station is not open.' }
  const code = cleanPin(pin)
  const user = await db.collection(STATION.users).findOne({
    email: email.trim().toLowerCase(),
    active: { $ne: false },
  })
  if (!user?.pinHash || !code) return { ok: false as const, error: 'Email or PIN is wrong for this station.' }
  const lockedUntil = user.pinLockedUntil ? new Date(user.pinLockedUntil) : null
  if (lockedUntil && lockedUntil.getTime() > Date.now()) {
    return { ok: false as const, error: 'Too many tries. Wait 15 minutes and use the PIN again.' }
  }
  const match = await bcrypt.compare(code, String(user.pinHash))
  if (!match) {
    const failures = Number(user.pinFailedAttempts || 0) + 1
    await db.collection(STATION.users).updateOne(
      { email: user.email },
      {
        $set: {
          pinFailedAttempts: failures,
          pinLockedUntil: failures >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null,
        },
      },
    )
    return { ok: false as const, error: 'Email or PIN is wrong for this station.' }
  }
  const assignment = readAssignments(user as Record<string, unknown>).find((item) => item.shopId === slug)
  if (!assignment) return { ok: false as const, error: 'You are not placed on this station.' }
  await db.collection(STATION.users).updateOne(
    { email: user.email },
    { $set: { pinFailedAttempts: 0, pinLockedUntil: null } },
  )
  const role: StationRole = assignment.role === 'ADMIN' ? 'ADMIN' : 'STAFF'
  return {
    ok: true as const,
    user: {
      shopId: slug,
      userId: String(user.id),
      role,
      name: String(user.name || email),
    },
  }
}

export async function loginByEmailPin(db: Db, email: string, pin: string) {
  const code = cleanPin(pin)
  const user = await db.collection(STATION.users).findOne({
    email: email.trim().toLowerCase(),
    active: { $ne: false },
  })
  if (!user?.pinHash || !code) return { ok: false as const, error: 'Email or PIN is wrong.' }
  const lockedUntil = user.pinLockedUntil ? new Date(user.pinLockedUntil) : null
  if (lockedUntil && lockedUntil.getTime() > Date.now()) {
    return { ok: false as const, error: 'Too many tries. Wait 15 minutes and use the PIN again.' }
  }
  const match = await bcrypt.compare(code, String(user.pinHash))
  if (!match) {
    const failures = Number(user.pinFailedAttempts || 0) + 1
    await db.collection(STATION.users).updateOne(
      { email: user.email },
      {
        $set: {
          pinFailedAttempts: failures,
          pinLockedUntil: failures >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null,
        },
      },
    )
    return { ok: false as const, error: 'Email or PIN is wrong.' }
  }
  await db.collection(STATION.users).updateOne(
    { email: user.email },
    { $set: { pinFailedAttempts: 0, pinLockedUntil: null } },
  )
  const assignments = readAssignments(user as Record<string, unknown>)
  const shops = []
  for (const assignment of assignments) {
    const shop = await getStation(db, assignment.shopId)
    if (!shop?.active) continue
    shops.push({ id: shop.slug, name: shop.name, role: assignment.role })
  }
  if (!shops.length) return { ok: false as const, error: 'You are not placed on a shop.' }
  return {
    ok: true as const,
    user: {
      userId: String(user.id),
      name: String(user.name || email),
      shops,
    },
  }
}

function money(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0 || n > 10_000_000) return NaN
  return Math.round(n * 100) / 100
}

export async function listProducts(db: Db, shopId: string, visibleOnly = false) {
  const query: Record<string, unknown> = { shopId }
  if (visibleOnly) query.visible = { $ne: false }
  const rows = await db.collection(STATION.products).find(query).sort({ name: 1 }).limit(500).toArray()
  return rows.map(publicProduct)
}

export function publicProduct(row: Record<string, unknown>) {
  return {
    id: String(row.id || ''),
    name: String(row.name || ''),
    category: String(row.category || 'General'),
    price: Number(row.price) || 0,
    stock: Number(row.stock) || 0,
    visible: row.visible !== false,
  }
}

export async function saveProduct(
  db: Db,
  shopId: string,
  input: { id?: string; name: string; category: string; price: number; stock: number; visible?: boolean },
) {
  const name = input.name.trim()
  const price = money(input.price)
  const stock = Math.round(Number(input.stock))
  if (name.length < 1 || name.length > 80) return { ok: false as const, error: 'Enter a product name.' }
  if (!Number.isFinite(price)) return { ok: false as const, error: 'Enter a valid price.' }
  if (!Number.isFinite(stock) || stock < 0 || stock > 1_000_000) return { ok: false as const, error: 'Enter a valid stock count.' }
  const now = new Date()
  const productId = input.id || id('prd')
  const existing = input.id
    ? await db.collection(STATION.products).findOne({ shopId, id: productId })
    : null
  if (input.id && !existing) return { ok: false as const, error: 'Product not found in this shop.' }
  await db.collection(STATION.products).updateOne(
    { shopId, id: productId },
    {
      $set: {
        shopId,
        id: productId,
        name,
        category: (input.category || 'General').trim().slice(0, 40) || 'General',
        price,
        stock,
        visible: input.visible !== false,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  )
  if (existing && Number(existing.stock) !== stock) {
    await db.collection(STATION.movements).insertOne({
      shopId,
      productId,
      name,
      change: stock - Number(existing.stock || 0),
      reason: 'adjustment',
      createdAt: now,
    })
  }
  const saved = await db.collection(STATION.products).findOne({ shopId, id: productId })
  return { ok: true as const, product: publicProduct(saved as Record<string, unknown>) }
}

type Line = { productId: string; name: string; price: number; quantity: number }

export async function priceLines(db: Db, shopId: string, items: { productId: string; quantity: number }[]): Promise<Line[] | null> {
  if (!Array.isArray(items) || items.length === 0 || items.length > 40) return null
  const lines: Line[] = []
  for (const raw of items) {
    const quantity = Math.round(Number(raw.quantity))
    if (!raw.productId || quantity < 1 || quantity > 500) return null
    const product = await db.collection(STATION.products).findOne({
      shopId,
      id: String(raw.productId),
      visible: { $ne: false },
    })
    if (!product) return null
    lines.push({
      productId: String(product.id),
      name: String(product.name),
      price: Number(product.price) || 0,
      quantity,
    })
  }
  return lines
}

export function linesTotal(lines: Line[]): number {
  return Math.round(lines.reduce((sum, line) => sum + line.price * line.quantity, 0) * 100) / 100
}

async function deductLines(db: Db, shopId: string, lines: Line[], orderId: string, reason: string) {
  const taken: Line[] = []
  for (const line of lines) {
    const res = await db.collection(STATION.products).updateOne(
      { shopId, id: line.productId, stock: { $gte: line.quantity } },
      { $inc: { stock: -line.quantity }, $set: { updatedAt: new Date() } },
    )
    if (res.matchedCount === 0) {
      for (const prev of taken) {
        await db.collection(STATION.products).updateOne(
          { shopId, id: prev.productId },
          { $inc: { stock: prev.quantity } },
        )
      }
      return { ok: false as const, error: `${line.name} does not have enough stock.` }
    }
    taken.push(line)
    await db.collection(STATION.movements).insertOne({
      shopId,
      productId: line.productId,
      name: line.name,
      change: -line.quantity,
      reason,
      orderId,
      createdAt: new Date(),
    })
  }
  return { ok: true as const }
}

export async function createStationOrder(
  db: Db,
  shopId: string,
  input: {
    items: { productId: string; quantity: number }[]
    source: 'pos' | 'menu'
    paymentMethod: 'cash' | 'mpesa'
    table?: string
    customerPhone?: string
    customerName?: string
    cashier?: string
  },
) {
  const lines = await priceLines(db, shopId, input.items)
  if (!lines) return { ok: false as const, error: 'Choose products from this shop only.' }
  const total = linesTotal(lines)
  if (total <= 0) return { ok: false as const, error: 'Order total must be greater than zero.' }
  const orderId = stationOrderId(shopId)
  const payNow = input.paymentMethod === 'cash'
  if (payNow) {
    const stock = await deductLines(db, shopId, lines, orderId, 'sale')
    if (!stock.ok) return stock
  }
  const now = new Date()
  const order = {
    id: orderId,
    shopId,
    items: lines,
    total,
    source: input.source,
    table: (input.table || '').trim().slice(0, 40),
    customerPhone: (input.customerPhone || '').trim().slice(0, 20),
    customerName: (input.customerName || '').trim().slice(0, 80),
    cashier: (input.cashier || '').trim().slice(0, 80),
    paymentMethod: payNow ? 'cash' : null,
    paymentStatus: payNow ? 'PAID' : 'UNPAID',
    status: payNow ? 'completed' : 'open',
    stockDeducted: payNow,
    createdAt: now,
    updatedAt: now,
  }
  await db.collection(STATION.orders).insertOne(order)
  return { ok: true as const, order: publicOrder(order) }
}

export function publicOrder(row: Record<string, unknown>) {
  const items = Array.isArray(row.items) ? row.items : []
  return {
    id: String(row.id || ''),
    shopId: String(row.shopId || ''),
    items: items.map((item) => ({
      productId: String((item as { productId?: string }).productId || ''),
      name: String((item as { name?: string }).name || ''),
      price: Number((item as { price?: number }).price) || 0,
      quantity: Number((item as { quantity?: number }).quantity) || 0,
    })),
    total: Number(row.total) || 0,
    source: row.source === 'menu' ? 'menu' : 'pos',
    table: String(row.table || ''),
    customerPhone: String(row.customerPhone || ''),
    customerName: String(row.customerName || ''),
    cashier: String(row.cashier || ''),
    paymentMethod: row.paymentMethod === 'cash' || row.paymentMethod === 'mpesa' ? row.paymentMethod : null,
    paymentStatus: row.paymentStatus === 'PAID' ? 'PAID' : 'UNPAID',
    status: row.status === 'completed' ? 'completed' : row.status === 'cancelled' ? 'cancelled' : 'open',
    mpesaReceiptNumber: String(row.mpesaReceiptNumber || ''),
    stockWarning: String(row.stockWarning || ''),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : null,
  }
}

export async function listOrders(db: Db, shopId: string) {
  const rows = await db.collection(STATION.orders).find({ shopId }).sort({ createdAt: -1 }).limit(150).toArray()
  return rows.map((row) => publicOrder(row as Record<string, unknown>))
}

export async function getOrder(db: Db, shopId: string, orderId: string) {
  const row = await db.collection(STATION.orders).findOne({ shopId, id: orderId })
  return row ? publicOrder(row as Record<string, unknown>) : null
}

export async function markStationOrderPaid(
  db: Db,
  shopId: string,
  orderId: string,
  method: 'cash' | 'mpesa',
  receipt = '',
) {
  const row = await db.collection(STATION.orders).findOne({ shopId, id: orderId })
  if (!row) return { ok: false as const, error: 'Order not found in this shop.' }
  if (row.paymentStatus === 'PAID') return { ok: true as const, order: publicOrder(row as Record<string, unknown>) }
  if (row.status === 'cancelled') return { ok: false as const, error: 'This order is cancelled.' }
  let stockWarning = ''
  if (!row.stockDeducted) {
    const stock = await deductLines(db, shopId, row.items as Line[], orderId, 'sale')
    if (!stock.ok && method === 'cash') return stock
    if (!stock.ok) stockWarning = stock.error
  }
  await db.collection(STATION.orders).updateOne(
    { shopId, id: orderId, paymentStatus: { $ne: 'PAID' } },
    {
      $set: {
        paymentStatus: 'PAID',
        paymentMethod: method,
        status: 'completed',
        stockDeducted: !stockWarning,
        stockWarning,
        mpesaReceiptNumber: receipt,
        updatedAt: new Date(),
      },
    },
  )
  const saved = await db.collection(STATION.orders).findOne({ shopId, id: orderId })
  return { ok: true as const, order: publicOrder(saved as Record<string, unknown>) }
}

export async function fulfillStationMpesa(db: Db, orderId: string, receipt: string, amount: number) {
  const row = await db.collection(STATION.orders).findOne({ id: orderId })
  if (!row?.shopId) return { ok: false as const, error: 'Station order not found.' }
  const expected = Number(row.total) || 0
  if (Math.abs(expected - amount) > 0.02) {
    console.error('[Station M-Pesa] Amount mismatch', { orderId, expected, amount })
    return { ok: false as const, error: 'Amount does not match this station order.' }
  }
  return markStationOrderPaid(db, String(row.shopId), orderId, 'mpesa', receipt)
}

export async function listTables(db: Db, shopId: string) {
  const rows = await db.collection(STATION.tables).find({ shopId }).sort({ tableId: 1 }).toArray()
  return rows.map((row) => ({
    id: String(row.tableId),
    name: String(row.name || `Table ${row.tableId}`),
  }))
}

export async function addTable(db: Db, shopId: string, name: string) {
  const label = name.trim().slice(0, 40) || 'Table'
  const last = await db.collection(STATION.tables).find({ shopId }).sort({ tableId: -1 }).limit(1).toArray()
  const tableId = Number(last[0]?.tableId || 0) + 1
  await db.collection(STATION.tables).insertOne({
    shopId,
    tableId,
    name: label,
    createdAt: new Date(),
  })
  return { id: String(tableId), name: label }
}

export async function listStaff(db: Db, shopId: string) {
  const rows = await db.collection(STATION.users).find({ 'assignments.shopId': shopId }).sort({ name: 1 }).toArray()
  return rows.map((row) => {
    const assignment = readAssignments(row as Record<string, unknown>).find((item) => item.shopId === shopId)
    return {
      id: String(row.id || ''),
      name: String(row.name || ''),
      email: String(row.email || ''),
      role: assignment?.role === 'ADMIN' ? 'ADMIN' : 'STAFF',
      active: row.active !== false,
    }
  })
}

type NoteRecord = { id: string; shopId: string; title: string; detail: string; amount?: number; createdAt: Date }

async function listNotes(db: Db, collection: string, shopId: string) {
  const rows = await db.collection(collection).find({ shopId }).sort({ createdAt: -1 }).limit(200).toArray()
  return rows.map((row) => ({
    id: String(row.id),
    title: String(row.title || ''),
    detail: String(row.detail || ''),
    amount: Number(row.amount) || 0,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : null,
  }))
}

async function addNote(
  db: Db,
  collection: string,
  shopId: string,
  input: { title: string; detail?: string; amount?: number },
) {
  const title = input.title.trim()
  if (title.length < 1 || title.length > 80) return { ok: false as const, error: 'Enter a name.' }
  const doc: NoteRecord = {
    id: id('rec'),
    shopId,
    title: title.slice(0, 80),
    detail: (input.detail || '').trim().slice(0, 200),
    amount: Number.isFinite(Number(input.amount)) ? Math.max(0, Math.round(Number(input.amount))) : 0,
    createdAt: new Date(),
  }
  await db.collection(collection).insertOne(doc)
  return { ok: true as const }
}

export const listExpenses = (db: Db, shopId: string) => listNotes(db, STATION.expenses, shopId)
export const addExpense = (db: Db, shopId: string, input: { title: string; detail?: string; amount?: number }) =>
  addNote(db, STATION.expenses, shopId, input)
export const listClients = (db: Db, shopId: string) => listNotes(db, STATION.clients, shopId)
export const addClient = (db: Db, shopId: string, input: { title: string; detail?: string }) =>
  addNote(db, STATION.clients, shopId, input)
export const listSuppliers = (db: Db, shopId: string) => listNotes(db, STATION.suppliers, shopId)
export const addSupplier = (db: Db, shopId: string, input: { title: string; detail?: string }) =>
  addNote(db, STATION.suppliers, shopId, input)

export async function stationSummary(db: Db, shopId: string) {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const [orders, products, openOrders] = await Promise.all([
    db.collection(STATION.orders).find({ shopId, createdAt: { $gte: start }, paymentStatus: 'PAID' }).toArray(),
    db.collection(STATION.products).countDocuments({ shopId, visible: { $ne: false } }),
    db.collection(STATION.orders).countDocuments({ shopId, status: 'open' }),
  ])
  const sales = orders.reduce((sum, order) => sum + (Number(order.total) || 0), 0)
  return {
    sales: Math.round(sales),
    paidOrders: orders.length,
    products,
    openOrders,
  }
}

export async function listStationPayments(db: Db, shopId: string) {
  const rows = await db
    .collection('mpesa_transactions')
    .find({ shopId })
    .sort({ createdAt: -1 })
    .limit(100)
    .toArray()
  return rows.map((row) => ({
    id: String(row.checkout_request_id || ''),
    amount: Number(row.amount) || 0,
    phone: String(row.phone_number || ''),
    receipt: String(row.mpesa_receipt_number || ''),
    status: String(row.status || ''),
    reference: String(row.account_reference || ''),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : null,
  }))
}
