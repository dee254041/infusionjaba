"use client"

import { Sidebar } from "@/components/layout/sidebar"
import { useEffect } from "react"
import { usePathname } from "next/navigation"

export default function CathaLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname() || ""
  useEffect(() => {
    document.title = "Catha Lounge | Restaurant & Bar"
  }, [])

  if (pathname === "/catha/menu" || pathname.startsWith("/catha/menu/")) {
    return <div className="min-h-screen bg-[#f6f3ee]">{children}</div>
  }

  return (
    <div className="flex h-screen min-h-0 bg-background overflow-x-hidden">
      <Sidebar />
      <main className="flex-1 min-w-0 min-h-0 flex flex-col overflow-y-auto overflow-x-hidden pos-scroll xl:pl-64">
        {children}
      </main>
    </div>
  )
}
