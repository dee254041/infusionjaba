/**
 * Ecommerce delivery area. Used only by the online shop checkout.
 * Nairobi County bounds (approx.): north Ruiru border, south national park,
 * west Dagoretti, east Njiru.
 */
export const NAIROBI_BOUNDS = {
  minLat: -1.4441,
  maxLat: -1.1636,
  minLng: 36.6666,
  maxLng: 37.104,
} as const

const OUTSIDE_NAIROBI_PLACES = [
  'mombasa',
  'kisumu',
  'nakuru',
  'eldoret',
  'machakos',
  'nyeri',
  'kilifi',
  'malindi',
  'nanyuki',
  'naivasha',
  'kitale',
  'garissa',
  'kisii',
  'kakamega',
  'embu',
  'kericho',
  'migori',
  'lamu',
  'ukunda',
  'diani',
  'watamu',
  'lodwar',
  'isiolo',
  'kitui',
  'ruiru',
  'kiambu',
  'kitengela',
  'athi river',
] as const

export function isWithinNairobi(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= NAIROBI_BOUNDS.minLat &&
    lat <= NAIROBI_BOUNDS.maxLat &&
    lng >= NAIROBI_BOUNDS.minLng &&
    lng <= NAIROBI_BOUNDS.maxLng
  )
}

export function isEcommercePickup(deliveryOption: string | null | undefined): boolean {
  return String(deliveryOption || '').trim().toLowerCase().startsWith('collect_')
}

/** Place name when the written address is clearly outside Nairobi. Thika Road stays allowed. */
export function outsideNairobiPlaceInText(text: string): string | null {
  const value = text.toLowerCase()
  if (/\bathi\s+river\b/.test(value)) return 'Athi River'
  if (/\bthika\b/.test(value) && !/\bthika\s+(road|superhighway|highway)\b/.test(value)) return 'Thika'
  for (const place of OUTSIDE_NAIROBI_PLACES) {
    if (place === 'athi river') continue
    const pattern = new RegExp(`\\b${place.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
    if (pattern.test(value)) {
      return place.replace(/\b\w/g, (c) => c.toUpperCase())
    }
  }
  return null
}

export function nairobiDeliveryBlockReason(input: {
  deliveryOption?: string | null
  address?: string | null
  notes?: string | null
  lat?: number | null
  lng?: number | null
}): string | null {
  if (isEcommercePickup(input.deliveryOption)) return null

  const lat = input.lat
  const lng = input.lng
  if (typeof lat === 'number' && typeof lng === 'number' && !isWithinNairobi(lat, lng)) {
    return 'Online delivery is only available within Nairobi. Choose a Nairobi address, or pick up at Catha Lounge.'
  }

  const place = outsideNairobiPlaceInText(`${input.address || ''} ${input.notes || ''}`)
  if (place) {
    return `We can't deliver to ${place}. Online delivery is only available within Nairobi.`
  }

  return null
}
