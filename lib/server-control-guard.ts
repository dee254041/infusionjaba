import { NextResponse } from 'next/server'

const MAX_BODY = 4096

export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  return (forwarded?.split(',')[0] || request.headers.get('x-real-ip') || 'unknown').trim().slice(0, 80)
}

/** Cross-site posts cannot use the control API. Same-site browser calls send Origin. */
export function isSameOriginControlPost(request: Request): boolean {
  const fetchSite = request.headers.get('sec-fetch-site')
  if (fetchSite === 'cross-site') return false
  const host = request.headers.get('host')
  const origin = request.headers.get('origin')
  if (!host || !origin) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

export function rejectCrossSite(): NextResponse {
  return NextResponse.json({ error: 'Rejected' }, { status: 403 })
}

export async function readJsonBody(request: Request): Promise<unknown | null> {
  const type = request.headers.get('content-type') || ''
  if (!type.toLowerCase().includes('application/json')) return null
  const declared = Number(request.headers.get('content-length') || 0)
  if (declared > MAX_BODY) return null
  const text = await request.text()
  if (text.length > MAX_BODY) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export function applyControlHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'no-referrer')
  response.headers.set('Cache-Control', 'no-store')
  return response
}

export async function holdMinimum(startedMs: number, minimumMs = 700) {
  const wait = minimumMs - (Date.now() - startedMs)
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
}
