"use client"

import { useState } from "react"

export function LogoutButton() {
  const [pending, setPending] = useState(false)

  async function handleLogout() {
    setPending(true)
    try {
      await fetch("/api/session/logout", { method: "POST" })
      window.location.assign("/login")
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={pending}
      className="rounded-lg border border-white/[0.08] px-3 py-2 text-[12px] font-medium text-white/45 hover:border-[#c9a96e]/20 hover:text-[#d4b87d]"
    >
      {pending ? "Signing out..." : "Sign out"}
    </button>
  )
}
