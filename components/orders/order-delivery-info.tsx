"use client"

import { MapPin, Phone, Navigation } from "lucide-react"
import { getOrderDeliveryInfo, toTelHref } from "@/lib/order-delivery-location"
import { dialableKenyaPhone } from "@/lib/phone-utils"

type Props = {
  order: unknown
  /** compact = single-line chips for cards/rows; full = detailed block for dialogs */
  variant?: "compact" | "full"
  className?: string
}

/**
 * Online-order contact + location. Shows client phone (tap to call) and a precise
 * map pin link so staff never need to phone the client for directions.
 */
export function OrderDeliveryInfo({ order, variant = "compact", className = "" }: Props) {
  const info = getOrderDeliveryInfo(order)
  const phone = dialableKenyaPhone((order as any)?.customerPhone)
  const telHref = toTelHref(phone)
  const isOnline =
    String((order as any)?.orderSource || "").toLowerCase() === "online" ||
    String((order as any)?.type || "").toLowerCase() === "ecommerce"

  if (!isOnline && !info) return null
  if (!phone && !info) return null

  if (variant === "full") {
    return (
      <div className={`rounded-lg border border-blue-200 bg-blue-50/60 p-3 space-y-2 ${className}`}>
        <p className="text-[10px] font-bold uppercase tracking-wide text-blue-800">Client &amp; delivery</p>
        {phone && (
          <a
            href={telHref || undefined}
            className="flex items-center gap-2 text-sm font-semibold text-blue-900 hover:underline"
          >
            <Phone className="h-4 w-4 shrink-0" />
            <span className="font-mono">{phone}</span>
            <span className="text-[10px] font-medium text-blue-700">(tap to call)</span>
          </a>
        )}
        {info?.address && (
          <p className="flex items-start gap-2 text-sm text-slate-800">
            <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-blue-700" />
            <span>{info.address}</span>
          </p>
        )}
        {info?.notes && <p className="text-xs text-slate-600 pl-6">Note: {info.notes}</p>}
        {info?.location && (
          <p className="text-[11px] text-slate-600 pl-6 font-mono">
            {info.location.lat.toFixed(6)}, {info.location.lng.toFixed(6)}
            {info.location.accuracy != null ? ` · ±${info.location.accuracy}m` : ""}
          </p>
        )}
        {info?.mapsUrl && (
          <a
            href={info.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
          >
            <Navigation className="h-3.5 w-3.5" />
            Open exact location in Maps
          </a>
        )}
        {!info?.mapsUrl && info?.address && (
          <p className="text-[11px] text-amber-700 pl-6">No GPS pin on this order (area text only).</p>
        )}
      </div>
    )
  }

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {phone && (
        <a
          href={telHref || undefined}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] sm:text-[11px] font-mono font-semibold text-blue-800 hover:bg-blue-100"
        >
          <Phone className="h-3 w-3" />
          {phone}
        </a>
      )}
      {info?.mapsUrl ? (
        <a
          href={info.mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] sm:text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100"
        >
          <MapPin className="h-3 w-3" />
          Exact location
        </a>
      ) : info?.address ? (
        <span
          className="inline-flex max-w-[200px] items-center gap-1 truncate rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] sm:text-[11px] text-slate-700"
          title={info.address}
        >
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">{info.address.replace(/^Deliver to:\s*/i, "")}</span>
        </span>
      ) : null}
    </div>
  )
}
