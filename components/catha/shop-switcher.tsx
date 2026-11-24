"use client"

import { useCallback, useEffect, useState } from "react"
import { Check, ChevronDown, Plus, Store } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

type ShopOption = {
  shopId: string
  name: string
  slug: string
  location?: string
  status?: string
}

type ShopState = {
  canCreate: boolean
  showSwitcher: boolean
  active: ShopOption
  shops: ShopOption[]
}

function suggestCode(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
}

export function ShopSwitcher({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<ShopState | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [slugTouched, setSlugTouched] = useState(false)
  const [location, setLocation] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [logoUrl, setLogoUrl] = useState("")
  const [adminEmail, setAdminEmail] = useState("")
  const [active, setActive] = useState(true)

  const load = useCallback(() => {
    fetch("/api/catha/shops", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.ok && data.active) setState(data)
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function switchShop(shopId: string) {
    if (!state || shopId === state.active.shopId || busy) return
    setBusy(true)
    try {
      const res = await fetch("/api/catha/shops/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        toast.error(data?.error || "Could not switch shop")
        setBusy(false)
        return
      }
      window.location.reload()
    } catch {
      toast.error("Could not switch shop")
      setBusy(false)
    }
  }

  async function submitShop() {
    setBusy(true)
    try {
      const res = await fetch("/api/catha/shops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          slug,
          location,
          phone,
          email,
          logoUrl,
          adminEmail,
          status: active ? "active" : "inactive",
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        toast.error(data?.error || "Could not create shop")
        setBusy(false)
        return
      }
      toast.success(`${data.shop?.name || "Shop"} is ready`)
      setOpen(false)
      setName("")
      setSlug("")
      setSlugTouched(false)
      setLocation("")
      setPhone("")
      setEmail("")
      setLogoUrl("")
      setAdminEmail("")
      setActive(true)
      load()
    } catch {
      toast.error("Could not create shop")
    } finally {
      setBusy(false)
    }
  }

  if (!state) return null

  return (
    <div className={cn(compact ? "py-2 pl-16 pr-3" : "px-3 pb-3")}>
      <div className="rounded-xl border border-emerald-200 bg-white p-2.5 shadow-sm">
        <div className="flex items-center gap-2 px-1">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-white">
            <Store className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Active shop</p>
            {state.showSwitcher ? (
              <label className="relative block">
                <select
                  aria-label="Switch shop"
                  disabled={busy}
                  value={state.active.shopId}
                  onChange={(event) => switchShop(event.target.value)}
                  className="w-full appearance-none bg-transparent pr-6 text-sm font-semibold text-emerald-950 outline-none disabled:opacity-60"
                >
                  {state.shops.map((shop) => (
                    <option key={shop.shopId} value={shop.shopId}>
                      {shop.name}
                      {shop.status === "inactive" ? " (inactive)" : ""}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-0 top-1 h-3.5 w-3.5 text-emerald-700" />
              </label>
            ) : (
              <p className="truncate text-sm font-semibold text-emerald-950">{state.active.name}</p>
            )}
          </div>
        </div>
        {state.canCreate ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2 h-8 w-full border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
            onClick={() => setOpen(true)}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Create shop
          </Button>
        ) : null}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create shop</DialogTitle>
            <DialogDescription>
              The new shop gets the same modules as Catha Lounge, with its own products, orders, staff, and menu.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="shop-name">Shop name</Label>
              <Input
                id="shop-name"
                value={name}
                onChange={(event) => {
                  const next = event.target.value
                  setName(next)
                  if (!slugTouched) setSlug(suggestCode(next))
                }}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="shop-code">Shop code</Label>
              <Input
                id="shop-code"
                value={slug}
                onChange={(event) => {
                  setSlugTouched(true)
                  setSlug(suggestCode(event.target.value))
                }}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="shop-location">Location</Label>
              <Input id="shop-location" value={location} onChange={(event) => setLocation(event.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="shop-phone">Phone</Label>
              <Input id="shop-phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="shop-email">Contact email</Label>
              <Input id="shop-email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="shop-logo">Logo URL</Label>
              <Input id="shop-logo" value={logoUrl} onChange={(event) => setLogoUrl(event.target.value)} placeholder="https://" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="shop-admin">Initial administrator email</Label>
              <Input
                id="shop-admin"
                value={adminEmail}
                onChange={(event) => setAdminEmail(event.target.value)}
                placeholder="Existing staff email"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <Label htmlFor="shop-active">Active</Label>
              <Switch id="shop-active" checked={active} onCheckedChange={setActive} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" disabled={busy || name.trim().length < 2 || slug.trim().length < 2} onClick={submitShop}>
              <Check className="mr-1 h-4 w-4" />
              {busy ? "Creating..." : "Create shop"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function ShopAssignmentCard() {
  const [canCreate, setCanCreate] = useState(false)
  const [email, setEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const [shopName, setShopName] = useState("")

  useEffect(() => {
    fetch("/api/catha/shops", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.ok) {
          setCanCreate(Boolean(data.canCreate))
          setShopName(data.active?.name || "")
        }
      })
      .catch(() => undefined)
  }, [])

  if (!canCreate) return null

  return (
    <div className="mb-4 rounded-xl border border-emerald-200 bg-white p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-emerald-950">Assign staff to {shopName || "this shop"}</h2>
        <p className="text-xs text-muted-foreground">
          Adds this shop to an existing account. Their role stays the same, and they do not become a super admin.
        </p>
      </div>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={async (event) => {
          event.preventDefault()
          setBusy(true)
          try {
            const res = await fetch("/api/catha/shops/members", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email }),
            })
            const data = await res.json().catch(() => null)
            if (!res.ok) {
              toast.error(data?.error || "Could not assign staff")
              return
            }
            toast.success(`${email} can now open ${shopName || "this shop"}`)
            setEmail("")
          } finally {
            setBusy(false)
          }
        }}
      >
        <Input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="staff@example.com"
        />
        <Button type="submit" disabled={busy} className="bg-emerald-600 hover:bg-emerald-700">
          {busy ? "Assigning..." : "Assign"}
        </Button>
      </form>
    </div>
  )
}
