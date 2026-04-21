"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { CheckSquare2, FolderOpen, LayoutDashboard, Send, Settings, ShieldAlert } from "lucide-react"

import type { LucideIcon } from "lucide-react"

const MAIN_ITEMS: Array<{ href: string; label: string; icon: LucideIcon; roles?: Array<"owner" | "reviewer"> }> = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/review", label: "Review Queue", icon: CheckSquare2 },
  { href: "/owner", label: "Owner Queue", icon: ShieldAlert, roles: ["owner"] },
  { href: "/ready", label: "Ready for Smartlead", icon: Send, roles: ["owner"] },
]

const OPS_ITEMS: Array<{ href: string; label: string; icon: LucideIcon; roles?: Array<"owner" | "reviewer"> }> = [
  { href: "/exports", label: "Exports", icon: FolderOpen, roles: ["owner"] },
  { href: "/files", label: "Files & Status", icon: FolderOpen, roles: ["owner"] },
  { href: "/settings", label: "Settings", icon: Settings, roles: ["owner"] },
]

function NavSection({
  title,
  items,
  pathname,
}: {
  title: string
  items: Array<{ href: string; label: string; icon: LucideIcon }>
  pathname: string
}) {
  return (
    <div className="space-y-2">
      <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/20">{title}</p>
      <div className="space-y-1">
        {items.map((item) => {
          const active = pathname === item.href
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all duration-150",
                active ? "bg-[#c9a96e]/[0.08] text-[#d4b87d]" : "text-white/40 hover:bg-white/[0.03] hover:text-white/65",
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
      </div>
    </div>
  )
}

export function AppNav({ role }: { role: "owner" | "reviewer" }) {
  const pathname = usePathname()
  const mainItems = MAIN_ITEMS.filter((item) => !item.roles || item.roles.includes(role))
  const opsItems = OPS_ITEMS.filter((item) => !item.roles || item.roles.includes(role))

  return (
    <nav className="space-y-6">
      <NavSection title="Main" items={mainItems} pathname={pathname} />
      {opsItems.length ? <NavSection title="Ops" items={opsItems} pathname={pathname} /> : null}
    </nav>
  )
}
