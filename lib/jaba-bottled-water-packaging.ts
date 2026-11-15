import type { MongoClient } from 'mongodb'
import {
  findPrimaryBottleMaterialForSize,
  findPrimaryStickerMaterialForSize,
} from '@/lib/jaba-packaging-materials'
import {
  normalizeQty,
  getTotalContainerUnits,
  computePackagedLitresFromContainers,
} from '@/lib/jaba-packaging-calculations'
import { PackagingApiError } from '@/lib/jaba-packaging-multi-save'
import type { RawMaterialStockChange } from '@/lib/jaba-raw-material-stock-sms'
import {
  JABA_BOTTLED_WATER_PRODUCT_KIND,
  JABA_BOTTLED_WATER_PRODUCT_TYPE,
  JABA_WATER_FLAVOUR_NAME,
  ensureJabaBottledWaterStickers,
  findPrimaryWaterRawMaterial,
  isAllowedBottledWaterSize,
} from '@/lib/jaba-bottled-water'
import { JABA_WATER_BATCHES_COLLECTION, countWaterPackSizes } from '@/lib/jaba-water-batches'

type ContainerRow = { size?: string; quantity?: unknown; customSize?: unknown }

function litresPrecision(n: number): number {
  return Math.round(n * 1000) / 1000
}

export async function executeBottledWaterPackagingTransaction(params: {
  client: MongoClient
  db: any
  finalPackageNumber: string
  packagingDate: string | Date
  supervisor: string
  teamMembers: unknown
  safetyChecks: boolean
  containers: ContainerRow[]
  defects?: unknown
  defectReasons?: unknown
  machineEfficiency?: unknown
  waterMaterialId?: string
  waterBatchId: string
}): Promise<{
  createdId: string
  packagingDoc: Record<string, unknown>
  packagedLitres: number
  remainingWaterLitres: number
  stockChangesForSms: RawMaterialStockChange[]
}> {
  const {
    client,
    db,
    finalPackageNumber,
    packagingDate,
    supervisor,
    teamMembers,
    safetyChecks,
    containers,
    defects,
    defectReasons,
    machineEfficiency,
    waterMaterialId,
    waterBatchId,
  } = params

  const rawMaterialsCollection = db.collection('jaba_rawMaterials')
  await ensureJabaBottledWaterStickers(db)
  const mongoSession = client.startSession()
  const year =
    packagingDate instanceof Date
      ? packagingDate.getFullYear()
      : new Date(packagingDate).getFullYear() || new Date().getFullYear()

  const fmtSize = (size: string) => size
  const stockChangesForSms: RawMaterialStockChange[] = []
  let createdId = ''
  let packagingDoc: Record<string, unknown> = {}
  let packagedLitres = 0
  let remainingWaterLitres = 0

  try {
    await mongoSession.withTransaction(async () => {
      for (const c of containers || []) {
        if (normalizeQty((c as any)?.quantity) < 0) {
          throw new PackagingApiError('Container quantities cannot be negative.', 400)
        }
        const size = String((c as any)?.size || '')
        const units = normalizeQty((c as any)?.quantity)
        if (units > 0 && !isAllowedBottledWaterSize(size)) {
          throw new PackagingApiError(
            `Bottled water is only packed in 500ml and 1L. Remove ${size || 'this size'} from the session.`,
            400
          )
        }
      }

      packagedLitres = litresPrecision(computePackagedLitresFromContainers(containers || []))
      if (packagedLitres <= 0) {
        throw new PackagingApiError('Packed litres must be greater than 0.', 400)
      }
      if (getTotalContainerUnits(containers || []) <= 0) {
        throw new PackagingApiError('Add at least one 500ml or 1L quantity.', 400)
      }

      const waterMaterial = await findPrimaryWaterRawMaterial(rawMaterialsCollection, {
        session: mongoSession,
        materialId: waterMaterialId,
      })
      if (!waterMaterial) {
        throw new PackagingApiError(
          'No water raw material found. Add Distilled Water (or another water item in litres) under Raw Materials. That same stock is also used when making juice batches.',
          400
        )
      }

      const waterStock = Number(waterMaterial.currentStock) || 0
      if (waterStock + 1e-9 < packagedLitres) {
        throw new PackagingApiError(
          `Insufficient water stock: need ${packagedLitres.toFixed(2)}L, available ${waterStock.toFixed(2)}L (${String(
            waterMaterial.name || 'Water'
          )}). This same water is also used for juice production.`,
          400
        )
      }

      const sizeSpecToUnits = new Map<string, { size: string; units: number }>()
      for (const c of containers || []) {
        const units = normalizeQty((c as any).quantity)
        if (units <= 0) continue
        const size = String((c as any).size || '')
        const existing = sizeSpecToUnits.get(size)
        if (existing) existing.units += units
        else sizeSpecToUnits.set(size, { size, units })
      }

      const bottleRequirementsById = new Map<string, { doc: any; units: number }>()
      const stickerRequirementsById = new Map<string, { doc: any; units: number }>()
      const packingMaterialLines: Array<{
        flavourName: string
        containerSize: string
        quantityPacked: number
        stickersUsed: number
        stickerMaterialId: string
        stickerMaterialName: string
        bottleMaterialId: string
        bottleMaterialName: string
        bottlesUsed: number
      }> = []

      for (const spec of sizeSpecToUnits.values()) {
        const [bottleMaterial, stickerMaterial] = await Promise.all([
          findPrimaryBottleMaterialForSize(rawMaterialsCollection, {
            size: spec.size,
            session: mongoSession,
          }),
          findPrimaryStickerMaterialForSize(rawMaterialsCollection, {
            size: spec.size,
            flavourName: JABA_WATER_FLAVOUR_NAME,
            requireFlavorSpecific: true,
            session: mongoSession,
          }),
        ])

        if (!bottleMaterial) {
          throw new PackagingApiError(
            `No bottle raw material found for size ${fmtSize(spec.size)}. Add "${spec.size} Bottles" in Raw Materials.`,
            400
          )
        }
        if (!stickerMaterial) {
          throw new PackagingApiError(
            `No water sticker found for ${fmtSize(spec.size)}. Add a Packaging sticker named "${spec.size} Water Stickers" (flavour Water).`,
            400
          )
        }

        const bottleId = String(bottleMaterial._id)
        const stickerId = String(stickerMaterial._id)
        const existingBottle = bottleRequirementsById.get(bottleId)
        if (existingBottle) existingBottle.units += spec.units
        else bottleRequirementsById.set(bottleId, { doc: bottleMaterial, units: spec.units })
        const existingSticker = stickerRequirementsById.get(stickerId)
        if (existingSticker) existingSticker.units += spec.units
        else stickerRequirementsById.set(stickerId, { doc: stickerMaterial, units: spec.units })

        packingMaterialLines.push({
          flavourName: JABA_WATER_FLAVOUR_NAME,
          containerSize: spec.size,
          quantityPacked: spec.units,
          stickersUsed: spec.units,
          stickerMaterialId: stickerId,
          stickerMaterialName: String(stickerMaterial.name || 'Stickers'),
          bottleMaterialId: bottleId,
          bottleMaterialName: String(bottleMaterial.name || 'Bottles'),
          bottlesUsed: spec.units,
        })
      }

      for (const req of bottleRequirementsById.values()) {
        const stock = Number(req.doc.currentStock) || 0
        if (stock < req.units) {
          throw new PackagingApiError(
            `Insufficient bottle stock: need ${req.units.toLocaleString()}, available ${stock.toLocaleString()} (${String(
              req.doc.name || 'bottles'
            )}).`,
            400
          )
        }
      }
      for (const req of stickerRequirementsById.values()) {
        const stock = Number(req.doc.currentStock) || 0
        if (stock < req.units) {
          throw new PackagingApiError(
            `Insufficient sticker stock: need ${req.units.toLocaleString()}, available ${stock.toLocaleString()} (${String(
              req.doc.name || 'stickers'
            )}).`,
            400
          )
        }
      }

      const { ObjectId } = await import('mongodb')
      if (!ObjectId.isValid(waterBatchId)) {
        throw new PackagingApiError('Select a bottled-water batch before packing. Water is not stored on juice batches.', 400)
      }
      const waterBatch = await db
        .collection(JABA_WATER_BATCHES_COLLECTION)
        .findOne({ _id: new ObjectId(waterBatchId) }, { session: mongoSession })
      if (!waterBatch) {
        throw new PackagingApiError('Water batch not found. Create a water batch, then pack into it.', 404)
      }
      if (String(waterBatch.status || 'open') === 'closed') {
        throw new PackagingApiError(
          `Water batch ${String(waterBatch.batchNumber || '')} is closed. Open it or create a new water batch.`,
          409
        )
      }
      const waterBatchNumber = String(waterBatch.batchNumber || '').trim()
      if (!waterBatchNumber) {
        throw new PackagingApiError('Water batch is missing a batch number.', 400)
      }

      const existingCount = await db.collection('jaba_packagingOutput').countDocuments(
        { productKind: JABA_BOTTLED_WATER_PRODUCT_KIND, waterBatchId: String(waterBatch._id) },
        { session: mongoSession }
      )
      const packagingLine = `${year}-${waterBatchNumber}-L${String(existingCount + 1).padStart(2, '0')}`
      const packedSizes = countWaterPackSizes(containers)

      const materialsUsed: Array<Record<string, unknown>> = [
        {
          materialId: String(waterMaterial._id),
          name: String(waterMaterial.name || 'Water'),
          type: 'water',
          quantity: packagedLitres,
          flavourName: JABA_WATER_FLAVOUR_NAME,
        },
      ]
      for (const [materialId, req] of bottleRequirementsById.entries()) {
        materialsUsed.push({
          materialId,
          name: String(req.doc.name || 'Bottles'),
          type: 'bottles',
          quantity: req.units,
          flavourName: JABA_WATER_FLAVOUR_NAME,
        })
      }
      for (const [materialId, req] of stickerRequirementsById.entries()) {
        materialsUsed.push({
          materialId,
          name: String(req.doc.name || 'Stickers'),
          type: 'stickers',
          quantity: req.units,
          flavourName: JABA_WATER_FLAVOUR_NAME,
        })
      }

      const packagingData: Record<string, unknown> = {
        productKind: JABA_BOTTLED_WATER_PRODUCT_KIND,
        productType: JABA_BOTTLED_WATER_PRODUCT_TYPE,
        batchId: String(waterBatch._id),
        batchNumber: waterBatchNumber,
        waterBatchId: String(waterBatch._id),
        waterBatchNumber,
        packageNumber: finalPackageNumber.trim(),
        volumeAllocated: packagedLitres,
        packagedLitres,
        packagingDate: new Date(packagingDate as any),
        packagingLine,
        supervisor: String(supervisor).trim(),
        teamMembers: teamMembers || [],
        containers,
        defects: Number(defects) || 0,
        defectReasons: typeof defectReasons === 'string' ? defectReasons.trim() : '',
        machineEfficiency: machineEfficiency ? Number(machineEfficiency) : undefined,
        safetyChecks: Boolean(safetyChecks),
        createdAt: new Date(),
        flavourName: JABA_WATER_FLAVOUR_NAME,
        packedFlavourName: JABA_WATER_FLAVOUR_NAME,
        materialsUsed,
        packingMaterialLines,
        waterMaterialId: String(waterMaterial._id),
        waterMaterialName: String(waterMaterial.name || 'Water'),
        waterLitresUsed: packagedLitres,
      }

      const insert = await db.collection('jaba_packagingOutput').insertOne(packagingData, { session: mongoSession })
      createdId = insert.insertedId.toString()
      packagingDoc = { ...packagingData, _id: createdId, id: createdId }

      const waterDeduct = await rawMaterialsCollection.updateOne(
        { _id: waterMaterial._id, currentStock: { $gte: packagedLitres } },
        { $inc: { currentStock: -packagedLitres }, $set: { updatedAt: new Date() } },
        { session: mongoSession }
      )
      if (waterDeduct.modifiedCount !== 1) {
        throw new PackagingApiError('Water stock changed during packaging. Please refresh and try again.', 409)
      }

      for (const req of bottleRequirementsById.values()) {
        const qty = req.units
        const bottleDeduct = await rawMaterialsCollection.updateOne(
          { _id: req.doc._id, currentStock: { $gte: qty } },
          { $inc: { currentStock: -qty }, $set: { updatedAt: new Date() } },
          { session: mongoSession }
        )
        if (bottleDeduct.modifiedCount !== 1) {
          throw new PackagingApiError('Raw material stock changed during packaging. Please refresh and try again.', 409)
        }
      }
      for (const req of stickerRequirementsById.values()) {
        const qty = req.units
        const stickerDeduct = await rawMaterialsCollection.updateOne(
          { _id: req.doc._id, currentStock: { $gte: qty } },
          { $inc: { currentStock: -qty }, $set: { updatedAt: new Date() } },
          { session: mongoSession }
        )
        if (stickerDeduct.modifiedCount !== 1) {
          throw new PackagingApiError('Raw material stock changed during packaging. Please refresh and try again.', 409)
        }
      }

      remainingWaterLitres = litresPrecision(waterStock - packagedLitres)
      const batchUpdate = await db.collection(JABA_WATER_BATCHES_COLLECTION).updateOne(
        { _id: waterBatch._id, status: { $ne: 'closed' } },
        {
          $inc: {
            bottles500ml: packedSizes.bottles500ml,
            bottles1L: packedSizes.bottles1L,
            packagedLitres,
            sessionCount: 1,
          },
          $set: { updatedAt: new Date(), lastPackagedAt: new Date() },
        },
        { session: mongoSession }
      )
      if (batchUpdate.modifiedCount !== 1) {
        throw new PackagingApiError('Water batch changed during packaging. Please refresh and try again.', 409)
      }

      const movementTs = new Date()
      const movementDocs: Record<string, unknown>[] = [
        {
          type: 'DEDUCTION',
          reason: 'PACKAGING',
          batchId: String(waterBatch._id),
          batchNumber: waterBatchNumber,
          packagingOutputId: createdId,
          packageNumber: finalPackageNumber.trim(),
          materialType: 'water',
          materialId: String(waterMaterial._id),
          materialName: String(waterMaterial.name || 'Water'),
          quantity: packagedLitres,
          unit: String(waterMaterial.unit || 'litres'),
          beforeStock: waterStock,
          afterStock: remainingWaterLitres,
          userId: 'system',
          timestamp: movementTs,
          createdAt: movementTs,
        },
      ]
      stockChangesForSms.push({
        name: String(waterMaterial.name || 'Water'),
        unit: String(waterMaterial.unit || 'litres'),
        beforeStock: waterStock,
        afterStock: remainingWaterLitres,
        minStock: Number(waterMaterial.minStock) || 0,
        reorderLevel: Number(waterMaterial.reorderLevel) || 0,
      })

      const pushPackagingMovement = (req: { doc: any; units: number }, materialType: 'bottles' | 'stickers') => {
        const qty = req.units
        const before = Number(req.doc.currentStock) || 0
        stockChangesForSms.push({
          name: String(req.doc.name || materialType),
          unit: String(req.doc.unit || 'pcs'),
          beforeStock: before,
          afterStock: before - qty,
          minStock: Number(req.doc.minStock) || 0,
          reorderLevel: Number(req.doc.reorderLevel) || 0,
        })
        movementDocs.push({
          type: 'DEDUCTION',
          reason: 'PACKAGING',
          batchId: String(waterBatch._id),
          batchNumber: waterBatchNumber,
          packagingOutputId: createdId,
          packageNumber: finalPackageNumber.trim(),
          materialType,
          materialId: String(req.doc._id),
          materialName: String(req.doc.name || materialType),
          quantity: qty,
          unit: String(req.doc.unit || 'pcs'),
          beforeStock: before,
          afterStock: before - qty,
          userId: 'system',
          timestamp: movementTs,
          createdAt: movementTs,
        })
      }
      for (const req of bottleRequirementsById.values()) pushPackagingMovement(req, 'bottles')
      for (const req of stickerRequirementsById.values()) pushPackagingMovement(req, 'stickers')
      await db.collection('jaba_inventory_movements').insertMany(movementDocs, { session: mongoSession })
    })
  } finally {
    await mongoSession.endSession()
  }

  return {
    createdId,
    packagingDoc,
    packagedLitres,
    remainingWaterLitres,
    stockChangesForSms,
  }
}
