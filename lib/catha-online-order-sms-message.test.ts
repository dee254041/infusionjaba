import { describe, expect, it } from 'vitest'
import { buildOnlineOrderSmsMessage } from '@/lib/catha-online-order-sms-message'

describe('buildOnlineOrderSmsMessage', () => {
  it('sends the client phone and a clickable maps link for a written address', () => {
    const message = buildOnlineOrderSmsMessage({
      id: 'ECO36988328',
      tableNumber: 'lavington',
      total: 300,
      customerName: 'Victor',
      customerPhone: '+254712345678',
      deliveryAddress: 'Deliver to: Anglican heights apartments, d2',
    })
    expect(message).toContain('Phone: +254712345678')
    expect(message).toContain('Customer: Victor')
    expect(message).not.toContain('google:')
    expect(message).toContain('https://www.google.com/maps/search/?api=1&query=')
    expect(message).toContain('Anglican%20heights%20apartments')
  })

  it('uses the GPS pin link and skips a Google sign-in id', () => {
    const message = buildOnlineOrderSmsMessage({
      id: 'ECO1',
      total: 100,
      customerName: 'Victor',
      customerPhone: 'google:109737181028113186610',
      deliveryLocation: { lat: -1.2921, lng: 36.8219, accuracy: 12 },
    })
    expect(message).not.toContain('Phone:')
    expect(message).not.toContain('google:')
    expect(message).toContain('https://www.google.com/maps/search/?api=1&query=-1.292100,36.821900')
  })
})