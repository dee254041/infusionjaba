import { notFound } from "next/navigation"
import { loadPublicReceipt, type PublicReceiptPayload } from "@/lib/public-receipt"
import { ReceiptScreen } from "./receipt-screen"

function formatMoney(value: number): string {
  return `KSh ${Number(value || 0).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDateTime(value: string | Date): string {
  return new Date(value).toLocaleString("en-KE", {
    timeZone: "Africa/Nairobi",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function titleCase(value: string): string {
  const text = value.trim()
  if (!text) return "Catha Lounge"
  return text.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
}

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Receipt | Catha Lounge",
  robots: { index: false, follow: false },
}

export default async function PublicReceiptPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params
  const result = await loadPublicReceipt(orderId)
  if (result.status === "expired") return <ExpiredReceipt />
  if (result.status !== "ok") notFound()
  const receipt: PublicReceiptPayload = result.receipt

  return (
    <ReceiptScreen
      receipt={{
        businessName: titleCase(receipt.businessName),
        orderId: receipt.orderId,
        paidAt: formatDateTime(receipt.timestamp),
        paymentText: receipt.paymentMethod ? String(receipt.paymentMethod).toUpperCase() : "—",
        receiptNumber: receipt.receiptNumber,
        totalLabel: formatMoney(receipt.total),
        items: receipt.items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          lineTotal: formatMoney(item.price * item.quantity),
        })),
      }}
    />
  )
}

function ExpiredReceipt() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#0c0a09] px-6 text-center text-stone-100">
      <div className="max-w-sm">
        <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-amber-300">Catha Lounge</p>
        <h1 className="mt-3 font-serif text-3xl text-amber-50">This receipt link has expired</h1>
        <p className="mt-3 text-sm leading-relaxed text-stone-400">
          Receipt links stay available for 14 days after payment. Ask the lounge if you still need a copy.
        </p>
      </div>
    </main>
  )
}
