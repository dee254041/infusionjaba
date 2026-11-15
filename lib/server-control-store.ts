import { createHash, timingSafeEqual } from 'crypto'
import clientPromise from '@/lib/mongodb'
import { SERVER_CONTROL_EMAIL, readServerControlSession } from '@/lib/server-control'
import { dummyControlPasswordHash, verifyControlPassword } from '@/lib/server-control-password'

const DOC_ID = 'public_site'
const ACCOUNT_LOCK = 'lock:account'
const LOCK_MS = 15 * 60 * 1000
const MAX_FAILS = 5

export type ControlAuth = {
  online: boolean
  passwordHash: string | null
  tokenVersion: number
}

async function controlCollection() {
  const client = await clientPromise
  return client.db('infusion_jaba').collection('system_control')
}

export async function readControlAuth(): Promise<ControlAuth> {
  const doc = await (await controlCollection()).findOne({ _id: DOC_ID }, { maxTimeMS: 700 })
  return {
    online: !doc || doc.online !== false,
    passwordHash: typeof doc?.passwordHash === 'string' && doc.passwordHash ? doc.passwordHash : null,
    tokenVersion: Number.isInteger(doc?.tokenVersion) && doc.tokenVersion >= 0 ? doc.tokenVersion : 0,
  }
}

export async function readPublicSiteOnline(): Promise<boolean> {
  return (await readControlAuth()).online
}

function lockId(ip: string): string {
  return `lock:${createHash('sha256').update(ip).digest('hex')}`
}

async function lockedId(id: string): Promise<boolean> {
  const collection = await controlCollection()
  const doc = await collection.findOne({ _id: id }, { maxTimeMS: 700 })
  if (!doc?.lockedUntil) return false
  const until = new Date(doc.lockedUntil).getTime()
  if (until > Date.now()) return true
  await collection.deleteOne({ _id: id })
  return false
}

export async function loginLocked(ip: string): Promise<boolean> {
  return (await lockedId(lockId(ip))) || (await lockedId(ACCOUNT_LOCK))
}

async function bumpLock(id: string): Promise<void> {
  const collection = await controlCollection()
  const doc = await collection.findOne({ _id: id })
  const fails = (Number(doc?.fails) || 0) + 1
  if (fails >= MAX_FAILS) {
    await collection.updateOne(
      { _id: id },
      { $set: { fails: 0, lockedUntil: new Date(Date.now() + LOCK_MS) } },
      { upsert: true }
    )
    return
  }
  await collection.updateOne({ _id: id }, { $set: { fails, lockedUntil: null } }, { upsert: true })
}

export async function markLoginFailure(ip: string): Promise<void> {
  await bumpLock(lockId(ip))
  await bumpLock(ACCOUNT_LOCK)
}

export async function clearLoginFailures(ip: string): Promise<void> {
  const collection = await controlCollection()
  await collection.deleteOne({ _id: lockId(ip) })
  await collection.deleteOne({ _id: ACCOUNT_LOCK })
}

export async function passwordMatches(password: string, passwordHash: string | null): Promise<boolean> {
  if (passwordHash) return verifyControlPassword(password, passwordHash)
  await verifyControlPassword(String(password || ''), await dummyControlPasswordHash())
  const entered = createHash('sha256').update(String(password || '')).digest()
  const bootstrap = createHash('sha256').update(SERVER_CONTROL_EMAIL).digest()
  return timingSafeEqual(entered, bootstrap)
}

export async function saveControlPassword(passwordHash: string, email: string): Promise<number> {
  const collection = await controlCollection()
  const existing = await collection.findOne({ _id: DOC_ID }, { projection: { tokenVersion: 1, online: 1 } })
  const tokenVersion = (Number.isInteger(existing?.tokenVersion) ? Number(existing.tokenVersion) : 0) + 1
  await collection.updateOne(
    { _id: DOC_ID },
    {
      $set: {
        passwordHash,
        tokenVersion,
        passwordUpdatedAt: new Date(),
        updatedAt: new Date(),
        updatedBy: email,
        online: existing ? existing.online !== false : true,
      },
    },
    { upsert: true }
  )
  return tokenVersion
}

export async function restoreBootstrapPassword(email: string): Promise<number> {
  const collection = await controlCollection()
  const existing = await collection.findOne({ _id: DOC_ID }, { projection: { tokenVersion: 1, online: 1 } })
  const tokenVersion = (Number.isInteger(existing?.tokenVersion) ? Number(existing.tokenVersion) : 0) + 1
  await collection.updateOne(
    { _id: DOC_ID },
    {
      $set: {
        tokenVersion,
        passwordUpdatedAt: new Date(),
        updatedAt: new Date(),
        updatedBy: email,
        online: existing ? existing.online !== false : true,
      },
      $unset: { passwordHash: '' },
    },
    { upsert: true }
  )
  return tokenVersion
}

export async function requireControlRequest(token: string | undefined | null) {
  const session = await readServerControlSession(token)
  if (!session) return null
  const auth = await readControlAuth()
  if (session.version !== auth.tokenVersion) return null
  return { email: session.email, ...auth }
}

export async function writePublicSiteOnline(online: boolean, email: string): Promise<void> {
  const client = await clientPromise
  await client.db('infusion_jaba').collection('system_control').updateOne(
    { _id: DOC_ID },
    { $set: { online, updatedAt: new Date(), updatedBy: email } },
    { upsert: true }
  )
}
