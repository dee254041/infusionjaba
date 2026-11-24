import { CATHA_LOUNGE_SHOP_ID } from './constants'

const RESERVED = new Set([
  'catha',
  'catha-lounge',
  'admin',
  'api',
  'menu',
  'jaba',
  'shop',
  'new',
  'login',
  'settings',
])

export type CreateShopInput = {
  name: string
  slug: string
  location: string
  phone: string
  email: string
  logoUrl: string
  status: 'active' | 'inactive'
  adminEmail: string
}

export function normalizeShopSlug(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

export function validateCreateShopInput(body: unknown): { ok: true; value: CreateShopInput } | { ok: false; error: string } {
  const src = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const name = String(src.name || '').trim()
  const slug = normalizeShopSlug(String(src.slug || src.code || ''))
  const location = String(src.location || src.branch || '').trim()
  const phone = String(src.phone || src.contactPhone || '').trim()
  const email = String(src.email || src.contactEmail || '').trim()
  const logoUrl = String(src.logoUrl || src.logo || '').trim()
  const adminEmail = String(src.adminEmail || src.initialAdminEmail || '').trim().toLowerCase()
  const statusRaw = String(src.status || 'active').trim().toLowerCase()
  const activeFlag = src.active

  if (name.length < 2 || name.length > 80) {
    return { ok: false, error: 'Shop name must be between 2 and 80 characters.' }
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length < 2) {
    return { ok: false, error: 'Shop code must use lowercase letters, numbers, and hyphens.' }
  }
  if (RESERVED.has(slug) && slug !== CATHA_LOUNGE_SHOP_ID) {
    return { ok: false, error: 'That shop code is reserved.' }
  }
  if (slug === CATHA_LOUNGE_SHOP_ID) {
    return { ok: false, error: 'Catha Lounge already exists.' }
  }
  if (location.length > 160) return { ok: false, error: 'Location is too long.' }
  if (phone.length > 40) return { ok: false, error: 'Phone number is too long.' }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'Contact email is not valid.' }
  }
  if (adminEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
    return { ok: false, error: 'Administrator email is not valid.' }
  }
  if (logoUrl && logoUrl.length > 800) return { ok: false, error: 'Logo URL is too long.' }
  if (logoUrl && !/^https?:\/\//i.test(logoUrl)) {
    return { ok: false, error: 'Logo must be an http or https URL.' }
  }

  let status: 'active' | 'inactive' = statusRaw === 'inactive' ? 'inactive' : 'active'
  if (activeFlag === false || activeFlag === 'false') status = 'inactive'
  if (activeFlag === true || activeFlag === 'true') status = 'active'

  return {
    ok: true,
    value: { name, slug, location, phone, email, logoUrl, status, adminEmail },
  }
}
