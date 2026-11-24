import { Collection, Db, MongoClient, type Document } from 'mongodb'
import { isShopOwnedCollection } from './constants'
import { scopeAggregation, shopCollectionFilter, stampShopId, stampUpdate } from './filter'
import type { ShopScopeDecision } from './types'
import { ShopScopeError } from './access'

export type ShopScopeResolver = () => Promise<ShopScopeDecision>

let resolver: ShopScopeResolver = async () => ({ mode: 'bypass' })
let resolverOverridden = false
let installPromise: Promise<void> | null = null

export function setShopScopeResolver(next: ShopScopeResolver): void {
  resolver = next
  resolverOverridden = true
}

async function ensureInstalled(): Promise<void> {
  if (resolverOverridden) return
  if (!installPromise) {
    installPromise = import('./install-scope').then((mod) => {
      mod.installShopScope()
    })
  }
  await installPromise
}

async function decide(): Promise<ShopScopeDecision> {
  await ensureInstalled()
  return resolver()
}

const CURSOR_CHAIN = new Set([
  'sort',
  'limit',
  'skip',
  'project',
  'collation',
  'maxTimeMS',
  'hint',
  'batchSize',
  'comment',
  'allowDiskUse',
  'map',
])

function lazyCursor(materialize: () => Promise<any>) {
  const chain: { method: string; args: unknown[] }[] = []
  let real: Promise<any> | null = null
  const ensure = () => {
    if (!real) {
      real = materialize().then((cursor) => {
        let current = cursor
        for (const op of chain) current = current[op.method](...op.args)
        return current
      })
    }
    return real
  }
  const self: any = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') return undefined
        if (prop === Symbol.asyncIterator) {
          return async function* shopScopedIterator() {
            const cursor = await ensure()
            yield* cursor
          }
        }
        if (typeof prop !== 'string') return undefined
        if (CURSOR_CHAIN.has(prop)) {
          return (...args: unknown[]) => {
            chain.push({ method: prop, args })
            return self
          }
        }
        return async (...args: unknown[]) => {
          const cursor = await ensure()
          const fn = cursor[prop]
          if (typeof fn !== 'function') return fn
          return fn.apply(cursor, args)
        }
      },
    }
  )
  return self
}

function asFilter(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

async function resolveScopedFilter(
  collectionName: string,
  filter: unknown,
  writing: boolean
): Promise<Record<string, unknown> | null> {
  const decision = await decide()
  if (decision.mode === 'bypass') return null
  if (decision.mode === 'deny') {
    if (writing) throw new ShopScopeError('Shop context is required.', 403)
    return { _id: { $exists: false }, shopId: '__denied__' }
  }
  return shopCollectionFilter(collectionName, filter, decision.shopId)
}

function rewriteBulk(collectionName: string, op: Record<string, unknown>, shopId: string): Record<string, unknown> {
  if (op.insertOne && typeof op.insertOne === 'object') {
    const insertOne = op.insertOne as { document?: Record<string, unknown> }
    if (insertOne.document) stampShopId(insertOne.document, shopId)
    return op
  }
  if (op.replaceOne && typeof op.replaceOne === 'object') {
    const replaceOne = op.replaceOne as { filter?: unknown; replacement?: Record<string, unknown> }
    replaceOne.filter = shopCollectionFilter(collectionName, replaceOne.filter, shopId)
    if (replaceOne.replacement) stampShopId(replaceOne.replacement, shopId)
    return op
  }
  for (const key of ['updateOne', 'updateMany', 'deleteOne', 'deleteMany'] as const) {
    if (op[key] && typeof op[key] === 'object') {
      const inner = op[key] as { filter?: unknown; update?: unknown }
      inner.filter = shopCollectionFilter(collectionName, inner.filter, shopId)
      if (inner.update) inner.update = stampUpdate(inner.update, shopId)
      return op
    }
  }
  return op
}

export function createShopScopedCollection<T extends Document>(
  target: Collection<T>,
  collectionName: string
): Collection<T> {
  if (!isShopOwnedCollection(collectionName)) return target
  return new Proxy(target, {
    get(collection, prop, receiver) {
      if (prop === 'find') {
        return (filter?: unknown, options?: unknown) =>
          lazyCursor(async () => {
            const scoped = await resolveScopedFilter(collectionName, filter, false)
            return collection.find((scoped ?? asFilter(filter)) as any, options as any)
          })
      }
      if (prop === 'aggregate') {
        return (pipeline?: unknown, options?: unknown) =>
          lazyCursor(async () => {
            const decision = await decide()
            if (decision.mode === 'deny') return collection.aggregate([{ $match: { _id: { $exists: false } } }] as any, options as any)
            const scoped = decision.mode === 'shop' ? scopeAggregation(pipeline, decision.shopId) : pipeline
            if (decision.mode === 'shop' && collectionName === 'distributor_requests' && Array.isArray(scoped)) {
              scoped.splice(1, 0, {
                $match: {
                  shopScope: { $ne: 'global' },
                  requestType: { $ne: 'jaba_distributor' },
                  shopId: { $ne: 'global' },
                },
              })
            }
            return collection.aggregate(scoped as any, options as any)
          })
      }
      if (prop === 'findOne') {
        return async (filter?: unknown, options?: unknown) => {
          const scoped = await resolveScopedFilter(collectionName, filter, false)
          return collection.findOne((scoped ?? asFilter(filter)) as any, options as any)
        }
      }
      if (prop === 'countDocuments') {
        return async (filter?: unknown, options?: unknown) => {
          const scoped = await resolveScopedFilter(collectionName, filter, false)
          return collection.countDocuments((scoped ?? asFilter(filter)) as any, options as any)
        }
      }
      if (prop === 'distinct') {
        return async (key: string, filter?: unknown, options?: unknown) => {
          const scoped = await resolveScopedFilter(collectionName, filter, false)
          return collection.distinct(key, (scoped ?? asFilter(filter)) as any, options as any)
        }
      }
      if (prop === 'insertOne') {
        return async (doc: Record<string, unknown>, options?: unknown) => {
          const decision = await decide()
          if (decision.mode === 'deny') throw new ShopScopeError('Shop context is required.', 403)
          if (decision.mode === 'shop') stampShopId(doc, decision.shopId)
          return collection.insertOne(doc as any, options as any)
        }
      }
      if (prop === 'insertMany') {
        return async (docs: Record<string, unknown>[], options?: unknown) => {
          const decision = await decide()
          if (decision.mode === 'deny') throw new ShopScopeError('Shop context is required.', 403)
          if (decision.mode === 'shop') for (const doc of docs) stampShopId(doc, decision.shopId)
          return collection.insertMany(docs as any, options as any)
        }
      }
      if (
        prop === 'updateOne' ||
        prop === 'updateMany' ||
        prop === 'findOneAndUpdate' ||
        prop === 'deleteOne' ||
        prop === 'deleteMany' ||
        prop === 'findOneAndDelete'
      ) {
        return async (filter?: unknown, update?: unknown, options?: unknown) => {
          const scoped = await resolveScopedFilter(collectionName, filter, true)
          const filterDoc = scoped ?? asFilter(filter)
          if (prop === 'deleteOne' || prop === 'deleteMany' || prop === 'findOneAndDelete') {
            return (collection as any)[prop](filterDoc, update)
          }
          const decision = await decide()
          const stamped = decision.mode === 'shop' ? stampUpdate(update, decision.shopId) : update
          return (collection as any)[prop](filterDoc, stamped, options)
        }
      }
      if (prop === 'replaceOne' || prop === 'findOneAndReplace') {
        return async (filter?: unknown, replacement?: Record<string, unknown>, options?: unknown) => {
          const scoped = await resolveScopedFilter(collectionName, filter, true)
          const decision = await decide()
          if (decision.mode === 'shop' && replacement) stampShopId(replacement, decision.shopId)
          return (collection as any)[prop](scoped ?? asFilter(filter), replacement, options)
        }
      }
      if (prop === 'bulkWrite') {
        return async (ops: Record<string, unknown>[], options?: unknown) => {
          const decision = await decide()
          if (decision.mode === 'deny') throw new ShopScopeError('Shop context is required.', 403)
          const next = decision.mode === 'shop' ? ops.map((op) => rewriteBulk(collectionName, { ...op }, decision.shopId)) : ops
          return collection.bulkWrite(next as any, options as any)
        }
      }
      const value = Reflect.get(collection, prop, receiver)
      return typeof value === 'function' ? value.bind(collection) : value
    },
  }) as Collection<T>
}

function createShopScopedDb(primary: Db): Db {
  return new Proxy(primary, {
    get(target, prop, receiver) {
      if (prop === 'collection') {
        return (name: string, options?: unknown) => {
          const col = target.collection(name, options as Parameters<Db['collection']>[1])
          return createShopScopedCollection(col as Collection<Document>, name)
        }
      }
      const value = Reflect.get(target, prop, receiver)
      return typeof value === 'function' ? value.bind(target) : value
    },
  }) as Db
}

export function wrapClientWithShopScope(client: MongoClient): MongoClient {
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === 'db') {
        return (name?: string, options?: unknown) => {
          const db = target.db(name as string, options as Parameters<MongoClient['db']>[1])
          return createShopScopedDb(db)
        }
      }
      const value = Reflect.get(target, prop, receiver)
      return typeof value === 'function' ? value.bind(target) : value
    },
  }) as MongoClient
}
