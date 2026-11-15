import { NextResponse } from 'next/server'
import clientPromise from '@/lib/mongodb'
import { requireJabaAction } from '@/lib/api-jaba-permissions'
import {
  ensureJabaSizeBottles,
  findPrimaryPackagingMaterials,
  findPrimaryBottleMaterialForSize,
  findPrimaryStickerMaterialForSize,
} from '@/lib/jaba-packaging-materials'
import {
  JABA_WATER_FLAVOUR_NAME,
  ensureJabaBottledWaterStickers,
  findWaterRawMaterials,
  mapWaterMaterial,
} from '@/lib/jaba-bottled-water'

export const runtime = 'nodejs'

/**
 * GET packaging warehouse stock for preview.
 * - Bottles/stickers are resolved per container size (250ml/500ml/1L/2L) based on how they are named in `jaba_rawMaterials`.
 * - Optional `flavour` / `flavor` query: sticker rows must match that flavour (name or packagingStickerFlavor), same as packaging POST.
 * - Deduction still happens on save; this endpoint only predicts remaining stock while typing.
 */
export async function GET(request: Request) {
  const authResult = await requireJabaAction('production.packaging', 'view')
  if ('response' in authResult) return authResult.response

  try {
    const { searchParams } = new URL(request.url)
    const flavourParam = searchParams.get('flavour') || searchParams.get('flavor') || ''
    const flavourName = flavourParam.trim() || undefined
    const requireFlavorSpecific = Boolean(flavourName)
    const waterBottlesOnly = String(flavourName || '').trim().toLowerCase() === 'water'

    const client = await clientPromise
    const db = client.db('infusion_jaba')
    const rawMaterialsCollection = db.collection('jaba_rawMaterials')
    try {
      await ensureJabaSizeBottles(db)
    } catch (ensureError) {
      console.error('[packaging-material-stock] Size bottle ensure skipped:', ensureError)
    }

    const mapOne = (m: any, kind: 'bottles' | 'stickers') =>
      m
        ? {
            id: m._id.toString(),
            name: String(m.name ?? ''),
            currentStock: Number(m.currentStock) || 0,
            unit: String(m.unit ?? 'pcs'),
            kind,
          }
        : null

    const sizes = ['250ml', '500ml', '1L', '2L'] as const

    const [generic, perSize] = await Promise.all([
      findPrimaryPackagingMaterials(rawMaterialsCollection),
      Promise.all(
        sizes.map(async (size) => {
          const [bottleMaterial, stickerMaterial] = await Promise.all([
            findPrimaryBottleMaterialForSize(rawMaterialsCollection, { size, waterOnly: waterBottlesOnly }),
            findPrimaryStickerMaterialForSize(rawMaterialsCollection, {
              size,
              flavourName,
              requireFlavorSpecific,
            }),
          ])

          return [
            size,
            {
              bottle: mapOne(bottleMaterial, 'bottles'),
              sticker: mapOne(stickerMaterial, 'stickers'),
            },
          ] as const
        })
      ),
    ])

    const bySize = Object.fromEntries(perSize) as Record<(typeof sizes)[number], any>

    const includeWaterSource =
      String(flavourName || '').trim().toLowerCase() === JABA_WATER_FLAVOUR_NAME.toLowerCase()
    if (includeWaterSource) {
      await ensureJabaBottledWaterStickers(db)
    }
    const waterDocs = includeWaterSource ? await findWaterRawMaterials(rawMaterialsCollection) : []
    const waterSources = waterDocs.map((doc) => mapWaterMaterial(doc)).filter(Boolean)

    return NextResponse.json({
      // Kept for backward compatibility with any older UI code.
      bottle: mapOne(generic.bottleMaterial, 'bottles'),
      sticker: mapOne(generic.stickerMaterial, 'stickers'),
      bySize,
      flavourName: flavourName ?? null,
      stickerResolution: requireFlavorSpecific ? 'flavour-specific' : 'generic',
      waterSource: waterSources[0] ?? null,
      waterSources,
    })
  } catch (error: any) {
    console.error('[packaging-material-stock] GET error:', error)
    return NextResponse.json(
      { error: 'Failed to load packaging material stock', details: error.message || String(error) },
      { status: 500 }
    )
  }
}
