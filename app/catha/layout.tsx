"use client"

import { Sidebar } from "@/components/layout/sidebar"
import { ShopSwitcher } from "@/components/catha/shop-switcher"
import { useEffect } from "react"

export default function CathaLayout({
  children,
}: {
  children: React.ReactNode
}) {
  useEffect(() => {
    document.title = "Catha Lounge | Restaurant & Bar"
  }, [])

  return (
    <div className="flex h-screen min-h-0 bg-background overflow-x-hidden">
      <Sidebar />
      <main className="flex-1 min-w-0 min-h-0 flex flex-col overflow-y-auto overflow-x-hidden pos-scroll xl:pl-64">
        <div className="sticky top-0 z-30 bg-white/95 backdrop-blur xl:hidden">
          <ShopSwitcher compact />
        </div>
        {children}
      </main>
    </div>
  )
}
