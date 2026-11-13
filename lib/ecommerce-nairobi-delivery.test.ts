import { describe, expect, it } from 'vitest'
import {
  isWithinNairobi,
  nairobiDeliveryBlockReason,
} from '@/lib/ecommerce-nairobi-delivery'

describe('isWithinNairobi', () => {
  it('accepts Nairobi CBD, Westlands, and Kilimani', () => {
    expect(isWithinNairobi(-1.2864, 36.8172)).toBe(true)
    expect(isWithinNairobi(-1.267, 36.811)).toBe(true)
    expect(isWithinNairobi(-1.292, 36.786)).toBe(true)
  })

  it('rejects other Kenyan cities', () => {
    expect(isWithinNairobi(-4.0435, 39.6682)).toBe(false)
    expect(isWithinNairobi(-0.0917, 34.768)).toBe(false)
    expect(isWithinNairobi(-0.3031, 36.08)).toBe(false)
    expect(isWithinNairobi(-1.033, 37.069)).toBe(false)
  })
})

describe('nairobiDeliveryBlockReason', () => {
  it('allows lounge pickup without a pin', () => {
    expect(
      nairobiDeliveryBlockReason({
        deliveryOption: 'collect_at_catha_lodge',
        address: 'Collect at Catha Lounge',
      })
    ).toBeNull()
  })

  it('blocks a pin outside Nairobi', () => {
    expect(
      nairobiDeliveryBlockReason({
        deliveryOption: 'deliver_to_my_location',
        lat: -4.04,
        lng: 39.67,
      })
    ).toMatch(/Nairobi/)
  })

  it('allows a Nairobi pin and a Thika Road address', () => {
    expect(
      nairobiDeliveryBlockReason({
        deliveryOption: 'kilimani',
        lat: -1.292,
        lng: 36.786,
        address: 'Garden City, Thika Road',
      })
    ).toBeNull()
  })

  it('blocks a written destination outside Nairobi', () => {
    expect(
      nairobiDeliveryBlockReason({
        deliveryOption: 'deliver_to_my_location',
        address: 'Nyali, Mombasa',
      })
    ).toMatch(/Mombasa/)
  })
})
