import type { Db } from 'mongodb'

export const CATHA_BOTTLED_WATER = [
  {
    name: '500ml Water',
    barcode: 'CATHA-WATER-500ML',
    legacyBarcodes: ['500ml'],
    size: '500ml',
    cost: 25,
    price: 100,
    minStock: 10,
    image:
      'https://res.cloudinary.com/daxildt7a/image/upload/v1773679684/bar/tables/mly1dn97trlobbhp35qj.jpg',
  },
  {
    name: '1 Litre Water',
    barcode: 'CATHA-WATER-1L',
    legacyBarcodes: ['1Liter', '1L'],
    size: '1L',
    cost: 30,
    price: 200,
    minStock: 10,
    image:
      'https://res.cloudinary.com/daxildt7a/image/upload/v1773679600/bar/tables/e6mrvilu7nwessuwfmkd.jpg',
  },
] as const

let ensured = false

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Add 500ml and 1L house water to lounge inventory if they are not already there. */
export async function ensureCathaBottledWater(db: Db) {
  if (ensured) return
  const now = new Date()
  const inventory = db.collection('bar_inventory')
  const categories = db.collection('bar_categories')

  await categories.updateOne(
    { code: 'water' },
    {
      $setOnInsert: {
        code: 'water',
        name: 'Water',
        icon: '💧',
        color: '#38BDF8',
        createdAt: now,
      },
      $set: { updatedAt: now },
    },
    { upsert: true }
  )

  for (const product of CATHA_BOTTLED_WATER) {
    const names = [product.name, product.name.replace('Litre', 'Liter')]
    const existing = await inventory.findOne({
      type: 'bar',
      deleted: { $ne: true },
      $or: [
        ...names.map((name) => ({
          name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' },
        })),
        { barcode: { $in: [product.barcode, ...product.legacyBarcodes] } },
      ],
    })

    if (existing) {
      const stock = Number(existing.stock) || 0
      await inventory.updateOne(
        { _id: existing._id },
        {
          $set: {
            category: 'water',
            size: existing.size || product.size,
            unit: existing.unit || 'bottle',
            isVisible: existing.isVisible !== false,
            ...(existing.status === 'archived'
              ? { status: stock > 0 ? 'active' : 'out_of_stock' }
              : {}),
            updatedAt: now,
          },
        }
      )
      continue
    }

    await inventory.updateOne(
      { type: 'bar', barcode: product.barcode },
      {
        $setOnInsert: {
          name: product.name,
          category: 'water',
          barcode: product.barcode,
          cost: product.cost,
          price: product.price,
          stock: 0,
          minStock: product.minStock,
          unit: 'bottle',
          size: product.size,
          supplier: 'Catha Lounge',
          image: product.image,
          batch: '',
          infusion: '',
          notes: 'Bottled in-house for lounge resale',
          isJaba: false,
          isFeatured: false,
          isVisible: true,
          status: 'out_of_stock',
          type: 'bar',
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true }
    )
  }

  ensured = true
}
