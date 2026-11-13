const SMS_SOFT_MAX = 680
const MAX_LINES = 8

export type RawMaterialStockChange = {
  name: string
  unit?: string
  beforeStock: number
  afterStock: number
  minStock?: number
  reorderLevel?: number
}

type AlertKind = 'min' | 'reorder'

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export function formatStockQty(n: number): string {
  if (!Number.isFinite(n)) return '0'
  if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n))
  return n.toFixed(2).replace(/\.?0+$/, '')
}

export function classifyRawMaterialThresholdCrossing(
  change: RawMaterialStockChange
): AlertKind | null {
  const before = num(change.beforeStock)
  const after = num(change.afterStock)
  if (after >= before) return null

  const minStock = num(change.minStock)
  const reorderLevel = num(change.reorderLevel)

  const crossedMin = minStock > 0 && before > minStock && after <= minStock
  const crossedReorder = reorderLevel > 0 && before > reorderLevel && after <= reorderLevel

  if (crossedMin) return 'min'
  if (crossedReorder) return 'reorder'
  return null
}

function clipSms(text: string): string {
  const t = text.trim()
  if (t.length <= SMS_SOFT_MAX) return t
  return `${t.slice(0, SMS_SOFT_MAX - 3)}...`
}

export function buildRawMaterialLowStockSms(
  items: RawMaterialStockChange[],
  events: { rawMaterialMinStock: boolean; rawMaterialReorder: boolean }
): string | null {
  const lines: string[] = []
  for (const item of items) {
    const kind = classifyRawMaterialThresholdCrossing(item)
    if (!kind) continue
    const wantMin = kind === 'min' && events.rawMaterialMinStock
    const wantReorder =
      (kind === 'reorder' && events.rawMaterialReorder) ||
      (kind === 'min' && !events.rawMaterialMinStock && events.rawMaterialReorder)
    if (!wantMin && !wantReorder) continue

    const name = String(item.name || 'Material').trim() || 'Material'
    const unit = String(item.unit || '').trim()
    const unitSuffix = unit ? ` ${unit}` : ''
    const after = formatStockQty(num(item.afterStock))
    const minStock = num(item.minStock)
    const reorderLevel = num(item.reorderLevel)

    if (wantMin) {
      lines.push(
        `${name}: ${after}${unitSuffix} (at/below min ${formatStockQty(minStock)}${unitSuffix})`
      )
    } else {
      lines.push(
        `${name}: ${after}${unitSuffix} (at/below reorder ${formatStockQty(reorderLevel)}${unitSuffix})`
      )
    }
  }

  if (lines.length === 0) return null

  const shown = lines.slice(0, MAX_LINES)
  const extra = lines.length - shown.length
  const extraLine = extra > 0 ? `\n+${extra} more` : ''
  return clipSms(`Jaba stock alert\n${shown.join('\n')}${extraLine}`)
}

export async function notifyJabaRawMaterialStockAlerts(items: RawMaterialStockChange[]) {
  if (!items.length) return
  try {
    const { getJabaSmsSettings, sendJabaSmsStrict } = await import('@/lib/jaba-sms')
    const settings = await getJabaSmsSettings()
    if (!settings.enabled) {
      console.log('[Jaba SMS] Raw material stock alerts skipped: notifications disabled')
      return
    }
    const message = buildRawMaterialLowStockSms(items, settings.events)
    if (!message) return
    console.log(`[Jaba SMS] Raw material stock alert sending to ${settings.numbers.length} recipients`)
    await sendJabaSmsStrict(message, settings.numbers)
  } catch (error) {
    console.error('[Jaba SMS] Failed to send raw material stock alert:', error)
  }
}
