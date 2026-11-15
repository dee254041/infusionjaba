import { existsSync } from 'fs'
import { config as loadEnv } from 'dotenv'
import { MongoClient } from 'mongodb'
import { ensureJabaSizeBottles } from '../lib/jaba-packaging-materials'

loadEnv({ path: existsSync('.env.local') ? '.env.local' : '.env' })

const MONGODB_URI = process.env.MONGODB_URI

if (!MONGODB_URI) {
  throw new Error('MONGODB_URI is not set. Add it to .env.local, then run this script again.')
}

async function main() {
  const client = new MongoClient(MONGODB_URI!, { serverSelectionTimeoutMS: 8000 })
  try {
    await client.connect()
    const result = await ensureJabaSizeBottles(client.db('infusion_jaba'))
    console.log('Jaba 500ml and 1L bottles ready')
    console.log(`Inserted: ${result.inserted.length}`)
    console.log(`Already present: ${result.existing.length}`)
  } finally {
    await client.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
