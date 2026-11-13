export function buildManualPaymentAlertSms(
  verification: {
    transactionCode: string
    orderId: string
    amount: number
    enteredBy: string
    notes?: string | null
    phone?: string | null
    customerName?: string | null
  },
  approveUrl: string,
  minsLeft: number
): string {
  const amount = Number(verification.amount || 0)
  const kes = Number.isFinite(amount)
    ? amount.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
    : '0'
  const lines = [
    'Catha Lounge: a manual payment was just added.',
    'Please confirm it as soon as you can.',
    `Order: ${verification.orderId}`,
    `Amount: KES ${kes}`,
    `M-Pesa code: ${verification.transactionCode}`,
  ]
  if (verification.customerName) lines.push(`Customer: ${verification.customerName}`)
  if (verification.phone) lines.push(`Customer phone: ${verification.phone}`)
  if (verification.enteredBy) lines.push(`Entered by: ${verification.enteredBy}`)
  if (verification.notes) lines.push(`Note: ${verification.notes.slice(0, 80)}`)
  lines.push(`Confirm here after you sign in as admin: ${approveUrl}`)
  lines.push(`This link expires in ${minsLeft} min and stops working as soon as you decide.`)
  return lines.join('\n')
}
