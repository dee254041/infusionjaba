import { getNairobiWallParts, parseHHmmToMinutes } from '@/lib/ecommerce-opening-hours'

export type LoungeTradingStatus = {
  open: boolean
  message: string
  openingTime: string
  closingTime: string
}

/** True during the lounge day, from opening time until closing time (Nairobi). */
export function evaluateLoungeTradingHours(
  openingTime: string,
  closingTime: string,
  now = new Date(),
  blockAfterHours = true
): LoungeTradingStatus {
  if (!blockAfterHours) {
    return { open: true, message: '', openingTime, closingTime }
  }
  const openM = parseHHmmToMinutes(openingTime)
  const closeM = parseHHmmToMinutes(closingTime)
  if (openM === null || closeM === null || closeM <= openM) {
    return { open: true, message: '', openingTime, closingTime }
  }
  const { minutesSinceMidnight } = getNairobiWallParts(now)
  const open = minutesSinceMidnight >= openM && minutesSinceMidnight < closeM
  if (open) return { open: true, message: '', openingTime, closingTime }
  return {
    open: false,
    message: `The lounge is closed. New transactions open again at ${openingTime}.`,
    openingTime,
    closingTime,
  }
}

export async function getLoungeTradingStatus(now = new Date()): Promise<LoungeTradingStatus> {
  const { getShiftSettings } = await import('@/lib/models/shift-setting')
  const settings = await getShiftSettings()
  return evaluateLoungeTradingHours(
    settings.openingTime,
    settings.closingTime,
    now,
    settings.blockAfterHoursTransactions !== false
  )
}
