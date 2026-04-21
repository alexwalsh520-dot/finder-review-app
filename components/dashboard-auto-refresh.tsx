"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

type Props = {
  enabled: boolean
  intervalMs?: number
}

export function DashboardAutoRefresh({ enabled, intervalMs = 15000 }: Props) {
  const router = useRouter()

  useEffect(() => {
    if (!enabled) {
      return
    }
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        router.refresh()
      }
    }, intervalMs)
    return () => window.clearInterval(interval)
  }, [enabled, intervalMs, router])

  return null
}
