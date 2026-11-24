export type StationRole = 'OWNER' | 'STAFF'

export type StationSession = {
  shopId: string
  userId: string
  role: StationRole
  name: string
  exp: number
}

export function stationCookieName(slug: string): string {
  return `station.${slug}.session`
}

function secretOrThrow(secret: string): string {
  if (!secret) throw new Error('Station auth secret is not set')
  return secret
}

export function stationAuthSecret(): string {
  return process.env.AUTH_SECRET_CATHA || process.env.NEXTAUTH_SECRET || ''
}

function bytesToB64Url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function b64UrlToBytes(value: string): Uint8Array {
  const pad = value.length % 4 === 0 ? '' : '='.repeat(4 - (value.length % 4))
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/') + pad
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function sign(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  return bytesToB64Url(new Uint8Array(sig))
}

export async function signStationToken(
  input: Omit<StationSession, 'exp'> & { exp?: number },
  secret: string,
  now = Date.now(),
): Promise<string> {
  const payload: StationSession = {
    shopId: input.shopId,
    userId: input.userId,
    role: input.role,
    name: input.name,
    exp: input.exp ?? now + 14 * 24 * 60 * 60 * 1000,
  }
  const body = bytesToB64Url(new TextEncoder().encode(JSON.stringify(payload)))
  return `${body}.${await sign(body, secretOrThrow(secret))}`
}

export async function verifyStationToken(token: string, secret: string, now = Date.now()): Promise<StationSession | null> {
  const [body, sig] = String(token || '').split('.')
  if (!body || !sig || !secret) return null
  const expected = await sign(body, secret)
  if (expected.length !== sig.length) return null
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i)
  if (diff !== 0) return null
  try {
    const json = new TextDecoder().decode(b64UrlToBytes(body))
    const payload = JSON.parse(json) as StationSession
    if (!payload?.shopId || !payload.userId || !payload.exp) return null
    if (payload.role !== 'OWNER' && payload.role !== 'STAFF') return null
    if (payload.exp < now) return null
    return payload
  } catch {
    return null
  }
}
