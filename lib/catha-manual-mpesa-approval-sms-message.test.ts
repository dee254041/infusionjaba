import { describe, expect, it } from 'vitest'
import { buildManualPaymentAlertSms } from '@/lib/catha-manual-mpesa-approval-sms-message'

describe('buildManualPaymentAlertSms', () => {
  it('asks the admin to confirm a new manual payment', () => {
    const message = buildManualPaymentAlertSms(
      {
        transactionCode: 'UJL7XB1WCT',
        orderId: 'ECO36988328',
        amount: 2400,
        enteredBy: 'Jane',
        notes: 'Callback missed',
        phone: '+254712345678',
        customerName: 'Victor',
      },
      'https://www.infusionjaba.co.ke/catha/manual-mpesa-review?token=abc',
      60
    )
    expect(message).toContain('manual payment was just added')
    expect(message).toContain('confirm it as soon as you can')
    expect(message).toContain('ECO36988328')
    expect(message).toContain('UJL7XB1WCT')
    expect(message).toContain('Victor')
    expect(message).toContain('+254712345678')
    expect(message).toContain('sign in as admin')
    expect(message).toContain('https://www.infusionjaba.co.ke/catha/manual-mpesa-review?token=abc')
  })
})
