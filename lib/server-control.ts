export const SERVER_CONTROL_EMAIL = 'dee254041@gmail.com'
export const SERVER_CONTROL_COOKIE = 'srv.session'
export const SERVER_CONTROL_MAX_AGE_SEC = 12 * 60 * 60

export function isServerControlEmail(email: unknown): boolean {
  return String(email || '').trim().toLowerCase() === SERVER_CONTROL_EMAIL
}

export function serverControlSigningSecret(): string | null {
  const secret =
    process.env.SERVER_CONTROL_SECRET ||
    process.env.AUTH_SECRET_JABA ||
    process.env.NEXTAUTH_SECRET ||
    ''
  return secret.length >= 16 ? secret : null
}

function bytesToB64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
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

async function hmacSha256(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return new Uint8Array(sig)
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

export async function signServerControlSession(
  email: string,
  tokenVersion = 0,
  nowMs = Date.now()
): Promise<string | null> {
  const secret = serverControlSigningSecret()
  if (!secret || !isServerControlEmail(email)) return null
  const version = Number.isInteger(tokenVersion) && tokenVersion >= 0 ? tokenVersion : 0
  const payload = bytesToB64Url(
    new TextEncoder().encode(
      JSON.stringify({
        e: SERVER_CONTROL_EMAIL,
        v: version,
        exp: Math.floor(nowMs / 1000) + SERVER_CONTROL_MAX_AGE_SEC,
      })
    )
  )
  const sig = bytesToB64Url(await hmacSha256(secret, payload))
  return `${payload}.${sig}`
}

export async function readServerControlSession(
  token: string | undefined | null
): Promise<{ email: string; version: number } | null> {
  const secret = serverControlSigningSecret()
  if (!secret || !token || !token.includes('.')) return null
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null
  const expected = await hmacSha256(secret, payload)
  let actual: Uint8Array
  try {
    actual = b64UrlToBytes(sig)
  } catch {
    return null
  }
  if (!sameBytes(expected, actual)) return null
  try {
    const json = JSON.parse(new TextDecoder().decode(b64UrlToBytes(payload))) as {
      e?: string
      exp?: number
      v?: number
    }
    if (!isServerControlEmail(json.e)) return null
    if (!json.exp || json.exp < Math.floor(Date.now() / 1000)) return null
    const version = Number.isInteger(json.v) && (json.v as number) >= 0 ? (json.v as number) : 0
    return { email: SERVER_CONTROL_EMAIL, version }
  } catch {
    return null
  }
}
