import type { Collection, Db, Document } from 'mongodb'

/** Matches raw material names used for packaging (same rules as packaging-output API). */
export const BOTTLE_NAME_REGEX = /\bbott?l?e?s?\b/i
export const STICKER_NAME_REGEX = /\b(stickers?|labels?)\b/i

const PRIMARY_SORT = { currentStock: -1, updatedAt: -1, createdAt: -1 } as const
const WATER_BOTTLE_WORD = /\bwater\b/i

function escapeRegExp(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Builds a "size token" regex that can be matched against raw material `name`,
 * e.g. `250ml`, `500ml`, `1L`, `2L`, and also custom ml/l values.
 *
 * This is how we know which bottle/sticker record to deduct for a container size.
 */
export function packagingSizeTokenRegex(size: string, customSize?: string): RegExp | null {
  const s = String(size || '').trim()

  if (s === '250ml') return /\b250\s*ml\b/i
  if (s === '500ml') return /\b500\s*ml\b/i
  if (s === '1L') return /\b1\s*l\b/i
  if (s === '2L') return /\b2\s*l\b/i

  if (s !== 'custom') return null
  const ml = parseFloat(String(customSize ?? ''))
  if (!Number.isFinite(ml) || ml <= 0) return null

  // For custom sizes, try matching the raw name by both "Xml" and "Y L" forms.
  const mlStr = String(ml).replace(/\.0+$/g, '')
  const liters = ml / 1000
  const litersStr = String(liters).replace(/\.0+$/g, '')

  // Example: 750 -> /\b750\s*ml\b/i; 1500 -> (/\b1500\s*ml\b/ OR /\b1.5\s*l\b/)
  if (ml < 1000) {
    return new RegExp(`\\b${escapeRegExp(mlStr)}\\s*ml\\b`, 'i')
  }

  const lEsc = escapeRegExp(litersStr)
  return new RegExp(`(?:\\b${escapeRegExp(mlStr)}\\s*ml\\b|\\b${lEsc}\\s*l\\b)`, 'i')
}

/**
 * Resolves the same bottle + sticker documents the packaging POST handler uses
 * (highest currentStock first), so UI stock previews match server deduction.
 */
export async function findPrimaryPackagingMaterials(
  rawMaterialsCollection: Collection<Document>,
  options?: { session?: import('mongodb').ClientSession }
): Promise<{ bottleMaterial: Document | null; stickerMaterial: Document | null }> {
  const opts = options?.session ? { session: options.session } : {}
  const [bottleMaterial, stickerMaterial] = await Promise.all([
    rawMaterialsCollection
      .find(
        {
          $and: [{ name: { $regex: BOTTLE_NAME_REGEX } }, { name: { $not: WATER_BOTTLE_WORD } }],
        },
        opts
      )
      .sort(PRIMARY_SORT)
      .limit(1)
      .next(),
    rawMaterialsCollection
      .find({ name: { $regex: STICKER_NAME_REGEX } }, opts)
      .sort(PRIMARY_SORT)
      .limit(1)
      .next(),
  ])
  return { bottleMaterial, stickerMaterial }
}

export async function findPrimaryBottleMaterialForSize(
  rawMaterialsCollection: Collection<Document>,
  opts: {
    size: string
    customSize?: string
    /** Bottled-water packing uses only water bottle SKUs. Juice packing never uses those. */
    waterOnly?: boolean
    session?: import('mongodb').ClientSession
  }
): Promise<Document | null> {
  const token = packagingSizeTokenRegex(opts.size, opts.customSize)
  const clauses: Record<string, unknown>[] = [
    { name: { $regex: BOTTLE_NAME_REGEX } },
    { name: { $not: STICKER_NAME_REGEX } },
    opts.waterOnly ? { name: { $regex: WATER_BOTTLE_WORD } } : { name: { $not: WATER_BOTTLE_WORD } },
  ]
  if (token) clauses.push({ name: { $regex: token } })
  const query: any = { $and: clauses }

  const mat = await rawMaterialsCollection
    .find(query, opts.session ? { session: opts.session } : undefined)
    .sort(PRIMARY_SORT)
    .limit(1)
    .next()

  return mat ?? null
}

/** Trim and normalize flavour text for comparisons (does not lowercase — regex handles case). */
export function normalizeFlavourLabel(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * Regex that matches a multi-word flavour inside a raw material `name`, e.g. "Passion Fruit".
 */
export function flavourInNameRegex(flavourLabel: string): RegExp | null {
  const n = normalizeFlavourLabel(flavourLabel)
  if (!n) return null
  const escaped = escapeRegExp(n).replace(/\s+/g, '\\s+')
  return new RegExp(`\\b${escaped}\\b`, 'i')
}

export type FindStickerOpts = {
  size: string
  customSize?: string
  /** Batch or flavour-line name — when set, match sticker rows tagged for this flavour or with flavour in the name. */
  flavourName?: string
  /**
   * When true, do not fall back to generic stickers (size-only or unlabeled size).
   * Use for flavour-line packaging and whenever the product flavour is known.
   */
  requireFlavorSpecific?: boolean
  session?: import('mongodb').ClientSession
}

export async function findPrimaryStickerMaterialForSize(
  rawMaterialsCollection: Collection<Document>,
  opts: FindStickerOpts
): Promise<Document | null> {
  const token = packagingSizeTokenRegex(opts.size, opts.customSize)
  const flavour = normalizeFlavourLabel(opts.flavourName)
  const requireSpecific = Boolean(opts.requireFlavorSpecific)
  const findOpts = opts.session ? { session: opts.session } : undefined

  const stickerBase: Record<string, unknown> = { name: { $regex: STICKER_NAME_REGEX } }
  const andClauses: Record<string, unknown>[] = [stickerBase]

  if (token) {
    andClauses.push({ name: { $regex: token } })
  }

  if (flavour) {
    const word = flavourInNameRegex(flavour)
    andClauses.push({
      $or: [
        { packagingStickerFlavor: { $regex: new RegExp(`^${escapeRegExp(flavour)}$`, 'i') } },
        ...(word ? [{ name: { $regex: word } }] : []),
      ],
    })
  }

  const flavouredQuery = { $and: andClauses }

  const flavoured = await rawMaterialsCollection
    .find(flavouredQuery, findOpts)
    .sort(PRIMARY_SORT)
    .limit(1)
    .next()

  if (flavoured) return flavoured

  if (requireSpecific || flavour) {
    // Known flavour but no matching SKU — never deduct the wrong sticker row.
    return null
  }

  // House bottled-water stickers must never be used as a juice fallback SKU.
  const excludeWaterProductStickers = {
    $nor: [
      { packagingStickerFlavor: { $regex: /^Water$/i } },
      { name: { $regex: /\bwater\b/i } },
    ],
  }

  // Legacy: size-specific sticker without flavour constraint
  const sizeSpecificQuery: Record<string, unknown> | null = token
    ? { $and: [{ name: { $regex: STICKER_NAME_REGEX } }, { name: { $regex: token } }, excludeWaterProductStickers] }
    : null

  const sizeSpecific = sizeSpecificQuery
    ? await rawMaterialsCollection.find(sizeSpecificQuery, findOpts).sort(PRIMARY_SORT).limit(1).next()
    : null

  if (sizeSpecific) return sizeSpecific

  const generic = await rawMaterialsCollection
    .find({ $and: [{ name: { $regex: STICKER_NAME_REGEX } }, excludeWaterProductStickers] }, findOpts)
    .sort(PRIMARY_SORT)
    .limit(1)
    .next()

  return generic ?? null
}

export const JABA_SIZE_BOTTLE_SPECS = [
  { size: '500ml', name: '500ml Water Bottles' },
  { size: '1L', name: '1L Water Bottles' },
] as const

/** True for a bottle SKU of this size. Stickers are excluded. */
export function isSizeBottleName(name: unknown, size: string): boolean {
  const label = String(name || '')
  if (!BOTTLE_NAME_REGEX.test(label)) return false
  if (STICKER_NAME_REGEX.test(label)) return false
  const token = packagingSizeTokenRegex(size)
  return token ? token.test(label) : false
}

/** A bottled-water bottle, separate from jaba juice bottles such as "500ml Bottles". */
export function isWaterBottleName(name: unknown): boolean {
  const label = String(name || '')
  if (!BOTTLE_NAME_REGEX.test(label)) return false
  if (STICKER_NAME_REGEX.test(label)) return false
  if (/\bwatermelon\b/i.test(label)) return false
  return WATER_BOTTLE_WORD.test(label)
}

/**
 * Insert "500ml Water Bottles" and "1L Water Bottles" with stock 1 when that water bottle is missing.
 * Jaba juice bottles are left untouched, including when their stock is already above zero.
 */
export async function ensureJabaSizeBottles(db: Db): Promise<{ inserted: string[]; existing: string[] }> {
  const now = new Date()
  const collection = db.collection('jaba_rawMaterials')
  const inserted: string[] = []
  const existing: string[] = []

  for (const spec of JABA_SIZE_BOTTLE_SPECS) {
    const token = packagingSizeTokenRegex(spec.size)
    const found = token
      ? await collection.findOne({
          $and: [
            { name: { $regex: BOTTLE_NAME_REGEX } },
            { name: { $regex: WATER_BOTTLE_WORD } },
            { name: { $regex: token } },
            { name: { $not: STICKER_NAME_REGEX } },
            { name: { $not: /\bwatermelon\b/i } },
          ],
        })
      : null

    if (found) {
      existing.push(String(found._id))
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
      lastRestocked: null,
      createdAt: now,
      updatedAt: now,
    })
    inserted.push(result.insertedId.toString())
  }

  return { inserted, existing }
}

