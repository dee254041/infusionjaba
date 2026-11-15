import { describe, expect, it } from 'vitest'
import {
  isAllowedBottledWaterSize,
  isBottledWaterPackaging,
  isFillableWaterRawMaterial,
  isWaterProductSticker,
} from '@/lib/jaba-bottled-water'
import { isSizeBottleName } from '@/lib/jaba-packaging-materials'

describe('jaba bottled water helpers', () => {
  it('identifies fillable water raw materials and ignores packaging / flavour items', () => {
    expect(isFillableWaterRawMaterial({ name: 'Distilled Water', category: 'Base', unit: 'litres' })).toBe(true)
    expect(isFillableWaterRawMaterial({ name: 'Purified Water', category: 'Base', unit: 'L' })).toBe(true)
    expect(isFillableWaterRawMaterial({ name: '500ml Water Stickers', category: 'Packaging', unit: 'pcs' })).toBe(false)
    expect(isFillableWaterRawMaterial({ name: '500ml Bottles', category: 'Packaging', unit: 'pcs' })).toBe(false)
    expect(isFillableWaterRawMaterial({ name: 'Watermelon Extract', category: 'Flavoring', unit: 'litres' })).toBe(false)
  })

  it('identifies water stickers by flavour tag or name', () => {
    expect(isWaterProductSticker({ name: '500ml Water Stickers', packagingStickerFlavor: 'Water' })).toBe(true)
    expect(isWaterProductSticker({ name: '1L Water Stickers' })).toBe(true)
    expect(isWaterProductSticker({ name: '500ml Dawa Stickers', packagingStickerFlavor: 'Dawa' })).toBe(false)
    expect(isWaterProductSticker({ name: '500ml Watermelon Stickers', packagingStickerFlavor: 'Watermelon' })).toBe(false)
  })

  it('only allows 500ml and 1L bottled water sizes', () => {
    expect(isAllowedBottledWaterSize('500ml')).toBe(true)
    expect(isAllowedBottledWaterSize('1L')).toBe(true)
    expect(isAllowedBottledWaterSize('250ml')).toBe(false)
    expect(isAllowedBottledWaterSize('2L')).toBe(false)
  })

  it('treats 500ml and 1L bottles as bottles, and leaves stickers alone', () => {
    expect(isSizeBottleName('500ml Bottles', '500ml')).toBe(true)
    expect(isSizeBottleName('1L Bottles', '1L')).toBe(true)
    expect(isSizeBottleName('500ml Water Stickers', '500ml')).toBe(false)
    expect(isSizeBottleName('1L Water Stickers', '1L')).toBe(false)
    expect(isSizeBottleName('500ml Bottles', '1L')).toBe(false)
  })

  it('detects bottled water packaging documents', () => {
    expect(isBottledWaterPackaging({ productKind: 'bottled_water' })).toBe(true)
    expect(isBottledWaterPackaging({ flavourName: 'Dawa' })).toBe(false)
  })
})
