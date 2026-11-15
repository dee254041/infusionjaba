import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'crypto'
import { promisify } from 'util'
import { SERVER_CONTROL_EMAIL } from '@/lib/server-control'

const scrypt = promisify(scryptCb)
const KEY_LEN = 64

export function passwordChangeError(nextPassword: string): string | null {
  const next = String(nextPassword || '')
  if (next.length < 12) return 'Use at least 12 characters.'
  if (next.length > 200) return 'Password is too long.'
  if (next.toLowerCase() === SERVER_CONTROL_EMAIL) return 'Choose a password that is not the email.'
  return null
}

export async function hashControlPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = (await scrypt(password, salt, KEY_LEN)) as Buffer
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`
}

export async function verifyControlPassword(password: string, stored: string): Promise<boolean> {
  const [kind, saltB64, keyB64] = String(stored || '').split('$')
  if (kind !== 'scrypt' || !saltB64 || !keyB64) return false
  let salt: Buffer
  let expected: Buffer
  try {
    salt = Buffer.from(saltB64, 'base64')
    expected = Buffer.from(keyB64, 'base64')
  } catch {
    return false
  }
  if (!salt.length || !expected.length) return false
  const actual = (await scrypt(password, salt, expected.length)) as Buffer
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}

let dummyHash: Promise<string> | null = null

export function dummyControlPasswordHash(): Promise<string> {
  if (!dummyHash) dummyHash = hashControlPassword(`unused-${SERVER_CONTROL_EMAIL}`)
  return dummyHash
}
