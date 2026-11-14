"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  AlertCircle,
  CheckCircle,
  Droplet,
  Layers,
  Loader2,
  Package,
  Plus,
  Save,
  Users,
  Warehouse,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { computePackagedLitresFromContainers } from "@/lib/jaba-packaging-calculations"

type PackagingStockItem = {
  id: string
  name: string
  currentStock: number
  unit: string
  kind: string
}

type WaterSource = {
  id: string
  name: string
  currentStock: number
  unit: string
}

const WATER_SIZES = ["500ml", "1L"] as const

export default function PackageBottledWaterPage() {
  const router = useRouter()
  const [packageNumber, setPackageNumber] = useState("")
  const [packagingDate, setPackagingDate] = useState(new Date().toISOString().split("T")[0])
  const [supervisor, setSupervisor] = useState("")
  const [teamMembers, setTeamMembers] = useState<string[]>([])
  const [newMember, setNewMember] = useState("")
  const [qty500, setQty500] = useState("")
  const [qty1L, setQty1L] = useState("")
  const [defects, setDefects] = useState("")
  const [defectReasons, setDefectReasons] = useState("")
  const [safetyChecks, setSafetyChecks] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [waterMaterialId, setWaterMaterialId] = useState("")
  const [waterSources, setWaterSources] = useState<WaterSource[]>([])
  const [stockBySize, setStockBySize] = useState<
    Record<"500ml" | "1L", { bottle: PackagingStockItem | null; sticker: PackagingStockItem | null }>
  >({
    "500ml": { bottle: null, sticker: null },
    "1L": { bottle: null, sticker: null },
  })
  const [stockLoading, setStockLoading] = useState(true)
  const [stockError, setStockError] = useState<string | null>(null)
  const idempotencyKeyRef = useRef<string | null>(null)

  useEffect(() => {
    const currentYear = new Date().getFullYear()
    const randomNum = String(Math.floor(Math.random() * 99999)).padStart(5, "0")
    setPackageNumber(`PKG-${currentYear}-${randomNum}`)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setStockLoading(true)
        const res = await fetch("/api/jaba/packaging-material-stock?flavour=Water")
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || "Failed to load packaging material stock")
        if (cancelled) return
        setStockBySize({
          "500ml": data.bySize?.["500ml"] ?? { bottle: null, sticker: null },
          "1L": data.bySize?.["1L"] ?? { bottle: null, sticker: null },
        })
        const sources: WaterSource[] = Array.isArray(data.waterSources)
          ? data.waterSources.filter(Boolean)
          : data.waterSource
            ? [data.waterSource]
            : []
        setWaterSources(sources)
        setWaterMaterialId((prev) => prev || sources[0]?.id || "")
        setStockError(null)
      } catch (e: unknown) {
        if (!cancelled) setStockError(e instanceof Error ? e.message : "Failed to load stock")
      } finally {
        if (!cancelled) setStockLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const selectedWater = waterSources.find((w) => w.id === waterMaterialId) || waterSources[0] || null
  const containers = useMemo(
    () => [
      { size: "500ml", quantity: qty500 },
      { size: "1L", quantity: qty1L },
    ],
    [qty500, qty1L]
  )
  const packedLitres = computePackagedLitresFromContainers(containers)
  const units500 = Math.max(0, parseFloat(qty500) || 0)
  const units1L = Math.max(0, parseFloat(qty1L) || 0)

  const afterWater = selectedWater ? selectedWater.currentStock - packedLitres : null
  const afterBottle500 = stockBySize["500ml"].bottle
    ? stockBySize["500ml"].bottle.currentStock - units500
    : null
  const afterSticker500 = stockBySize["500ml"].sticker
    ? stockBySize["500ml"].sticker.currentStock - units500
    : null
  const afterBottle1L = stockBySize["1L"].bottle ? stockBySize["1L"].bottle.currentStock - units1L : null
  const afterSticker1L = stockBySize["1L"].sticker ? stockBySize["1L"].sticker.currentStock - units1L : null

  const missingSticker =
    (units500 > 0 && !stockBySize["500ml"].sticker) || (units1L > 0 && !stockBySize["1L"].sticker)
  const missingBottle =
    (units500 > 0 && !stockBySize["500ml"].bottle) || (units1L > 0 && !stockBySize["1L"].bottle)
  const insufficient =
    (afterWater != null && afterWater < -1e-9) ||
    (afterBottle500 != null && afterBottle500 < 0) ||
    (afterSticker500 != null && afterSticker500 < 0) ||
    (afterBottle1L != null && afterBottle1L < 0) ||
    (afterSticker1L != null && afterSticker1L < 0)

  const addTeamMember = () => {
    const name = newMember.trim()
    if (!name) return
    if (teamMembers.includes(name)) {
      toast.error("That team member is already added")
      return
    }
    setTeamMembers((prev) => [...prev, name])
    setNewMember("")
  }

  const handleSave = async () => {
    if (!selectedWater) {
      toast.error("Add a water raw material (litres) first. Juice batches use this same water.")
      return
    }
    if (!supervisor.trim()) {
      toast.error("Please enter packaging supervisor")
      return
    }
    if (teamMembers.length === 0) {
      toast.error("Please add at least one team member")
      return
    }
    if (!safetyChecks) {
      toast.error("Please complete safety checks before saving")
      return
    }
    if (packedLitres <= 0) {
      toast.error("Enter 500ml and/or 1L quantities")
      return
    }
    if (missingBottle || missingSticker) {
      toast.error("Add matching 500ml / 1L bottles and Water stickers in Raw Materials before packing.")
      return
    }
    if (insufficient) {
      toast.error("Not enough water, bottles, or stickers for this session. Reduce quantities or restock.")
      return
    }

    if (!idempotencyKeyRef.current) idempotencyKeyRef.current = crypto.randomUUID()
    setIsSaving(true)
    try {
      const response = await fetch("/api/jaba/packaging-output", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productKind: "bottled_water",
          waterMaterialId: selectedWater.id,
          packageNumber,
          packagingDate,
          supervisor,
          teamMembers,
          safetyChecks,
          containers,
          defects,
          defectReasons,
          totalPackedLitres: packedLitres,
          idempotencyKey: idempotencyKeyRef.current,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Failed to save bottled water packaging")
      idempotencyKeyRef.current = null
      if (data.idempotentReplay) {
        toast.info("This save was already recorded — inventory was not duplicated.")
      } else {
        toast.success(
          `Bottled water packed. Package ${data.packaging?.packageNumber || packageNumber}. Used ${packedLitres.toFixed(2)}L from ${selectedWater.name}.`
        )
      }
      router.push("/jaba/packaging-output")
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to save bottled water packaging")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-gradient-to-r from-slate-50 to-white px-6 shadow-sm dark:from-slate-900 dark:to-slate-950">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 p-2 shadow-lg">
            <Droplet className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Package bottled water</h1>
            <p className="text-sm text-muted-foreground">500ml and 1L from Jaba water stock, for lounge resale</p>
          </div>
        </div>
        <Link href="/jaba/packaging-output">
          <Button variant="outline">Cancel</Button>
        </Link>
      </header>

      <div className="mx-auto max-w-5xl space-y-6 bg-gradient-to-br from-slate-50 via-background to-slate-50 p-6 dark:from-slate-950 dark:via-background dark:to-slate-950">
        <Card className="border-sky-200 shadow-lg dark:border-sky-900">
          <CardHeader className="border-b border-sky-200 bg-gradient-to-r from-sky-50 to-blue-50 dark:border-sky-900 dark:from-sky-950/30 dark:to-blue-950/20">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Warehouse className="h-5 w-5 text-sky-600" />
              Water source
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-6">
            <p className="text-sm text-muted-foreground">
              Litres come from the same water raw material used in juice batches. Packaging deducts water, bottles, and
              Water stickers only — juice flavour stickers are not touched.
            </p>
            {stockLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading water and packaging stock…
              </div>
            ) : stockError ? (
              <p className="text-sm text-amber-700 dark:text-amber-300">{stockError}</p>
            ) : waterSources.length === 0 ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
                No water raw material found. Add an item such as Distilled Water (unit: litres) under Raw Materials.
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Water raw material *</Label>
                  <Select value={waterMaterialId} onValueChange={setWaterMaterialId}>
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="Select water" />
                    </SelectTrigger>
                    <SelectContent>
                      {waterSources.map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.name} ({w.currentStock.toLocaleString()} {w.unit})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedWater && (
                  <div className="rounded-xl border-2 border-sky-200 bg-sky-50/80 p-4 dark:border-sky-900 dark:bg-sky-950/30">
                    <p className="text-xs font-semibold uppercase tracking-wide text-sky-800 dark:text-sky-200">
                      Remaining after this session
                    </p>
                    <p
                      className={cn(
                        "mt-1 text-2xl font-bold tabular-nums",
                        afterWater != null && afterWater < 0 ? "text-red-600" : "text-sky-700 dark:text-sky-300"
                      )}
                    >
                      {afterWater != null ? `${afterWater.toFixed(2)} ${selectedWater.unit}` : "—"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      In stock now: {selectedWater.currentStock.toLocaleString()} {selectedWater.unit}
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b bg-gradient-to-r from-purple-50 to-purple-100/50 dark:from-purple-950/30 dark:to-purple-900/20">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Package className="h-5 w-5 text-purple-600" />
              Session details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-6">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Package number</Label>
                <Input value={packageNumber} readOnly className="font-mono" />
              </div>
              <div className="space-y-2">
                <Label>Packaging date *</Label>
                <Input type="date" value={packagingDate} onChange={(e) => setPackagingDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Supervisor *</Label>
                <Input value={supervisor} onChange={(e) => setSupervisor(e.target.value)} placeholder="Supervisor name" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Team members *</Label>
              <div className="flex gap-2">
                <Input
                  value={newMember}
                  onChange={(e) => setNewMember(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTeamMember())}
                  placeholder="Team member name"
                />
                <Button type="button" onClick={addTeamMember}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {teamMembers.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {teamMembers.map((member) => (
                    <Badge key={member} variant="secondary" className="gap-1.5">
                      <Users className="h-3 w-3" />
                      {member}
                      <button type="button" onClick={() => setTeamMembers((prev) => prev.filter((m) => m !== member))}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Layers className="h-5 w-5 text-emerald-600" />
              Bottles to fill
            </CardTitle>
            <p className="pt-1 text-sm text-muted-foreground">
              Only 500ml and 1L. Each unit uses one bottle and one Water sticker from raw materials.
            </p>
          </CardHeader>
          <CardContent className="space-y-4 p-6">
            <div className="grid gap-4 md:grid-cols-2">
              {WATER_SIZES.map((size) => {
                const qty = size === "500ml" ? qty500 : qty1L
                const setQty = size === "500ml" ? setQty500 : setQty1L
                const mat = stockBySize[size]
                const units = Math.max(0, parseFloat(qty) || 0)
                const afterB = mat.bottle ? mat.bottle.currentStock - units : null
                const afterS = mat.sticker ? mat.sticker.currentStock - units : null
                return (
                  <div key={size} className="space-y-3 rounded-xl border-2 p-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-base font-bold">{size}</Label>
                      <span className="text-sm text-muted-foreground">
                        {size === "500ml" ? "0.5L each" : "1L each"}
                      </span>
                    </div>
                    <Input
                      type="number"
                      min={0}
                      value={qty}
                      onChange={(e) => setQty(e.target.value)}
                      placeholder="0"
                      className="h-11"
                    />
                    <div className="space-y-1 text-sm">
                      <p>
                        Bottles:{" "}
                        {mat.bottle ? (
                          <>
                            {mat.bottle.name} · {mat.bottle.currentStock.toLocaleString()} in stock
                            {afterB != null && units > 0 && (
                              <span className={cn("ml-1 font-semibold", afterB < 0 ? "text-red-600" : "text-emerald-700")}>
                                → {afterB.toLocaleString()}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-amber-700">No {size} bottles found</span>
                        )}
                      </p>
                      <p>
                        Stickers:{" "}
                        {mat.sticker ? (
                          <>
                            {mat.sticker.name} · {mat.sticker.currentStock.toLocaleString()} in stock
                            {afterS != null && units > 0 && (
                              <span className={cn("ml-1 font-semibold", afterS < 0 ? "text-red-600" : "text-emerald-700")}>
                                → {afterS.toLocaleString()}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-amber-700">No {size} Water stickers found</span>
                        )}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border-2 border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/30">
                <p className="text-sm font-semibold text-green-900 dark:text-green-100">Water to fill</p>
                <p className="text-3xl font-bold text-green-700 dark:text-green-300">{packedLitres.toFixed(2)}L</p>
              </div>
              <div className="space-y-2">
                <Label>Defects (optional)</Label>
                <Input type="number" min={0} value={defects} onChange={(e) => setDefects(e.target.value)} />
                <Textarea
                  placeholder="Defect reasons"
                  value={defectReasons}
                  onChange={(e) => setDefectReasons(e.target.value)}
                  className="min-h-[72px]"
                />
              </div>
            </div>
            {(missingBottle || missingSticker || insufficient) && packedLitres > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                Reduce quantities or restock water, bottles, or Water stickers before saving.
              </div>
            )}
            <label className="flex items-center gap-3 rounded-xl border-2 border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/30">
              <input
                type="checkbox"
                checked={safetyChecks}
                onChange={(e) => setSafetyChecks(e.target.checked)}
                className="h-5 w-5"
              />
              <span className="flex items-center gap-2 text-sm font-semibold">
                <CheckCircle className={cn("h-4 w-4", safetyChecks ? "text-green-600" : "text-slate-400")} />
                Safety checks completed
              </span>
            </label>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Link href="/jaba/packaging-output">
            <Button variant="outline">Cancel</Button>
          </Link>
          <Button
            onClick={handleSave}
            disabled={isSaving || packedLitres <= 0 || insufficient || missingBottle || missingSticker}
            className="bg-gradient-to-r from-sky-600 to-blue-700 text-white hover:from-sky-700 hover:to-blue-800"
          >
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save bottled water session
          </Button>
        </div>
      </div>
    </>
  )
}
