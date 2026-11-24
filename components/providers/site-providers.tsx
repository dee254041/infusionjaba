"use client"

import { Suspense } from "react"
import { usePathname } from "next/navigation"
import SessionProvider from "@/components/providers/session-provider"
import { ShopSessionProvider } from "@/components/providers/shop-session-provider"
import { CartProvider } from "@/components/providers/cart-provider"
import { ShopLoginModalProvider } from "@/components/providers/shop-login-modal-provider"
import { OrderNotificationsProvider } from "@/components/providers/order-notifications-provider"
import { CommercePageTracker } from "@/components/analytics/commerce-page-tracker"

function isReceiptPath(pathname: string | null): boolean {
  return pathname === "/r" || !!pathname?.startsWith("/r/")
}

/**
 * A receipt link should render the receipt and stop.
 * The shop session, staff session, and page tracker each write or read the database.
 */
export function SiteProviders({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  if (isReceiptPath(pathname)) return <>{children}</>

  return (
    <SessionProvider>
      <ShopSessionProvider>
        <Suspense fallback={<>{children}</>}>
          <ShopLoginModalProvider>
            <CartProvider>
              <OrderNotificationsProvider>
                <CommercePageTracker />
                {children}
              </OrderNotificationsProvider>
            </CartProvider>
          </ShopLoginModalProvider>
        </Suspense>
      </ShopSessionProvider>
    </SessionProvider>
  )
}
