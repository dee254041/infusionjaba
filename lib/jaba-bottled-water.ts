import type { Collection, Db, Document } from 'mongodb'
import { STICKER_NAME_REGEX } from '@/lib/jaba-packaging-materials'

export const JABA_BOTTLED_WATER_PRODUCT_KIND = 'bottled_water'
export const JABA_WATER_FLAVOUR_NAME = 'Water'
export const JABA_BOTTLED_WATER_BATCH_NUMBER = 'WATER'
export const JABA_BOTTLED_WATER_BATCH_ID = 'WATER-HOUSE'
export const JABA_BOTTLED_WATER_PRODUCT_TYPE = 'Bottled Water'
export const JABA_BOTTLED_WATER_SIZES = ['500ml', '1L'] as const

export type JabaBottledWaterSize = (typeof JABA_BOTTLED_WATER_SIZES)[number]

export const JABA_BOTTLED_WATER_STICKERS: ReadonlyArray<{
  size: JabaBottledWaterSize
  name: string
  packagingStickerFlavor: typeof JABA_WATER_FLAVOUR_NAME
}> = [
  { size: '500ml', name: '500ml Water Stickers', packagingStickerFlavor: JABA_WATER_FLAVOUR_NAME },
  { size: '1L', name: '1L Water Stickers', packagingStickerFlavor: JABA_WATER_FLAVOUR_NAME },
]

const WATER_WORD = /\bwater\b/i
const WATERMELON_WORD = /\bwatermelon\b/i
const LITRE_UNIT = /^(l|lt|ltr|ltrs|litre|litres|liter|liters)$/i
const PRIMARY_SORT = { currentStock: -1, updatedAt: -1, createdAt: -1 } as const

export function isBottledWaterPackaging(doc: unknown): boolean {
  if (!doc || typeof doc !== 'object') return false
  return String((doc as { productKind?: unknown }).productKind || '') === JABA_BOTTLED_WATER_PRODUCT_KIND
}

export function isAllowedBottledWaterSize(size: string): size is JabaBottledWaterSize {
  return (JABA_BOTTLED_WATER_SIZES as readonly string[]).includes(size)
}

export function isWaterProductSticker(doc: { name?: unknown; packagingStickerFlavor?: unknown }): boolean {
  const flavor = String(doc.packagingStickerFlavor ?? '')
    .trim()
    .replace(/\s+/g, ' ')
  if (flavor.toLowerCase() === 'water') return true
  const name = String(doc.name || '')
  if (!STICKER_NAME_REGEX.test(name)) return false
  if (WATERMELON_WORD.test(name)) return false
  return WATER_WORD.test(name)
}

function compactUnit(unit: unknown): string {
  return String(unit || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
}

export function isFillableWaterRawMaterial(doc: {
  name?: unknown
  category?: unknown
  unit?: unknown
}): boolean {
  const name = String(doc.name || '')
  const category = String(doc.category || '')
  if (/packaging/i.test(category)) return false
  if (WATERMELON_WORD.test(name)) return false
  if (!WATER_WORD.test(name)) return false
  if (STICKER_NAME_REGEX.test(name)) return false
  if (/\bbott?l?e?s?\b/i.test(name)) return false

  const unit = compactUnit(doc.unit)
  if (!unit) return true
  if (LITRE_UNIT.test(unit)) return true
  if (unit.includes('kg') || unit.includes('pcs') || unit.includes('bottle')) return false
  if (unit === 'ml' || unit.endsWith('ml')) return false
  return false
}

export function mapWaterMaterial(doc: Document | null) {
  if (!doc) return null
  return {
    id: String(doc._id),
    name: String(doc.name ?? 'Water'),
    currentStock: Number(doc.currentStock) || 0,
    unit: String(doc.unit ?? 'litres'),
    category: String(doc.category ?? ''),
  }
}

export async function findWaterRawMaterials(
  rawMaterialsCollection: Collection<Document>,
  options?: { session?: import('mongodb').ClientSession }
): Promise<Document[]> {
  const opts = options?.session ? { session: options.session } : {}
  const candidates = await rawMaterialsCollection
    .find({ name: { $regex: WATER_WORD } }, opts)
    .sort(PRIMARY_SORT)
    .toArray()
  return candidates.filter((doc) => isFillableWaterRawMaterial(doc))
}

export async function findPrimaryWaterRawMaterial(
  rawMaterialsCollection: Collection<Document>,
  options?: { session?: import('mongodb').ClientSession; materialId?: string }
): Promise<Document | null> {
  if (options?.materialId) {
    const { ObjectId } = await import('mongodb')
    if (!ObjectId.isValid(options.materialId)) return null
    const doc = await rawMaterialsCollection.findOne(
      { _id: new ObjectId(options.materialId) },
      options.session ? { session: options.session } : undefined
    )
    if (doc && isFillableWaterRawMaterial(doc)) return doc
    return null
  }

  const list = await findWaterRawMaterials(rawMaterialsCollection, options)
  return list[0] ?? null
}

/**
 * Insert 500ml and 1L water sticker SKUs if they are missing.
 * New rows get currentStock = 1. Existing rows are left unchanged.
 */
export async function ensureJabaBottledWaterStickers(db: Db): Promise<{
  inserted: string[]
  existing: string[]
}> {
  const now = new Date()
  const collection = db.collection('jaba_rawMaterials')
  const inserted: string[] = []
  const existing: string[] = []

  for (const spec of JABA_BOTTLED_WATER_STICKERS) {
    const found = await collection.findOne({
      $or: [
        { name: { $regex: new RegExp(`^${spec.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
        {
          packagingStickerFlavor: { $regex: /^Water$/i },
          name: { $regex: spec.size === '1L' ? /\b1\s*l\b/i : /\b500\s*ml\b/i },
          $and: [{ name: { $regex: STICKER_NAME_REGEX } }],
        },
      ],
    })

    if (found) {
      existing.push(String(found._id))
      const patch: Record<string, unknown> = { updatedAt: now }
      if (!found.packagingStickerFlavor) patch.packagingStickerFlavor = JABA_WATER_FLAVOUR_NAME
      await collection.updateOne({ _id: found._id }, { $set: patch })
      continue
    }

    const result = await collection.insertOne({
      name: spec.name,
      category: 'Packaging',
      currentStock: 1,
      unit: 'pcs',
      minStock: 0,
      reorderLevel: 0,
      supplier: 'In-house',
      preferredSupplier: 'In-house',
      packagingStickerFlavor: JABA_WATER_FLAVOUR_NAME,
      lastRestocked: null,
      createdAt: now,
      updatedAt: now,
    })
    inserted.push(result.insertedId.toString())
  }

  return { inserted, existing }
}
