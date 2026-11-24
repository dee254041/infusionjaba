"use client"

import { useState } from "react"
import { CheckCircle2, Download, Loader2, Printer, ShieldCheck, Wine } from "lucide-react"
import { renderReceiptPng } from "./receipt-png"

export type PublicReceiptView = {
  businessName: string
  orderId: string
  paidAt: string
  paymentText: string
  receiptNumber: string | null
  totalLabel: string
  items: Array<{ name: string; quantity: number; lineTotal: string }>
}

export function ReceiptScreen({ receipt }: { receipt: PublicReceiptView }) {
  const [downloading, setDownloading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")

  async function download() {
    if (downloading) return
    setDownloading(true)
    setError("")
    setSaved(false)
    try {
      const blob = await renderReceiptPng(receipt)
      const filename = `${receipt.businessName.replace(/\s+/g, "-")}-${receipt.orderId}.png`
      const file = new File([blob], filename, { type: "image/png" })
      const canShare =
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] }) &&
        window.matchMedia("(pointer: coarse)").matches
      if (canShare) {
        await navigator.share({ files: [file], title: `${receipt.businessName} receipt` })
      } else {
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = url
        link.download = filename
        link.click()
        URL.revokeObjectURL(url)
      }
      setSaved(true)
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return
      setError("Could not save the receipt. Try again.")
    } finally {
      setDownloading(false)
    }
  }

  return (
    <main className="relative min-h-dvh overflow-x-hidden bg-[#0c0a09] text-stone-100 print:min-h-0 print:bg-white print:text-black">
      <div className="pointer-events-none absolute -top-32 left-1/2 h-[28rem] w-[36rem] -translate-x-1/2 rounded-full bg-amber-500/15 blur-[110px] print:hidden" />

      <div className="relative mx-auto flex min-h-dvh w-full max-w-3xl flex-col justify-center px-4 pb-32 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6 sm:py-10 sm:pb-10 print:block print:max-w-none print:p-0">
        <header className="mb-4 text-center sm:mb-7 print:hidden">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full border border-amber-400/40 bg-amber-400/10 sm:mb-2.5 sm:h-12 sm:w-12">
            <Wine className="h-5 w-5 text-amber-300" />
          </div>
          <p className="font-serif text-lg uppercase tracking-[0.18em] text-amber-100 sm:text-2xl sm:tracking-[0.28em]">{receipt.businessName}</p>
          <p className="mt-1.5 text-[10px] uppercase tracking-[0.32em] text-stone-400 sm:text-[11px]">Infusion Jaba</p>
        </header>

        <article className="mx-auto w-full max-w-[440px] overflow-hidden rounded-3xl shadow-[0_24px_70px_-20px_rgba(0,0,0,0.85)] sm:max-w-[480px] print:max-w-none print:rounded-none print:shadow-none">
          <div className="bg-gradient-to-b from-stone-900 to-black px-5 pb-6 pt-6 text-center sm:px-8 sm:pb-8 sm:pt-9 print:bg-white print:px-0 print:pb-4 print:pt-0 print:text-black">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full border-2 border-amber-300 bg-amber-400/10 sm:mb-5 sm:h-20 sm:w-20 print:hidden">
              <CheckCircle2 className="h-7 w-7 text-amber-200 sm:h-10 sm:w-10" />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-amber-300 print:text-black">Official receipt</p>
            <h1 className="mt-1 font-serif text-3xl text-amber-50 sm:text-4xl print:text-black">Payment received</h1>
            <p className="mt-2 font-serif text-3xl tabular-nums leading-none text-amber-100 min-[380px]:text-4xl sm:text-5xl print:text-black">{receipt.totalLabel}</p>
          </div>

          <div className="bg-[#faf7f0] px-4 py-5 text-stone-900 sm:px-6 sm:py-6 print:bg-white print:px-0">
            <dl className="space-y-3 text-sm sm:text-[15px]">
              <Row label="Order" value={`#${receipt.orderId}`} mono />
              {receipt.receiptNumber ? <Row label="M-Pesa receipt" value={receipt.receiptNumber} mono /> : null}
              <Row label="Date" value={receipt.paidAt} />
              <Row label="Payment" value={receipt.paymentText} />
              <div className="flex items-center justify-between gap-3">
                <dt className="text-stone-500">Status</dt>
                <dd className="inline-flex items-center gap-1.5 rounded-full bg-stone-900 px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest text-amber-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  Paid
                </dd>
              </div>
            </dl>

            {receipt.items.length > 0 ? (
              <div className="mt-5 border-t border-dashed border-stone-300 pt-4">
                <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.22em] text-stone-500">Order items</p>
                <ul className="space-y-3">
                  {receipt.items.map((item, index) => (
                    <li key={`${item.name}-${index}`} className="flex items-start justify-between gap-3 text-sm">
                      <span className="min-w-0 text-stone-800">
                        <span className="font-semibold tabular-nums">{item.quantity}×</span> {item.name}
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums">{item.lineTotal}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="mt-5 flex items-end justify-between gap-3 border-t-2 border-stone-900 pt-4">
              <span className="text-sm font-black uppercase tracking-wide sm:text-base">Total paid</span>
              <span className="font-serif text-2xl tabular-nums sm:text-3xl">{receipt.totalLabel}</span>
            </div>

            <p className="mt-5 text-center text-sm leading-relaxed text-stone-600">
              Thank you for choosing <span className="font-serif font-semibold">{receipt.businessName}</span>. We look forward to serving you again.
            </p>

            <div className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-[#faf7f0] px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-12px_40px_rgba(0,0,0,0.28)] print:hidden sm:static sm:mt-5 sm:border-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-0 sm:shadow-none">
              {error ? <p className="mx-auto mb-2 max-w-[440px] text-center text-xs text-red-700 sm:max-w-none">{error}</p> : null}
              <div className="mx-auto grid w-full max-w-[440px] grid-cols-1 gap-2 sm:max-w-none sm:grid-cols-2">
                <button
                  type="button"
                  onClick={download}
                  disabled={downloading}
                  className="flex h-12 items-center justify-center gap-2 rounded-xl bg-amber-300 text-sm font-bold text-stone-950 transition hover:bg-amber-200 active:scale-[0.99] disabled:opacity-70"
                >
                  {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  {saved ? "Saved" : "Download receipt"}
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex h-11 items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white text-sm font-bold text-stone-900 transition hover:bg-stone-50 active:scale-[0.99] sm:h-12"
                >
                  <Printer className="h-4 w-4" />
                  Print
                </button>
              </div>
              <p className="mt-2 flex items-center justify-center gap-1 text-[11px] text-stone-500 sm:hidden">
                <ShieldCheck className="h-3.5 w-3.5 text-amber-600" />
                Secured by M-Pesa
              </p>
            </div>
          </div>
        </article>

        <footer className="mt-6 hidden items-center justify-center gap-1.5 text-[11px] text-stone-500 sm:flex print:hidden">
          <ShieldCheck className="h-3.5 w-3.5 text-amber-500/80" />
          Secured by M-Pesa · infusionjaba.co.ke
        </footer>
      </div>
    </main>
  )
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-stone-500">{label}</dt>
      <dd className={`min-w-0 break-all text-right font-semibold ${mono ? "font-mono text-[13px] sm:text-sm" : ""}`}>{value}</dd>
    </div>
  )
}
