"use client"

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react"
import debounce from "lodash.debounce"
import { useShopSession } from "@/components/providers/shop-session-provider"
import { useShopLoginModal } from "@/components/providers/shop-login-modal-provider"
import { toast } from "sonner"
import { getAnalyticsSessionId } from "@/lib/commerce-analytics-client"

const fetchOpts: RequestInit = { credentials: "include", cache: "no-store" }

export interface CartItem {
  id: string
  name: string
  price: number
  image: string
  quantity: number
  size?: string
}

interface CartContextValue {
  cart: CartItem[]
  loading: boolean
  removingLineIds: string[]
  addItem: (item: Omit<CartItem, "quantity"> & { quantity?: number }) => Promise<boolean>
  updateQuantity: (uniqueId: string, delta: number) => Promise<void>
  removeItem: (lineId: string) => Promise<void>
  setCart: (items: CartItem[]) => Promise<void>
  clearCart: () => Promise<void>
  refresh: () => Promise<void>
}

export const CartContext = createContext<CartContextValue | null>(null)

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { session, loading: sessionLoading, refreshSession } = useShopSession()
  const openLoginModal = useShopLoginModal()
  const [cart, setCart] = useState<CartItem[]>([])
  const [cartLoading, setCartLoading] = useState(true)
  const [removingLineIds, setRemovingLineIds] = useState<string[]>([])

  // Always-current session ref — prevents stale-closure issues in callbacks
  const sessionRef = useRef(session)
  useEffect(() => {
    sessionRef.current = session
  }, [session])

  const cartRef = useRef<CartItem[]>([])
  // Bumped around a confirmed server write so an older GET cannot paint the cart again.
  const cartVersionRef = useRef(0)
  const writeTailRef = useRef<Promise<void>>(Promise.resolve())
  const pendingRemovalsRef = useRef<Set<string>>(new Set())

  // Ignore fetch results if we saved recently — prevents home page refresh from overwriting a fresh add
  const lastSaveAtRef = useRef<number>(0)
  const SAVE_GRACE_MS = 2000

  const enqueueWrite = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const run = writeTailRef.current.then(task, task)
    writeTailRef.current = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }, [])

  const replaceCart = useCallback((items: CartItem[]) => {
    cartRef.current = items
    setCart(items)
  }, [])

  const fetchCart = useCallback(async () => {
    const version = cartVersionRef.current
    try {
      const res = await fetch("/api/ecommerce/cart", fetchOpts)
      if (version !== cartVersionRef.current) return
      if (res.status === 401) {
        replaceCart([])
        openLoginModal()
        return
      }
      const data = await res.json()
      if (version !== cartVersionRef.current) return
      // Don't overwrite if we just saved (prevents race with home page refresh)
      if (Date.now() - lastSaveAtRef.current < SAVE_GRACE_MS) return
      if (data.success && Array.isArray(data.items)) {
        replaceCart(data.items)
      } else {
        replaceCart([])
      }
    } catch {
      if (version === cartVersionRef.current) replaceCart([])
    }
  }, [openLoginModal, replaceCart])

  const postCart = useCallback(async (items: CartItem[], overwriteFromResponse = true): Promise<boolean> => {
    const version = cartVersionRef.current
    try {
      const res = await fetch("/api/ecommerce/cart", {
        ...fetchOpts,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      })
      if (cartVersionRef.current !== version) return true
      if (res.status === 401) {
        openLoginModal()
        return false
      }
      if (res.ok) {
        lastSaveAtRef.current = Date.now()
        if (overwriteFromResponse) {
          const data = await res.json()
          if (cartVersionRef.current !== version) return true
          if (data.success && Array.isArray(data.items)) {
            replaceCart(data.items)
          }
        }
        return true
      }
      return false
    } catch (err) {
      console.error("Failed to save cart:", err)
      return false
    }
  }, [openLoginModal, replaceCart])

  const saveCart = useCallback(
    (items: CartItem[], overwriteFromResponse = true) =>
      enqueueWrite(() => postCart(items, overwriteFromResponse)),
    [enqueueWrite, postCart]
  )

  useEffect(() => {
    let cancelled = false
    const init = async () => {
      setCartLoading(true)
      if (session.signedIn) {
        await fetchCart()
      } else {
        setCart([])
      }
      if (!cancelled) setCartLoading(false)
    }
    init()
    return () => { cancelled = true }
  }, [session.signedIn, fetchCart])

  useEffect(() => {
    if (!session.signedIn) return
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchCart()
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => document.removeEventListener("visibilitychange", onVisibilityChange)
  }, [session.signedIn, fetchCart])

  const debouncedFetchCart = useMemo(
    () => debounce(() => fetchCart(), 300),
    [fetchCart]
  )

  useEffect(() => {
    return () => debouncedFetchCart.cancel()
  }, [debouncedFetchCart])

  const addItem = useCallback(
    async (item: Omit<CartItem, "quantity"> & { quantity?: number }): Promise<boolean> => {
      const qty = item.quantity ?? 1
      const toAdd: CartItem = { ...item, quantity: qty }

      // Show the new line immediately, then confirm with the server.
      const uniqueId = item.size ? `${item.id}-${item.size}` : item.id
      setCart((prev) => {
        const idx = prev.findIndex((i) => (i.size ? `${i.id}-${i.size}` : i.id) === uniqueId)
        const next = (() => {
          if (idx >= 0) {
            const copy = [...prev]
            copy[idx] = { ...copy[idx], quantity: copy[idx].quantity + qty }
            return copy
          }
          return [...prev, toAdd]
        })()
        cartRef.current = next
        return next
      })

      try {
        return await enqueueWrite(async () => {
          const version = cartVersionRef.current
          const res = await fetch("/api/ecommerce/cart/items", {
            ...fetchOpts,
            method: "POST",
            headers: { "Content-Type": "application/json", "x-analytics-session": getAnalyticsSessionId() },
            body: JSON.stringify({ item: toAdd }),
          })
          if (cartVersionRef.current !== version) return false
          if (res.status === 401) {
            openLoginModal()
            return false
          }
          if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            toast.error(err?.error || "Could not add to cart")
            await fetchCart()
            return false
          }
          const data = await res.json()
          if (cartVersionRef.current !== version) return true
          lastSaveAtRef.current = Date.now()
          if (data.success && Array.isArray(data.items)) {
            replaceCart(data.items)
          }
          return true
        })
      } catch (err) {
        console.error("Add to cart failed:", err)
        toast.error("Could not add to cart")
        await fetchCart()
        return false
      }
    },
    [openLoginModal, fetchCart, enqueueWrite, replaceCart]
  )

  const updateQuantity = useCallback(
    async (uniqueId: string, delta: number) => {
      setCart((prevCart) => {
        const next = prevCart
          .map((i) => {
            const id = i.size ? `${i.id}-${i.size}` : i.id
            if (id !== uniqueId) return i
            const qty = Math.max(1, i.quantity + delta)
            return { ...i, quantity: qty }
          })
          .filter((i) => i.quantity >= 1)
        cartRef.current = next
        return next
      })

      if (sessionRef.current.signedIn) {
        const persistCurrent = () => enqueueWrite(() => postCart(cartRef.current, false))
        let ok = await persistCurrent()
        if (!ok) {
          toast.error("Could not sync cart. Retrying…")
          await new Promise((r) => setTimeout(r, 1500))
          ok = await persistCurrent()
          if (!ok) {
            toast.error("Cart could not sync. Changes will save when you refresh or return to this tab.")
          }
        }
      }
    },
    [enqueueWrite, postCart]
  )

  const getLineId = useCallback((item: CartItem) => (item.size ? `${item.id}-${item.size}` : item.id), [])

  const syncRemoving = useCallback(() => {
    setRemovingLineIds(Array.from(pendingRemovalsRef.current))
  }, [])

  const removeItem = useCallback(
    async (lineId: string) => {
      if (pendingRemovalsRef.current.has(lineId)) return
      pendingRemovalsRef.current.add(lineId)
      syncRemoving()

      try {
        if (!sessionRef.current.signedIn) {
          const next = cartRef.current.filter((i) => getLineId(i) !== lineId)
          replaceCart(next)
          return
        }

        // Keep the line on screen until the server has removed it. A local
        // removal gets overwritten by an in-flight cart load, then removed again.
        await enqueueWrite(async () => {
          cartVersionRef.current += 1
          const res = await fetch(`/api/ecommerce/cart/items?uniqueId=${encodeURIComponent(lineId)}`, {
            ...fetchOpts,
            method: "DELETE",
            headers: { "x-analytics-session": getAnalyticsSessionId() },
          })
          if (res.status === 401) {
            openLoginModal()
            return
          }
          const data = await res.json().catch(() => null)
          if (!res.ok || !data?.success || !Array.isArray(data.items)) {
            toast.error("Could not remove item")
            await fetchCart()
            return
          }
          cartVersionRef.current += 1
          lastSaveAtRef.current = Date.now()
          replaceCart(data.items)
        })
      } catch (err) {
        console.error("Failed to remove item:", err)
        toast.error("Could not remove item")
      } finally {
        pendingRemovalsRef.current.delete(lineId)
        syncRemoving()
      }
    },
    [getLineId, enqueueWrite, replaceCart, fetchCart, openLoginModal, syncRemoving]
  )

  const setCartAndSave = useCallback(
    async (items: CartItem[]) => {
      replaceCart(items)
      if (sessionRef.current.signedIn && items.length > 0) await saveCart(items)
    },
    [replaceCart, saveCart]
  )

  const clearCartAndSave = useCallback(async () => {
    replaceCart([])
    if (!sessionRef.current.signedIn) return
    await enqueueWrite(async () => {
      cartVersionRef.current += 1
      try {
        await fetch("/api/ecommerce/cart", { ...fetchOpts, method: "DELETE" })
      } catch {
        // ignore
      }
      cartVersionRef.current += 1
      lastSaveAtRef.current = Date.now()
    })
  }, [replaceCart, enqueueWrite])

  const refresh = useCallback(async () => {
    const signedIn = await refreshSession()
    if (signedIn) await fetchCart()
  }, [refreshSession, fetchCart])

  const loading = sessionLoading || cartLoading

  const value: CartContextValue = {
    cart,
    loading,
    removingLineIds,
    addItem,
    updateQuantity,
    removeItem,
    setCart: setCartAndSave,
    clearCart: clearCartAndSave,
    refresh,
  }

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  return ctx
}

