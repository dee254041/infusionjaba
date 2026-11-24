import { createHmac, timingSafeEqual } from 'node:crypto'

export type ActiveShopCookie = {
  shopId: string
  userId: string
  exp: number
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

export function sealActiveShopCookie(value: ActiveShopCookie, secret: string): string {
  const payload = Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
  return `${payload}.${sign(payload, secret)}`
}

export function openActiveShopCookie(token: string | undefined | null, secret: string): ActiveShopCookie | null {
  if (!token || !secret) return null
  const [payload, mac] = String(token).split('.')
  if (!payload || !mac) return null
  const expected = sign(payload, secret)
  const a = Buffer.from(mac)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as ActiveShopCookie
    if (!parsed || typeof parsed.shopId !== 'string' || typeof parsed.userId !== 'string') return null
    if (typeof parsed.exp !== 'number' || parsed.exp < Date.now()) return null
    return parsed
  } catch {
    return null
  }
}

export function shopCookieSecret(): string {
  return process.env.AUTH_SECRET_CATHA || process.env.NEXTAUTH_SECRET || 'catha-shop-dev'
}
