import { NextResponse } from 'next/server'
import { SERVER_CONTROL_COOKIE, SERVER_CONTROL_MAX_AGE_SEC } from '@/lib/server-control'

export function controlCookieSecure(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.NEXTAUTH_URL?.startsWith('https://') === true
}

export function attachControlCookie(response: NextResponse, token: string) {
  response.cookies.set(SERVER_CONTROL_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: controlCookieSecure(),
    path: '/',
    maxAge: SERVER_CONTROL_MAX_AGE_SEC,
  })
}

export function clearControlCookie(response: NextResponse) {
  response.cookies.set(SERVER_CONTROL_COOKIE, '', {
    httpOnly: true,
    sameSite: 'strict',
    secure: controlCookieSecure(),
    path: '/',
    maxAge: 0,
  })
}
