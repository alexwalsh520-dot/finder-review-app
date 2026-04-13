"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { CheckSquare2, Database, LayoutDashboard, Send, Settings, FolderOpen } from "lucide-react"

import type { LucideIcon } from "lucide-react"

const ITEMS: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/review", label: "Review Queue", icon: Database },
  { href: "/owner", label: "Owner Queue", icon: CheckSquare2 },
  { href: "/ready", label: "Ready for Smartlead", icon: Send },
  { href: "/exports", label: "Exports", icon: FolderOpen },
  { href: "/files", label: "Files & Status", icon: FolderOpen },
  { href: "/settings", label: "Settings", icon: Settings },
]

export function AppNav({ role }: { role: "owner" | "reviewer" }) {
  const pathname = usePathname()

  return (
    <nav className="space-y-1">
      {ITEMS.filter((item) => role === "owner" || item.href !== "/settings").map((item) => {
        const active = pathname === item.href
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            className={[
              "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all duration-150",
              active
                ? "bg-[#c9a96e]/[0.08] text-[#d4b87d]"
                : "text-white/40 hover:bg-white/[0.03] hover:text-white/65",
            ].join(" ")}
          >
            <Icon
              className={[
                "h-4 w-4 shrink-0 transition-colors",
                active ? "text-[#c9a96e]" : "text-white/20 group-hover:text-white/35",
              ].join(" ")}
              strokeWidth={1.7}
            />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
