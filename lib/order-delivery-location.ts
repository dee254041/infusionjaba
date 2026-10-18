/**
 * Client-safe helpers for online-order delivery location (GPS pin + address text).
 */

export type DeliveryLocation = {
  lat: number
  lng: number
  /** Meters, from the browser Geolocation API */
  accuracy?: number | null
}

export type OrderDeliveryInfo = {
  address: string
  notes: string
  option: string
  location: DeliveryLocation | null
  mapsUrl: string | null
  /** Dialable phone with leading + when known */
  phone: string | null
}

export function isValidLatLng(lat: unknown, lng: unknown): boolean {
  const la = Number(lat)
  const ln = Number(lng)
  return (
    Number.isFinite(la) &&
    Number.isFinite(ln) &&
    la >= -90 &&
    la <= 90 &&
    ln >= -180 &&
    ln <= 180 &&
    !(la === 0 && ln === 0)
  )
}

export function buildGoogleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}`
}

export function parseDeliveryLocation(raw: unknown): DeliveryLocation | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const lat = Number(o.lat ?? o.latitude)
  const lng = Number(o.lng ?? o.lon ?? o.longitude)
  if (!isValidLatLng(lat, lng)) return null
  const accRaw = Number(o.accuracy)
  return {
    lat,
    lng,
    accuracy: Number.isFinite(accRaw) && accRaw >= 0 ? Math.round(accRaw) : null,
  }
}

/** Normalize phone for tel: links (keeps leading +). */
export function toTelHref(phone: string | null | undefined): string | null {
  const p = String(phone ?? '').replace(/[^\d+]/g, '')
  if (!p) return null
  return `tel:${p}`
}

/** Read delivery details from any order document / API row (online orders only carry most of these). */
export function getOrderDeliveryInfo(order: unknown): OrderDeliveryInfo | null {
  if (!order || typeof order !== 'object') return null
  const o = order as Record<string, unknown>
  const location = parseDeliveryLocation(o.deliveryLocation)
  const address = String(o.deliveryAddress ?? '').trim()
  const notes = String(o.deliveryNotes ?? '').trim()
  const option = String(o.deliveryOption ?? '').trim()
  const phone = String(o.customerPhone ?? '').trim() || null
  const storedUrl = String(o.deliveryMapsUrl ?? '').trim()
  const mapsUrl = location
    ? buildGoogleMapsUrl(location.lat, location.lng)
    : storedUrl.startsWith('https://')
      ? storedUrl
      : null

  if (!address && !notes && !location && !mapsUrl) return null
  return { address, notes, option, location, mapsUrl, phone }
}

/** Short SMS-friendly location text. */
export function formatDeliveryForSms(order: unknown): string {
  const info = getOrderDeliveryInfo(order)
  if (!info) return ''
  const parts: string[] = []
  if (info.address) parts.push(`Deliver: ${info.address}`)
  if (info.notes) parts.push(`Note: ${info.notes}`)
  if (info.mapsUrl) parts.push(`Map: ${info.mapsUrl}`)
  return parts.join('\n')
}
