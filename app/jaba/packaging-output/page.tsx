"use client"

import { useState, useEffect, useMemo, Fragment } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Plus,
  Search,
  Boxes,
  Users,
  Calendar,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Clock,
  Grid3x3,
  Table as TableIcon,
  Loader2,
  Trash2,
  Layers,
  RefreshCw,
  X,
  ChevronDown,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface PackingMaterialLine {
  flavourName: string
  containerSize: string
  customSizeMl?: string
  quantityPacked: number
  stickersUsed: number
  stickerMaterialName: string
  bottleMaterialName: string
}

interface PackagingOutput {
  _id: string
  id: string
  batchId: string
  batchNumber: string
  packageNumber: string
  packagingSessionGroupId?: string
  packagingSessionLineIndex?: number
  volumeAllocated: number
  packagedLitres: number
  packagingDate: string | Date
  packagingLine: string
  supervisor: string
  teamMembers: string[]
  containers: Array<{
    size: string
    quantity: string | number
    customSize?: string
  }>
  defects: number
  defectReasons: string
  machineEfficiency?: number
  safetyChecks: boolean
  createdAt: string | Date
  flavourName?: string
  packedFlavourName?: string
  packingMaterialLines?: PackingMaterialLine[]
  materialsUsed?: Array<{
    type?: string
    name?: string
    quantity?: number
    flavourName?: string
  }>
}

interface PackagingSession {
  id: string
  sessionId: string
  /** Human-readable title: package # + line + flavour when multi-line shares one package number */
  sessionDisplayTitle: string
  batchNumber: string
  date: Date
  totalLitresUsed: number
  output250ml: number
  output500ml: number
  output1L: number
  output2L: number
  otherSizes?: Array<{ size: string; quantity: number }>
  teamMembers: string[]
  defects: number
  efficiency: number
  machineEfficiency: number
  status: string
  supervisor: string
  packagingLine: string
  defectReasons?: string
  packedFlavourName?: string
  flavourName?: string
  stickerAuditLines?: string[]
  packagingSessionGroupId?: string
  packagingSessionLineIndex?: number
}

type SessionGroup = {
  groupKey: string
  packagingSessionGroupId?: string
  sessions: PackagingSession[]
}

export default function PackagingSessionsPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid")
  const [packagingOutputs, setPackagingOutputs] = useState<PackagingOutput[]>([])
  const [loading, setLoading] = useState(true)

  // Fetch packaging outputs from database
  useEffect(() => {
    console.log('[Packaging Output Page] Component mounted, fetching data...')
    fetchPackagingOutputs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchPackagingOutputs = async () => {
    try {
      console.log('[Packaging Output Page] Starting fetch...')
      setLoading(true)
      
      const response = await fetch('/api/jaba/packaging-output', {
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
        },
      })
      
      console.log('[Packaging Output Page] Fetch response status:', response.status, response.ok)
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('[Packaging Output Page] Response not OK:', errorText)
        toast.error(`Failed to load: ${response.status} ${response.statusText}`)
        setLoading(false)
        return
      }
      
      const data = await response.json()
      console.log('[Packaging Output Page] ✅ API Response received')
      console.log('[Packaging Output Page] Data keys:', Object.keys(data))
      console.log('[Packaging Output Page] Packaging outputs count:', data.packagingOutputs?.length || 0)
      
      if (data.packagingOutputs && Array.isArray(data.packagingOutputs)) {
        console.log('[Packaging Output Page] ✅ Setting packaging outputs:', data.packagingOutputs.length)
        // Log first few items for debugging
        if (data.packagingOutputs.length > 0) {
          console.log('[Packaging Output Page] First packaging output:', {
            _id: data.packagingOutputs[0]._id,
            batchNumber: data.packagingOutputs[0].batchNumber,
            packageNumber: data.packagingOutputs[0].packageNumber,
            containers: data.packagingOutputs[0].containers?.length || 0,
            packagedLitres: data.packagingOutputs[0].packagedLitres,
          })
        } else {
          console.log('[Packaging Output Page] ⚠️ No packaging outputs in database')
        }
        setPackagingOutputs(data.packagingOutputs)
      } else {
        console.error('[Packaging Output Page] ❌ Invalid data format:', data)
        toast.error('Invalid data format received from server')
        setPackagingOutputs([])
      }
    } catch (error: any) {
      console.error('[Packaging Output Page] ❌ Error fetching packaging outputs:', error)
      console.error('[Packaging Output Page] Error details:', error.message, error.stack)
      toast.error(`Error: ${error.message || 'Failed to load packaging sessions'}`)
      setPackagingOutputs([])
    } finally {
      setLoading(false)
      console.log('[Packaging Output Page] Fetch completed, loading set to false')
    }
  }

  const handleDeleteSession = async (id: string, sessionId: string) => {
    if (!confirm(`Delete packaging session ${sessionId}?\n\nThis will restore bottle and sticker stock automatically.`)) {
      return
    }
    try {
      const otpReq = await fetch('/api/jaba/delete-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_packaging', targetId: id }),
      })
      const otpReqData = await otpReq.json().catch(() => ({}))
      if (!otpReq.ok) throw new Error(otpReqData.error || "Failed to send delete OTP")
      const otp = window.prompt(`Enter OTP to delete packaging session ${sessionId}:`)?.trim() || ''
      if (!otp) throw new Error("OTP is required")

      const response = await fetch(`/api/jaba/packaging-output?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { 'x-delete-otp': otp },
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || "Failed to delete packaging session")
      }
      toast.success("Packaging session deleted and materials stock restored.")
      await fetchPackagingOutputs()
    } catch (error: any) {
      toast.error(error?.message || "Failed to delete packaging session")
    }
  }

  // Transform API data to match the expected format
  const packagingSessions: PackagingSession[] = useMemo(() => {
    // Sort by createdAt (most recent first) to ensure latest appear first
    const sortedOutputs = [...packagingOutputs].sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return dateB - dateA // Descending order (newest first)
    })
    
    return sortedOutputs.map((output) => {
      // Calculate output by size from containers
      let output250ml = 0
      let output500ml = 0
      let output1L = 0
      let output2L = 0
      const otherSizes: Array<{ size: string; quantity: number }> = []

      // Check if containers exist and is an array
      if (output.containers && Array.isArray(output.containers)) {
        output.containers.forEach((container) => {
          const quantity = typeof container.quantity === 'string' ? parseFloat(container.quantity) || 0 : container.quantity || 0
          if (container.size === "250ml") {
            output250ml += quantity
          } else if (container.size === "500ml") {
            output500ml += quantity
          } else if (container.size === "1L") {
            output1L += quantity
          } else if (container.size === "2L") {
            output2L += quantity
          } else if (container.customSize) {
            otherSizes.push({ size: container.customSize, quantity })
          }
        })
      } else {
        console.warn('[Packaging Output Page] No containers array found for output:', output._id || output.id)
      }

      // Calculate efficiency: (packagedLitres / volumeAllocated * 100)
      // This shows what percentage of the allocated volume was actually packaged
      // If machineEfficiency is provided, use that; otherwise calculate from packaged/allocated ratio
      let efficiency = 0
      if (output.machineEfficiency && output.machineEfficiency > 0) {
        // Use machine efficiency if provided (user-entered value)
        efficiency = output.machineEfficiency
      } else if (output.volumeAllocated > 0) {
        // Calculate from packaged vs allocated volume
        efficiency = Math.round((output.packagedLitres / output.volumeAllocated) * 100 * 10) / 10
      }

      // Determine status based on data
      let status = "Completed" // Default to completed since it's saved
      if (output.defects > 0) {
        status = "In Progress"
      }

      const packagingDate = output.packagingDate instanceof Date 
        ? output.packagingDate 
        : new Date(output.packagingDate)

      const lines = output.packingMaterialLines
      const stickerAuditLines =
        Array.isArray(lines) && lines.length > 0
          ? lines.map((row) => {
              const sz =
                row.containerSize === "custom" && row.customSizeMl
                  ? `${row.customSizeMl}ml`
                  : row.containerSize
              return `${row.flavourName} · ${sz}: ${row.quantityPacked} bottles, ${row.stickersUsed} stickers (${row.stickerMaterialName})`
            })
          : undefined

      const pkg = output.packageNumber || `PKG-${output.batchNumber}`
      const flavourPart = String(output.flavourName || output.packedFlavourName || "").trim()
      const linePart = String(output.packagingLine || "").trim()
      const sessionDisplayTitle = [pkg, linePart, flavourPart].filter(Boolean).join(" · ")

      const session = {
        id: output._id || output.id,
        sessionId: pkg,
        sessionDisplayTitle,
        batchNumber: output.batchNumber,
        date: packagingDate,
        totalLitresUsed: output.packagedLitres || 0,
        output250ml,
        output500ml,
        output1L,
        output2L,
        otherSizes: otherSizes.length > 0 ? otherSizes : undefined,
        teamMembers: output.teamMembers || [],
        defects: output.defects || 0,
        efficiency,
        machineEfficiency: output.machineEfficiency || efficiency,
        status,
        supervisor: output.supervisor || "N/A",
        packagingLine: output.packagingLine || "N/A",
        defectReasons: output.defectReasons || undefined,
        packedFlavourName: output.packedFlavourName || output.flavourName,
        flavourName: output.flavourName,
        stickerAuditLines,
        packagingSessionGroupId:
          typeof output.packagingSessionGroupId === "string" && output.packagingSessionGroupId.trim()
            ? output.packagingSessionGroupId.trim()
            : undefined,
        packagingSessionLineIndex:
          typeof output.packagingSessionLineIndex === "number" && Number.isFinite(output.packagingSessionLineIndex)
            ? output.packagingSessionLineIndex
            : undefined,
      }

      return session
    })
  }, [packagingOutputs])

  const filteredSessions = useMemo(() => {
    return packagingSessions.filter((session) => {
    const q = searchQuery.toLowerCase()
    const matchesSearch =
      session.sessionId.toLowerCase().includes(q) ||
      session.sessionDisplayTitle.toLowerCase().includes(q) ||
      session.batchNumber.toLowerCase().includes(q) ||
      (session.flavourName && session.flavourName.toLowerCase().includes(q)) ||
      (session.packagingSessionGroupId && session.packagingSessionGroupId.toLowerCase().includes(q))
    const matchesStatus = statusFilter === "all" || session.status === statusFilter
    return matchesSearch && matchesStatus
  })
  }, [packagingSessions, searchQuery, statusFilter])

  const groupedFilteredSessions = useMemo((): SessionGroup[] => {
    const map = new Map<string, PackagingSession[]>()
    const order: string[] = []
    for (const s of filteredSessions) {
      const gid = s.packagingSessionGroupId?.trim()
      const key = gid ? `grp:${gid}` : `solo:${s.id}`
      if (!map.has(key)) {
        order.push(key)
        map.set(key, [])
      }
      map.get(key)!.push(s)
    }
    return order.map((key) => {
      const sessions = map.get(key)!
      const sorted = [...sessions].sort((a, b) => {
        const ai = a.packagingSessionLineIndex ?? 0
        const bi = b.packagingSessionLineIndex ?? 0
        if (ai !== bi) return ai - bi
        return a.sessionDisplayTitle.localeCompare(b.sessionDisplayTitle)
      })
      return {
        groupKey: key,
        packagingSessionGroupId: key.startsWith("grp:") ? key.slice(4) : undefined,
        sessions: sorted,
      }
    })
  }, [filteredSessions])

  const sessionStripeIndex = useMemo(() => {
    const m = new Map<string, number>()
    filteredSessions.forEach((s, i) => m.set(s.id, i))
    return m
  }, [filteredSessions])

  const stats = useMemo(() => {
    const bottles = packagingSessions.reduce((n, s) => n + sessionTotalBottles(s), 0)
    const litres = packagingSessions.reduce((n, s) => n + s.totalLitresUsed, 0)
    const defects = packagingSessions.reduce((n, s) => n + s.defects, 0)
    const completed = packagingSessions.filter((s) => s.status === "Completed").length
    const avgEfficiency =
      packagingSessions.length > 0
        ? Math.round((packagingSessions.reduce((n, s) => n + s.efficiency, 0) / packagingSessions.length) * 10) / 10
        : 0
    return { bottles, litres, defects, completed, avgEfficiency }
  }, [packagingSessions])

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: packagingSessions.length, Pending: 0, "In Progress": 0, Completed: 0 }
    for (const s of packagingSessions) counts[s.status] = (counts[s.status] ?? 0) + 1
    return counts
  }, [packagingSessions])

  const hasFilters = searchQuery.trim() !== "" || statusFilter !== "all"

  return (
    <>
      {/* ───────────── Page header ───────────── */}
      <header className="sticky top-0 z-30 border-b border-border bg-card/90 backdrop-blur supports-[backdrop-filter]:bg-card/75">
        <div className="flex flex-col gap-3 px-4 py-3 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-red-700 text-white shadow-md shadow-red-500/25">
              <Boxes className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold leading-tight text-foreground sm:text-xl">
                Packaging Sessions
              </h1>
              <p className="truncate text-xs text-muted-foreground sm:text-sm">
                Track what was bottled, labelled and rejected after production
              </p>
            </div>
          </div>
          <div className="flex w-full items-center gap-2 md:w-auto">
            <Button
              variant="outline"
              onClick={fetchPackagingOutputs}
              disabled={loading}
              className="h-10 flex-1 md:flex-none"
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Refresh
            </Button>
            <Link href="/jaba/packaging-output/add" className="flex-[2] md:flex-none">
              <Button className="h-10 w-full bg-gradient-to-r from-red-600 to-red-700 shadow-md shadow-red-500/25 hover:from-red-700 hover:to-red-800">
                <Plus className="mr-2 h-4 w-4" />
                New Session
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1800px] space-y-5 bg-slate-50/60 p-3 dark:bg-transparent sm:p-4 md:p-6">
        {loading ? (
          <PageSkeleton />
        ) : packagingSessions.length === 0 && packagingOutputs.length === 0 ? (
          <Card className="border-dashed border-border bg-card shadow-none">
            <CardContent className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400">
                <Boxes className="h-7 w-7" />
              </div>
              <div>
                <p className="text-base font-semibold text-foreground">No packaging sessions yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Start a session to record bottles filled, stickers used and defects.
                </p>
              </div>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <Link href="/jaba/packaging-output/add">
                  <Button className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800">
                    <Plus className="mr-2 h-4 w-4" />
                    Create Packaging Session
                  </Button>
                </Link>
                <Link href="/jaba/batches">
                  <Button variant="outline">Go to Batches</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : packagingSessions.length === 0 && packagingOutputs.length > 0 ? (
          <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20">
            <CardContent className="flex flex-col items-center justify-center gap-3 p-12 text-center">
              <AlertCircle className="h-8 w-8 text-amber-500" />
              <p className="font-medium text-foreground">Data transformation issue</p>
              <p className="text-sm text-muted-foreground">
                Found {packagingOutputs.length} packaging output(s) but couldn&apos;t transform them. Check console for details.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* ───────────── Summary strip ───────────── */}
            <Card className="overflow-hidden border-border/70 shadow-sm">
              <div className="grid grid-cols-2 divide-x divide-y divide-border/70 lg:grid-cols-4 lg:divide-y-0">
                <StatTile
                  icon={Boxes}
                  tone="red"
                  label="Total sessions"
                  value={packagingSessions.length.toLocaleString()}
                  hint={`${stats.bottles.toLocaleString()} bottles · ${formatLitres(stats.litres)} L`}
                />
                <StatTile
                  icon={CheckCircle2}
                  tone="emerald"
                  label="Completed"
                  value={stats.completed.toLocaleString()}
                  hint={`of ${packagingSessions.length} sessions`}
                />
                <StatTile
                  icon={AlertCircle}
                  tone="amber"
                  label="Total defects"
                  value={stats.defects.toLocaleString()}
                  hint="Rejected bottles"
                />
                <StatTile
                  icon={TrendingUp}
                  tone="blue"
                  label="Avg efficiency"
                  value={`${stats.avgEfficiency}%`}
                  hint="Average packaging rate"
                />
              </div>
            </Card>

            {/* ───────────── Toolbar ───────────── */}
            <Card className="border-border/70 shadow-sm">
              <CardContent className="flex flex-col gap-3 p-3 sm:p-4 lg:flex-row lg:items-center">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search session, batch or flavour…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-10 border-border bg-background pl-9 pr-9"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      aria-label="Clear search"
                      className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5 lg:pb-0">
                  {STATUS_FILTERS.map((f) => {
                    const active = statusFilter === f.value
                    return (
                      <button
                        key={f.value}
                        type="button"
                        onClick={() => setStatusFilter(f.value)}
                        className={cn(
                          "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                          active
                            ? "border-red-600 bg-red-600 text-white shadow-sm"
                            : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                      >
                        {f.label}
                        <span
                          className={cn(
                            "rounded-full px-1.5 text-[10px] font-semibold tabular-nums",
                            active ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
                          )}
                        >
                          {statusCounts[f.value] ?? 0}
                        </span>
                      </button>
                    )
                  })}
                </div>

                <div className="inline-flex shrink-0 self-start rounded-lg border border-border bg-muted/50 p-0.5 lg:self-auto">
                  {(
                    [
                      { mode: "grid", label: "Cards", Icon: Grid3x3 },
                      { mode: "table", label: "Table", Icon: TableIcon },
                    ] as const
                  ).map(({ mode, label, Icon }) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setViewMode(mode)}
                      aria-pressed={viewMode === mode}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                        viewMode === mode
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* ───────────── Results ───────────── */}
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-foreground sm:text-base">
                Sessions
                <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
                  {filteredSessions.length}
                  {hasFilters ? ` of ${packagingSessions.length}` : ""}
                </span>
              </h2>
              {hasFilters && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("")
                    setStatusFilter("all")
                  }}
                  className="text-xs font-medium text-red-600 hover:underline dark:text-red-400"
                >
                  Clear filters
                </button>
              )}
            </div>

            {filteredSessions.length === 0 ? (
              <Card className="border-dashed border-border bg-card shadow-none">
                <CardContent className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Search className="h-5 w-5" />
                  </div>
                  <p className="text-base font-semibold text-foreground">No sessions match</p>
                  <p className="text-sm text-muted-foreground">Try a different search or status filter.</p>
                </CardContent>
              </Card>
            ) : viewMode === "grid" ? (
              <div className="space-y-5">
                {groupedFilteredSessions.map((group) => {
                  const groupLitres = group.sessions.reduce((a, s) => a + s.totalLitresUsed, 0)
                  const multi = group.sessions.length > 1
                  return (
                    <section
                      key={group.groupKey}
                      title={group.packagingSessionGroupId}
                      className={cn(
                        multi &&
                          "rounded-2xl border border-indigo-200/80 bg-indigo-50/40 p-3 dark:border-indigo-900/55 dark:bg-indigo-950/25 sm:p-4"
                      )}
                    >
                      {multi && (
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                          <Badge
                            variant="outline"
                            className="border-indigo-300 bg-white/80 text-indigo-800 dark:border-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-100"
                          >
                            <Layers className="mr-1 h-3 w-3" />
                            Multi-flavour save
                          </Badge>
                          <span className="text-sm font-semibold text-foreground">{group.sessions[0]?.sessionId}</span>
                          <span className="text-xs text-muted-foreground">
                            {group.sessions.length} lines · {groupLitres.toFixed(2)} L · {group.sessions[0]?.batchNumber}
                          </span>
                        </div>
                      )}
                      <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                        {group.sessions.map((session) => (
                          <SessionCard
                            key={session.id}
                            session={session}
                            grouped={multi}
                            onDelete={() => handleDeleteSession(session.id, session.sessionId)}
                          />
                        ))}
                      </div>
                    </section>
                  )
                })}
              </div>
            ) : (
              <Card className="overflow-hidden border-border/70 shadow-sm">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b border-border bg-muted/50 hover:bg-muted/50">
                        {[
                          { label: "Session", cls: "min-w-[220px]" },
                          { label: "Date", cls: "" },
                          { label: "Litres", cls: "text-right" },
                          { label: "Output", cls: "min-w-[260px]" },
                          { label: "Flavour / stickers", cls: "min-w-[200px]" },
                          { label: "Team", cls: "min-w-[150px]" },
                          { label: "Defects", cls: "text-center" },
                          { label: "Efficiency", cls: "min-w-[140px]" },
                          { label: "Status", cls: "text-center" },
                          { label: "", cls: "w-[60px] text-right" },
                        ].map((h, i) => (
                          <TableHead
                            key={i}
                            className={cn(
                              "h-11 whitespace-nowrap px-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground",
                              h.cls
                            )}
                          >
                            {h.label || <span className="sr-only">Actions</span>}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groupedFilteredSessions.map((group) => {
                        const multi = group.sessions.length > 1
                        const groupLitres = group.sessions.reduce((a, s) => a + s.totalLitresUsed, 0)
                        return (
                          <Fragment key={group.groupKey}>
                            {multi && (
                              <TableRow className="border-b border-indigo-200/70 bg-indigo-50/80 hover:bg-indigo-50/80 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:hover:bg-indigo-950/40">
                                <TableCell colSpan={10} className="px-4 py-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Layers className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
                                    <Badge
                                      variant="outline"
                                      className="border-indigo-300 bg-white/80 text-indigo-800 dark:border-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-100"
                                    >
                                      Multi-flavour save
                                    </Badge>
                                    <span className="text-sm font-semibold">{group.sessions[0]?.sessionId}</span>
                                    <span className="text-xs text-muted-foreground">
                                      {group.sessions.length} lines · {groupLitres.toFixed(2)} L · {group.sessions[0]?.batchNumber}
                                    </span>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                            {group.sessions.map((session) => {
                              const totalOutput = sessionTotalBottles(session)
                              const status = statusStyle(session.status)
                              const StatusIcon = status.Icon
                              const tone = efficiencyTone(session.efficiency)
                              return (
                                <TableRow
                                  key={session.id}
                                  className={cn(
                                    "group border-b border-border/70 transition-colors hover:bg-muted/40",
                                    multi && "border-l-[3px] border-l-indigo-400 dark:border-l-indigo-500"
                                  )}
                                >
                                  <TableCell className="px-4 py-3 align-top">
                                    <div className="max-w-[300px] text-sm font-semibold leading-snug text-foreground">
                                      {session.sessionDisplayTitle}
                                    </div>
                                    <div className="mt-0.5 text-xs text-muted-foreground">{session.batchNumber}</div>
                                  </TableCell>
                                  <TableCell className="whitespace-nowrap px-4 py-3 align-top text-sm text-muted-foreground">
                                    {formatSessionDate(session.date)}
                                  </TableCell>
                                  <TableCell className="whitespace-nowrap px-4 py-3 text-right align-top text-sm font-semibold tabular-nums text-foreground">
                                    {formatLitres(session.totalLitresUsed)}
                                    <span className="ml-0.5 text-xs font-medium text-muted-foreground">L</span>
                                  </TableCell>
                                  <TableCell className="px-4 py-3 align-top">
                                    <SizeChips session={session} />
                                    <p className="mt-1.5 text-xs text-muted-foreground">
                                      Total{" "}
                                      <span className="font-semibold text-foreground tabular-nums">
                                        {totalOutput.toLocaleString()}
                                      </span>{" "}
                                      bottles
                                    </p>
                                  </TableCell>
                                  <TableCell className="max-w-[320px] px-4 py-3 align-top">
                                    <div className="space-y-1 text-xs">
                                      {session.packedFlavourName && (
                                        <p className="font-medium text-violet-800 dark:text-violet-200">
                                          {session.packedFlavourName}
                                        </p>
                                      )}
                                      {session.stickerAuditLines && session.stickerAuditLines.length > 0 ? (
                                        <ul className="list-disc space-y-0.5 pl-4 text-[11px] leading-snug text-muted-foreground">
                                          {session.stickerAuditLines.map((line, li) => (
                                            <li key={li}>{line}</li>
                                          ))}
                                        </ul>
                                      ) : (
                                        <p className="text-[11px] text-muted-foreground">
                                          {session.packedFlavourName ? "No per-size sticker log (older session)." : "—"}
                                        </p>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell className="px-4 py-3 align-top">
                                    <p className="text-xs font-medium text-foreground">{session.supervisor}</p>
                                    <p className="text-[11px] text-muted-foreground">{session.packagingLine}</p>
                                    {session.teamMembers.length > 0 && (
                                      <p
                                        className="mt-1 text-[11px] text-muted-foreground"
                                        title={session.teamMembers.join(", ")}
                                      >
                                        {session.teamMembers.slice(0, 2).join(", ")}
                                        {session.teamMembers.length > 2 && ` +${session.teamMembers.length - 2}`}
                                      </p>
                                    )}
                                  </TableCell>
                                  <TableCell className="px-4 py-3 text-center align-top">
                                    <span
                                      className={cn(
                                        "inline-flex min-w-[2rem] items-center justify-center rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums",
                                        session.defects > 0
                                          ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                                          : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                                      )}
                                    >
                                      {session.defects}
                                    </span>
                                  </TableCell>
                                  <TableCell className="px-4 py-3 align-top">
                                    <EfficiencyMeter value={session.efficiency} tone={tone} />
                                  </TableCell>
                                  <TableCell className="px-4 py-3 text-center align-top">
                                    <span
                                      className={cn(
                                        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium",
                                        status.badge
                                      )}
                                    >
                                      <StatusIcon className="h-3 w-3" />
                                      {session.status}
                                    </span>
                                  </TableCell>
                                  <TableCell className="px-4 py-3 text-right align-top">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleDeleteSession(session.id, session.sessionId)}
                                      aria-label={`Delete ${session.sessionId}`}
                                      title="Delete session"
                                      className="h-8 w-8 text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </Fragment>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </>
  )
}

/* ════════════════════════════════════════════════════════════
   Presentation helpers
════════════════════════════════════════════════════════════ */

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "Completed", label: "Completed" },
  { value: "In Progress", label: "In progress" },
  { value: "Pending", label: "Pending" },
] as const

function statusStyle(status: string): { badge: string; bar: string; Icon: LucideIcon } {
  switch (status) {
    case "Completed":
      return {
        badge:
          "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300",
        bar: "bg-emerald-500",
        Icon: CheckCircle2,
      }
    case "In Progress":
      return {
        badge:
          "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300",
        bar: "bg-amber-500",
        Icon: Clock,
      }
    case "Pending":
      return {
        badge:
          "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
        bar: "bg-slate-400",
        Icon: AlertCircle,
      }
    default:
      return {
        badge:
          "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
        bar: "bg-slate-400",
        Icon: AlertCircle,
      }
  }
}

function efficiencyTone(value: number): { text: string; bar: string } {
  if (value >= 95) return { text: "text-emerald-700 dark:text-emerald-300", bar: "bg-emerald-500" }
  if (value >= 90) return { text: "text-amber-700 dark:text-amber-300", bar: "bg-amber-500" }
  return { text: "text-red-700 dark:text-red-300", bar: "bg-red-500" }
}

function sessionTotalBottles(s: PackagingSession): number {
  return (
    s.output250ml +
    s.output500ml +
    s.output1L +
    s.output2L +
    (s.otherSizes?.reduce((sum, o) => sum + o.quantity, 0) || 0)
  )
}

function formatLitres(n: number): string {
  if (!Number.isFinite(n)) return "0"
  return Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function formatSessionDate(d: Date): string {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function formatCustomSize(size: string): string {
  const s = String(size ?? "").trim()
  return /^\d+(\.\d+)?$/.test(s) ? `${s}ml` : s
}

function getSizeEntries(s: PackagingSession): Array<{ label: string; qty: number; dot: string }> {
  const out: Array<{ label: string; qty: number; dot: string }> = []
  if (s.output250ml > 0) out.push({ label: "250ml", qty: s.output250ml, dot: "bg-fuchsia-500" })
  if (s.output500ml > 0) out.push({ label: "500ml", qty: s.output500ml, dot: "bg-purple-500" })
  if (s.output1L > 0) out.push({ label: "1L", qty: s.output1L, dot: "bg-emerald-500" })
  if (s.output2L > 0) out.push({ label: "2L", qty: s.output2L, dot: "bg-amber-500" })
  for (const o of s.otherSizes ?? []) {
    out.push({ label: formatCustomSize(o.size), qty: o.quantity, dot: "bg-slate-400" })
  }
  return out
}

const STAT_TONES = {
  red: "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400",
  emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
  blue: "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400",
} as const

function StatTile({
  icon: Icon,
  tone,
  label,
  value,
  hint,
}: {
  icon: LucideIcon
  tone: keyof typeof STAT_TONES
  label: string
  value: string
  hint: string
}) {
  return (
    <div className="flex items-center gap-3 p-4 sm:p-5">
      <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", STAT_TONES[tone])}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold leading-tight tracking-tight text-foreground tabular-nums">{value}</p>
        <p className="truncate text-[11px] text-muted-foreground">{hint}</p>
      </div>
    </div>
  )
}

function SizeChips({ session }: { session: PackagingSession }) {
  const entries = getSizeEntries(session)
  if (entries.length === 0) {
    return <span className="text-xs text-muted-foreground">No output recorded</span>
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map((e, i) => (
        <span
          key={`${e.label}-${i}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs"
        >
          <span className={cn("h-2 w-2 rounded-full", e.dot)} />
          <span className="font-semibold text-foreground tabular-nums">{e.qty.toLocaleString()}</span>
          <span className="text-muted-foreground">{e.label}</span>
        </span>
      ))}
    </div>
  )
}

function EfficiencyMeter({ value, tone }: { value: number; tone: { text: string; bar: string } }) {
  const pct = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0))
  return (
    <div className="min-w-[110px]">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className={cn("font-semibold tabular-nums", tone.text)}>{value}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-all", tone.bar)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function SessionCard({
  session,
  grouped,
  onDelete,
}: {
  session: PackagingSession
  grouped: boolean
  onDelete: () => void
}) {
  const status = statusStyle(session.status)
  const StatusIcon = status.Icon
  const tone = efficiencyTone(session.efficiency)
  const totalOutput = sessionTotalBottles(session)
  const hasAudit =
    Boolean(session.packedFlavourName) || Boolean(session.stickerAuditLines && session.stickerAuditLines.length > 0)
  const teamLabel = session.teamMembers.length
    ? `${session.teamMembers.slice(0, 2).join(", ")}${
        session.teamMembers.length > 2 ? ` +${session.teamMembers.length - 2}` : ""
      }`
    : "No team listed"

  return (
    <Card
      className={cn(
        "group flex flex-col overflow-hidden border-border/70 bg-card py-0 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
        grouped && "ring-1 ring-indigo-200/60 dark:ring-indigo-900/50"
      )}
    >
      <div className={cn("h-1 w-full", status.bar)} />

      <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold leading-snug text-foreground" title={session.sessionDisplayTitle}>
            {session.sessionDisplayTitle}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span className="font-medium text-foreground/80">{session.batchNumber}</span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatSessionDate(session.date)}
            </span>
          </div>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium",
            status.badge
          )}
        >
          <StatusIcon className="h-3 w-3" />
          {session.status}
        </span>
      </div>

      <div className="flex-1 space-y-4 px-4 pb-4">
        {/* Key figures */}
        <div className="grid grid-cols-3 divide-x divide-border/70 rounded-xl bg-muted/50 py-2.5">
          <div className="px-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Litres</p>
            <p className="text-lg font-semibold leading-tight text-foreground tabular-nums">
              {formatLitres(session.totalLitresUsed)}
              <span className="ml-0.5 text-xs font-medium text-muted-foreground">L</span>
            </p>
          </div>
          <div className="px-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Bottles</p>
            <p className="text-lg font-semibold leading-tight text-foreground tabular-nums">
              {totalOutput.toLocaleString()}
            </p>
          </div>
          <div className="px-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Defects</p>
            <p
              className={cn(
                "text-lg font-semibold leading-tight tabular-nums",
                session.defects > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"
              )}
            >
              {session.defects}
            </p>
          </div>
        </div>

        {/* Output by size */}
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Output by size</p>
          <SizeChips session={session} />
        </div>

        {/* Efficiency */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="inline-flex items-center gap-1 font-medium text-muted-foreground">
              <TrendingUp className="h-3 w-3" />
              Efficiency
            </span>
            <span className={cn("font-semibold tabular-nums", tone.text)}>{session.efficiency}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full transition-all", tone.bar)}
              style={{ width: `${Math.min(100, Math.max(0, session.efficiency))}%` }}
            />
          </div>
        </div>

        {/* Sticker audit (collapsed to keep cards short) */}
        {hasAudit && (
          <details className="group/audit rounded-xl border border-violet-200 bg-violet-50/60 dark:border-violet-900/60 dark:bg-violet-950/20">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-semibold text-violet-800 marker:hidden dark:text-violet-200 [&::-webkit-details-marker]:hidden">
              <span className="min-w-0 truncate">
                {session.packedFlavourName ? `Flavour: ${session.packedFlavourName}` : "Stickers consumed (audit)"}
              </span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform group-open/audit:rotate-180" />
            </summary>
            <div className="border-t border-violet-200/70 px-3 py-2 dark:border-violet-900/50">
              <p className="text-[10px] font-bold uppercase tracking-wide text-violet-700 dark:text-violet-300">
                Stickers consumed (audit)
              </p>
              {session.stickerAuditLines && session.stickerAuditLines.length > 0 ? (
                <ul className="mt-1.5 space-y-1 text-xs text-violet-900 dark:text-violet-100">
                  {session.stickerAuditLines.map((line, i) => (
                    <li key={i} className="leading-snug">
                      {line}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  Line-level detail not stored for this session (older record).
                </p>
              )}
            </div>
          </details>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 border-t border-border/70 bg-muted/30 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5 shrink-0" />
          <div className="min-w-0 leading-tight">
            <p className="truncate font-medium text-foreground/90" title={session.supervisor}>
              {session.supervisor}
              <span className="font-normal text-muted-foreground"> · {session.packagingLine}</span>
            </p>
            <p className="truncate text-[11px]" title={session.teamMembers.join(", ")}>
              {teamLabel}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          aria-label={`Delete ${session.sessionId}`}
          title="Delete session"
          className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  )
}

function PageSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading packaging sessions">
      <Card className="overflow-hidden border-border/70 shadow-sm">
        <div className="grid grid-cols-2 divide-x divide-y divide-border/70 lg:grid-cols-4 lg:divide-y-0">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-4 sm:p-5">
              <Skeleton className="h-11 w-11 rounded-xl" />
              <div className="space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-6 w-14" />
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Skeleton className="h-[66px] w-full rounded-xl" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="overflow-hidden border-border/70 py-0 shadow-sm">
            <Skeleton className="h-1 w-full rounded-none" />
            <div className="space-y-4 p-4">
              <div className="space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-16 w-full rounded-xl" />
              <div className="flex gap-2">
                <Skeleton className="h-7 w-20 rounded-md" />
                <Skeleton className="h-7 w-20 rounded-md" />
                <Skeleton className="h-7 w-16 rounded-md" />
              </div>
              <Skeleton className="h-2 w-full rounded-full" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
