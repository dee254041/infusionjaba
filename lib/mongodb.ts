import { MongoClient, MongoClientOptions } from 'mongodb'
import { wrapClientWithSync } from './db-sync'

const isDevelopment = process.env.NODE_ENV === 'development'
const allowOfflineDev = isDevelopment && process.env.ALLOW_OFFLINE_DEV === 'true'

if (!process.env.MONGODB_URI && !allowOfflineDev) {
  throw new Error('Invalid/Missing environment variable: "MONGODB_URI"')
}

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/infusion_jaba_dev'

// Keep the pool small. zlib on every document is CPU time Vercel bills,
// and Atlas is already in the same region as the functions.
const options: MongoClientOptions = {
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 20000,
  connectTimeoutMS: 10000,
  retryWrites: true,
  retryReads: true,
  maxPoolSize: 5,
  minPoolSize: 0,
  maxIdleTimeMS: 20000,
  heartbeatFrequencyMS: 60000,
  directConnection: false,
  // Vercel often cannot complete an IPv6 handshake to Atlas. Trying IPv6 first
  // burns the whole server-selection window and the page fails.
  family: 4,
  autoSelectFamily: false,
}

const globalForMongo = globalThis as typeof globalThis & {
  _mongoClientPromise?: Promise<MongoClient>
}

if (!globalForMongo._mongoClientPromise) {
  const mongoClient = new MongoClient(uri, options)

  if (isDevelopment) {
    globalForMongo._mongoClientPromise = (async () => {
      try {
        console.log('[MongoDB] 🔌 Attempting to connect to MongoDB...')
        await mongoClient.connect()
        console.log('[MongoDB] ✅ Connected successfully')

        await mongoClient.db('admin').command({ ping: 1 })
        console.log('[MongoDB] ✅ Connection verified')
        return mongoClient
      } catch (error: any) {
        console.error('[MongoDB] ❌ Connection failed:', error.message)
        if (error.message.includes('ETIMEOUT') || error.message.includes('querySrv')) {
          console.error('[MongoDB] 💡 DNS Resolution Issue!')
          console.error('[MongoDB] 💡 Solutions:')
          console.error('[MongoDB]    1. Check MongoDB Atlas → Network Access (IP whitelist)')
          console.error('[MongoDB]    2. Verify cluster is running (not paused)')
          console.error('[MongoDB]    3. Try Standard Connection String instead of SRV')
          console.error('[MongoDB]    4. Check firewall/antivirus settings')
        }
        if (allowOfflineDev) {
          console.warn('[MongoDB] ⚠️ ALLOW_OFFLINE_DEV is enabled; continuing in offline dev mode.')
          console.warn('[MongoDB] ⚠️ Database-backed APIs may return 500 until MongoDB is reachable.')
          return mongoClient
        }
        throw error
      }
    })()
  } else {
    globalForMongo._mongoClientPromise = mongoClient.connect()
  }
}

const clientPromise = globalForMongo._mongoClientPromise

// Wrap the primary client promise with the transparent secondary sync proxy.
// Every write that goes through this promise is automatically mirrored to
// SECONDARY_MONGODB_URI after a successful primary write — reads are unchanged.
// Shop scope then forces shop-owned reads and writes onto the authorized shop.
const syncedClientPromise: Promise<MongoClient> = clientPromise.then(async (client) => {
  const { wrapClientWithShopScope } = await import('./shops/scoped-collection')
  return wrapClientWithShopScope(wrapClientWithSync(client))
})

// Helper function to get database
export async function getDatabase(dbName: string = 'infusion_jaba') {
  const client = await syncedClientPromise
  return client.db(dbName)
}

export default syncedClientPromise

