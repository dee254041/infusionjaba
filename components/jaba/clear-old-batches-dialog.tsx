"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Eraser,
  Loader2,
  PackageX,
  RotateCcw,
  Search,
  XCircle,
} from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import {
  BATCH_CLEAR_REASONS,
  type BatchClearCandidatesResponse,
  type BatchClearResponse,
  type BatchClearResultRow,
  type BatchClosureRecord,
  type BatchLeftoverSummary,
} from "@/lib/jaba-batch-closure-types"

type ClearedBatchLike = {
  _id: string
  batchNumber: string
  closure?: BatchClosureRecord
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Batches that are already cleared (from the batches list), for the "Already cleared" tab. */
  clearedBatches: ClearedBatchLike[]
  /** Called after anything changed so the page can refresh its list. */
  onChanged: () => void | Promise<void>
}

type Step = "select" | "review" | "done"

const CONFIRM_WORD = "CLEAR"

function fmtLitres(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 L"
  if (n < 0.005) return "<0.01 L"
  return `${n.toFixed(2)} L`
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString()
}

/** Everything that is left in one batch, itemised. */
function LeftoverBreakdown({ summary }: { summary: BatchLeftoverSummary }) {
  return (
    <div className="space-y-1.5 text-xs">
      {summary.neutralLitres > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-md bg-slate-50 dark:bg-slate-800/60 px-2.5 py-1.5">
          <span className="text-slate-600 dark:text-slate-300">Produced, never allocated or packaged</span>
          <span className="font-semibold text-slate-900 dark:text-slate-100">{fmtLitres(summary.neutralLitres)}</span>
        </div>
      )}
      {summary.lines.map((line) => (
        <div
          key={line.key}
          className="rounded-md bg-slate-50 dark:bg-slate-800/60 px-2.5 py-1.5 space-y-1"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium text-slate-800 dark:text-slate-100">
              {line.label}
              {line.lineCode ? (
                <span className="ml-1.5 font-normal text-slate-500 dark:text-slate-400">{line.lineCode}</span>
              ) : null}
            </span>
          </div>
          {line.unpackedLitres > 0 && (
            <div className="flex items-center justify-between gap-3 text-slate-600 dark:text-slate-300">
              <span>Allocated, never packaged</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">{fmtLitres(line.unpackedLitres)}</span>
            </div>
          )}
          {line.bottleCount > 0 && (
            <div className="flex items-start justify-between gap-3 text-slate-600 dark:text-slate-300">
              <span>Packaged, never delivered</span>
              <span className="text-right font-semibold text-amber-700 dark:text-amber-300">
                {line.bottles.map((b) => `${b.quantity.toLocaleString()} × ${b.size}`).join(" · ")}
                <span className="ml-1 font-normal text-slate-500 dark:text-slate-400">({fmtLitres(line.bottleLitres)})</span>
              </span>
            </div>
          )}
          {line.unreconciledLitres > 0 && (
            <div className="flex items-center justify-between gap-3 text-slate-600 dark:text-slate-300">
              <span>Packaged litres not matched to bottles</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">{fmtLitres(line.unreconciledLitres)}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export function ClearOldBatchesDialog({ open, onOpenChange, clearedBatches, onChanged }: Props) {
  const [tab, setTab] = useState<"clear" | "cleared">("clear")
  const [step, setStep] = useState<Step>("select")
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<BatchLeftoverSummary[]>([])
  const [excludedNotProcessed, setExcludedNotProcessed] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState("")
  const [olderThanDays, setOlderThanDays] = useState("30")
  const [reason, setReason] = useState<string>(BATCH_CLEAR_REASONS[0])
  const [note, setNote] = useState("")
  const [confirmText, setConfirmText] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [results, setResults] = useState<BatchClearResultRow[] | null>(null)
  const [reopenConfirmId, setReopenConfirmId] = useState<string | null>(null)
  const [reopeningId, setReopeningId] = useState<string | null>(null)

  const loadCandidates = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch("/api/jaba/batches/clear", { cache: "no-store" })
      const data = (await res.json().catch(() => ({}))) as Partial<BatchClearCandidatesResponse> & {
        error?: string
        details?: string
      }
      if (!res.ok) throw new Error(data.details || data.error || "Failed to load batches")
      setCandidates(data.candidates ?? [])
      setExcludedNotProcessed(data.excludedNotProcessed ?? 0)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load batches")
    } finally {
      setLoading(false)
    }
  }, [])

  // Fresh state + fresh server numbers every time the dialog opens.
  useEffect(() => {
    if (!open) return
    setTab("clear")
    setStep("select")
    setSelected(new Set())
    setQuery("")
    setReason(BATCH_CLEAR_REASONS[0])
    setNote("")
    setConfirmText("")
    setResults(null)
    setReopenConfirmId(null)
    void loadCandidates()
  }, [open, loadCandidates])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return candidates
    return candidates.filter(
      (c) =>
        c.batchNumber.toLowerCase().includes(q) ||
        c.flavourLabel.toLowerCase().includes(q) ||
        c.lines.some((l) => l.label.toLowerCase().includes(q))
    )
  }, [candidates, query])

  const selectedList = useMemo(
    () => candidates.filter((c) => selected.has(c.batchId)),
    [candidates, selected]
  )
  const totals = useMemo(
    () => ({
      litres: selectedList.reduce((s, c) => s + c.totalLossLitres, 0),
      bottles: selectedList.reduce((s, c) => s + c.totalBottleCount, 0),
      withStock: selectedList.filter((c) => c.hasStock).length,
    }),
    [selectedList]
  )

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  const selectOlderThan = () => {
    const days = Number(olderThanDays)
    if (!Number.isFinite(days) || days < 0) {
      toast.error("Enter a number of days (0 or more).")
      return
    }
    const ids = visible.filter((c) => c.ageDays >= days).map((c) => c.batchId)
    setSelected(new Set(ids))
    if (ids.length === 0) toast.info(`No batches are ${days} days old or older.`)
  }

  const selectMinorOnly = () => {
    const ids = visible.filter((c) => !c.hasStock && c.totalLossLitres < 1).map((c) => c.batchId)
    setSelected(new Set(ids))
    if (ids.length === 0) toast.info("No batches with only a minor leftover (under 1 L, no bottles).")
  }

  const reasonNeedsNote = reason === "Other"
  const canSubmit =
    selectedList.length > 0 &&
    confirmText.trim().toUpperCase() === CONFIRM_WORD &&
    !!reason &&
    (!reasonNeedsNote || note.trim().length > 0) &&
    !submitting

  const submit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/jaba/batches/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchIds: selectedList.map((c) => c.batchId),
          reason,
          note: note.trim() || undefined,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as Partial<BatchClearResponse> & {
        error?: string
        details?: string
      }
      if (!res.ok) throw new Error(data.details || data.error || "Failed to clear batches")
      const rows = data.results ?? []
      setResults(rows)
      setStep("done")
      const ok = data.cleared ?? 0
      const failed = data.failed ?? 0
      if (failed === 0) toast.success(`Cleared ${ok} batch${ok === 1 ? "" : "es"}.`)
      else toast.warning(`Cleared ${ok}, ${failed} could not be cleared. See details.`)
      await onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to clear batches")
    } finally {
      setSubmitting(false)
    }
  }

  const reopen = async (batchId: string) => {
    setReopeningId(batchId)
    try {
      const res = await fetch("/api/jaba/batches/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reopen", batchId }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; details?: string; batchNumber?: string }
      if (!res.ok) throw new Error(data.details || data.error || "Failed to reopen batch")
      toast.success(`Batch ${data.batchNumber ?? ""} reopened. Its leftover is back.`)
      setReopenConfirmId(null)
      await onChanged()
      await loadCandidates()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to reopen batch")
    } finally {
      setReopeningId(null)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (submitting) return
        onOpenChange(next)
      }}
    >
      <DialogContent className="flex flex-col sm:max-w-3xl w-[calc(100vw-1.5rem)] max-h-[92vh] p-0 gap-0 rounded-2xl">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-slate-200 dark:border-slate-800">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Eraser className="h-5 w-5 text-rose-600 dark:text-rose-400" />
            Clear Old Batches
          </DialogTitle>
          <DialogDescription>
            Close out batches that never show as sold out because of a small leftover. You see exactly what is
            inside each one before anything is written off as a loss.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as "clear" | "cleared")}
          className="flex-1 min-h-0 flex flex-col gap-0"
        >
          <div className="px-6 pt-3">
            <TabsList>
              <TabsTrigger value="clear">To clear{candidates.length > 0 ? ` (${candidates.length})` : ""}</TabsTrigger>
              <TabsTrigger value="cleared">Already cleared ({clearedBatches.length})</TabsTrigger>
            </TabsList>
          </div>

          {/* ───────────── To clear ───────────── */}
          <TabsContent value="clear" className="flex-1 min-h-0 flex flex-col">
            {loading ? (
              <div className="flex-1 flex items-center justify-center gap-3 py-16 text-slate-500">
                <Loader2 className="h-5 w-5 animate-spin" />
                Checking what is left in each batch…
              </div>
            ) : loadError ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16 px-6 text-center">
                <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
                <Button variant="outline" onClick={() => void loadCandidates()}>
                  Try again
                </Button>
              </div>
            ) : step === "done" && results ? (
              <>
                <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-2">
                  {results.map((r) => (
                    <div
                      key={r.batchId}
                      className={cn(
                        "flex items-start gap-3 rounded-lg border p-3 text-sm",
                        r.ok
                          ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20"
                          : "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20"
                      )}
                    >
                      {r.ok ? (
                        <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-600 shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 mt-0.5 text-red-600 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 dark:text-slate-100">
                          {r.batchNumber || r.batchId}
                        </p>
                        {r.ok ? (
                          <p className="text-slate-600 dark:text-slate-300">
                            Cleared · wrote off {fmtLitres(r.totalLossLitres ?? 0)}
                            {r.totalBottleCount ? ` incl. ${r.totalBottleCount.toLocaleString()} bottles` : ""}
                          </p>
                        ) : (
                          <p className="text-red-700 dark:text-red-300">{r.error || "Could not be cleared"}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex justify-end">
                  <Button onClick={() => onOpenChange(false)}>Done</Button>
                </div>
              </>
            ) : candidates.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 py-16 px-6 text-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                <p className="font-semibold text-slate-900 dark:text-slate-100">Nothing to clear</p>
                <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md">
                  Every processed batch is either sold out or already cleared.
                  {excludedNotProcessed > 0
                    ? ` ${excludedNotProcessed} batch${excludedNotProcessed === 1 ? " is" : "es are"} still being processed and can't be cleared yet.`
                    : ""}
                </p>
              </div>
            ) : step === "select" ? (
              <>
                <div className="px-6 pt-3 pb-2 space-y-2">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search batch or flavour…"
                        className="pl-9 h-9"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-500 whitespace-nowrap">Older than</span>
                      <Input
                        type="number"
                        min={0}
                        value={olderThanDays}
                        onChange={(e) => setOlderThanDays(e.target.value)}
                        className="h-9 w-16"
                      />
                      <span className="text-xs text-slate-500">days</span>
                      <Button type="button" variant="outline" size="sm" className="h-9" onClick={selectOlderThan}>
                        Select
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={selectMinorOnly}>
                      Select minor leftovers only (&lt; 1 L, no bottles)
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => setSelected(new Set(visible.map((c) => c.batchId)))}
                    >
                      Select all shown
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => setSelected(new Set())}
                      disabled={selected.size === 0}
                    >
                      Clear selection
                    </Button>
                    {excludedNotProcessed > 0 && (
                      <span className="text-slate-500 dark:text-slate-400 ml-auto">
                        {excludedNotProcessed} unprocessed batch{excludedNotProcessed === 1 ? "" : "es"} not listed
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-3 space-y-2">
                  {visible.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-10">No batches match your search.</p>
                  ) : (
                    visible.map((c) => {
                      const isOn = selected.has(c.batchId)
                      return (
                        <div
                          key={c.batchId}
                          className={cn(
                            "rounded-xl border p-3 transition-colors",
                            isOn
                              ? "border-rose-300 bg-rose-50/60 dark:border-rose-900 dark:bg-rose-950/20"
                              : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                          )}
                        >
                          <label className="flex items-start gap-3 cursor-pointer">
                            <Checkbox
                              checked={isOn}
                              onCheckedChange={(v) => toggle(c.batchId, v === true)}
                              className="mt-1"
                            />
                            <div className="flex-1 min-w-0 space-y-2">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-semibold text-slate-900 dark:text-slate-100">{c.batchNumber}</span>
                                  <Badge variant="outline" className="text-[10px] h-5">
                                    {c.status}
                                  </Badge>
                                  <span className="text-xs text-slate-500 dark:text-slate-400">
                                    {fmtDate(c.date)} · {c.ageDays} day{c.ageDays === 1 ? "" : "s"} old
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 text-xs">
                                  <span className="text-slate-500">Produced {c.producedLitres.toLocaleString()} L</span>
                                  <span className="font-semibold text-rose-700 dark:text-rose-300">
                                    Left: {fmtLitres(c.totalLossLitres)}
                                  </span>
                                  {c.hasStock && (
                                    <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-0 text-[10px]">
                                      {c.totalBottleCount.toLocaleString()} bottles in stock
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <LeftoverBreakdown summary={c} />
                            </div>
                          </label>
                        </div>
                      )
                    })
                  )}
                </div>

                <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    {selected.size === 0 ? (
                      "Tick the batches you want to clear."
                    ) : (
                      <>
                        <strong>{selected.size}</strong> selected · {fmtLitres(totals.litres)}
                        {totals.bottles > 0 ? ` incl. ${totals.bottles.toLocaleString()} bottles` : ""}
                      </>
                    )}
                  </p>
                  <Button
                    onClick={() => setStep("review")}
                    disabled={selected.size === 0}
                    className="bg-rose-600 hover:bg-rose-700 text-white"
                  >
                    Review &amp; continue
                  </Button>
                </div>
              </>
            ) : (
              /* ───────────── Review ───────────── */
              <>
                <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
                  <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20 p-3 text-sm text-amber-900 dark:text-amber-200">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <div className="space-y-1">
                      <p className="font-semibold">
                        You are about to write off {fmtLitres(totals.litres)}
                        {totals.bottles > 0 ? ` and ${totals.bottles.toLocaleString()} packaged bottles` : ""} as a loss.
                      </p>
                      <p>
                        Cleared batches show as <strong>CLEARED</strong>, can no longer be packaged or delivered from,
                        and stay in your records. Nothing already delivered changes. You can reopen a batch later.
                        Don&apos;t want one cleared yet? Choose <strong>Keep open</strong> for it below.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {selectedList.map((c) => (
                      <div
                        key={c.batchId}
                        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 space-y-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <PackageX className="h-4 w-4 text-rose-600" />
                            <span className="font-semibold text-slate-900 dark:text-slate-100">{c.batchNumber}</span>
                            <span className="text-xs text-slate-500">
                              {fmtDate(c.date)} · {c.ageDays} days old
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-rose-700 dark:text-rose-300">
                              Write off {fmtLitres(c.totalLossLitres)}
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => toggle(c.batchId, false)}
                            >
                              Keep open
                            </Button>
                          </div>
                        </div>
                        <LeftoverBreakdown summary={c} />
                      </div>
                    ))}
                    {selectedList.length === 0 && (
                      <p className="text-sm text-slate-500 text-center py-6">
                        No batches left to clear. Go back to pick some.
                      </p>
                    )}
                  </div>

                  {selectedList.length > 0 && (
                    <div className="space-y-3 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label>Reason</Label>
                          <Select value={reason} onValueChange={setReason}>
                            <SelectTrigger className="h-10">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {BATCH_CLEAR_REASONS.map((r) => (
                                <SelectItem key={r} value={r}>
                                  {r}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label>
                            Type <span className="font-mono font-bold">{CONFIRM_WORD}</span> to confirm
                          </Label>
                          <Input
                            value={confirmText}
                            onChange={(e) => setConfirmText(e.target.value)}
                            placeholder={CONFIRM_WORD}
                            autoComplete="off"
                            className="h-10"
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label>
                          Note {reasonNeedsNote ? <span className="text-red-600">*</span> : <span className="text-slate-400">(optional)</span>}
                        </Label>
                        <Textarea
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          maxLength={500}
                          placeholder="e.g. 0.3 L left in tank, never worth packaging"
                          className="min-h-[70px]"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                  <Button variant="outline" onClick={() => setStep("select")} disabled={submitting}>
                    <ArrowLeft className="h-4 w-4 mr-1.5" />
                    Back
                  </Button>
                  <Button
                    onClick={() => void submit()}
                    disabled={!canSubmit}
                    className="bg-rose-600 hover:bg-rose-700 text-white"
                  >
                    {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Eraser className="h-4 w-4 mr-2" />}
                    Clear {selectedList.length} batch{selectedList.length === 1 ? "" : "es"} as loss
                  </Button>
                </div>
              </>
            )}
          </TabsContent>

          {/* ───────────── Already cleared ───────────── */}
          <TabsContent value="cleared" className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-2">
            {clearedBatches.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-12">No batches have been cleared yet.</p>
            ) : (
              [...clearedBatches]
                .sort(
                  (a, b) =>
                    new Date(b.closure?.closedAt ?? 0).getTime() - new Date(a.closure?.closedAt ?? 0).getTime()
                )
                .map((b) => {
                  const cl = b.closure!
                  const confirming = reopenConfirmId === b._id
                  return (
                    <div
                      key={b._id}
                      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-slate-100">{b.batchNumber}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Cleared {fmtDate(cl.closedAt)}
                            {cl.closedByEmail ? ` by ${cl.closedByEmail}` : ""} · {cl.reason}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-rose-700 dark:text-rose-300">
                            Wrote off {fmtLitres(cl.totalLossLitres)}
                            {cl.totalBottleCount ? ` · ${cl.totalBottleCount.toLocaleString()} bottles` : ""}
                          </span>
                          {confirming ? (
                            <>
                              <Button
                                size="sm"
                                className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                                disabled={reopeningId === b._id}
                                onClick={() => void reopen(b._id)}
                              >
                                {reopeningId === b._id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                                Yes, reopen
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs"
                                onClick={() => setReopenConfirmId(null)}
                                disabled={reopeningId === b._id}
                              >
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => setReopenConfirmId(b._id)}
                            >
                              <RotateCcw className="h-3 w-3 mr-1" />
                              Reopen
                            </Button>
                          )}
                        </div>
                      </div>
                      {cl.note ? (
                        <p className="text-xs text-slate-600 dark:text-slate-300 italic">&ldquo;{cl.note}&rdquo;</p>
                      ) : null}
                      {cl.lines.length > 0 || cl.neutralLossLitres > 0 ? (
                        <div className="text-xs text-slate-600 dark:text-slate-300 space-y-0.5">
                          {cl.neutralLossLitres > 0 && <p>Unallocated: {fmtLitres(cl.neutralLossLitres)}</p>}
                          {cl.lines.map((l) => (
                            <p key={l.key}>
                              {l.label}
                              {l.unpackedLitres > 0 ? ` · ${fmtLitres(l.unpackedLitres)} unpacked` : ""}
                              {l.bottles.length > 0
                                ? ` · ${l.bottles.map((x) => `${x.quantity.toLocaleString()} × ${x.size}`).join(", ")} undelivered`
                                : ""}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )
                })
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
