"use client"

import { useEffect } from "react"
import { useParams, useRouter } from "next/navigation"

/** Older SMS links land here. Confirmation now requires an admin session under /catha. */
export default function LegacyApproveMpesaRedirect() {
  const params = useParams()
  const router = useRouter()
  const token = String(params?.token || "")

  useEffect(() => {
    if (!token) return
    router.replace(`/catha/approve-mpesa/${encodeURIComponent(token)}`)
  }, [router, token])

  return null
}
