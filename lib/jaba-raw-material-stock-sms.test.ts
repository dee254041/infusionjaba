import { describe, expect, it } from 'vitest'
import {
  buildRawMaterialLowStockSms,
  classifyRawMaterialThresholdCrossing,
} from '@/lib/jaba-raw-material-stock-sms'

const bothOn = { rawMaterialMinStock: true, rawMaterialReorder: true }

describe('classifyRawMaterialThresholdCrossing', () => {
  it('alerts min when stock crosses min (even if reorder also crossed)', () => {
    expect(
      classifyRawMaterialThresholdCrossing({
        name: 'Honey',
        beforeStock: 120,
        afterStock: 40,
        minStock: 50,
        reorderLevel: 100,
      })
    ).toBe('min')
  })

  it('alerts reorder when stock crosses reorder but stays above min', () => {
    expect(
      classifyRawMaterialThresholdCrossing({
        name: 'Honey',
        beforeStock: 120,
        afterStock: 90,
        minStock: 50,
        reorderLevel: 100,
      })
    ).toBe('reorder')
  })

  it('does not alert when already below the threshold', () => {
    expect(
      classifyRawMaterialThresholdCrossing({
        name: 'Honey',
        beforeStock: 40,
        afterStock: 30,
        minStock: 50,
        reorderLevel: 100,
      })
    ).toBeNull()
  })

  it('does not alert on restock increases', () => {
    expect(
      classifyRawMaterialThresholdCrossing({
        name: 'Honey',
        beforeStock: 40,
        afterStock: 200,
        minStock: 50,
        reorderLevel: 100,
      })
    ).toBeNull()
  })
})

describe('buildRawMaterialLowStockSms', () => {
  it('builds a min-stock message', () => {
    const msg = buildRawMaterialLowStockSms(
      [
        {
          name: 'Honey',
          unit: 'kg',
          beforeStock: 60,
          afterStock: 40,
          minStock: 50,
          reorderLevel: 100,
        },
      ],
      bothOn
    )
    expect(msg).toContain('Jaba stock alert')
    expect(msg).toContain('Honey: 40 kg')
    expect(msg).toContain('min 50')
  })

  it('skips min lines when min toggle is off but still sends reorder if that crossed', () => {
    const msg = buildRawMaterialLowStockSms(
      [
        {
          name: 'Bottles',
          unit: 'pcs',
          beforeStock: 1500,
          afterStock: 900,
          minStock: 400,
          reorderLevel: 1000,
        },
      ],
      { rawMaterialMinStock: false, rawMaterialReorder: true }
    )
    expect(msg).toContain('reorder 1000')
  })
})
