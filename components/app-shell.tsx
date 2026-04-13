import { Zap } from "lucide-react"

import { LogoutButton } from "@/components/logout-button"
import { AppNav } from "@/components/app-nav"
import type { SessionPayload } from "@/lib/types"

export function AppShell({ session, children }: { session: SessionPayload; children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0c0c10] text-white">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-white/[0.06] bg-[#101014] px-5">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md border border-[#c9a96e]/20 bg-[#c9a96e]/10">
              <Zap className="h-3 w-3 text-[#c9a96e]" strokeWidth={2.5} fill="currentColor" />
            </div>
            <span className="text-[14px] font-semibold tracking-tight text-white/85">Finder Review</span>
          </div>
          <span className="h-4 w-px bg-white/[0.08]" />
          <span className="text-[11px] font-medium text-white/30">Approval Desk</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-[11px] text-white/25">{session.role}</p>
            <p className="text-[12px] text-white/60">{session.email}</p>
          </div>
          <LogoutButton />
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <aside className="flex h-full w-64 shrink-0 flex-col border-r border-white/[0.06] bg-[#101014]">
          <div className="flex-1 px-3 py-6">
            <AppNav role={session.role} />
          </div>
          <div className="border-t border-white/[0.05] px-4 py-3">
            <p className="text-center font-mono text-[10px] text-white/15">Finder Review v1</p>
          </div>
        </aside>
        <main className="flex-1 overflow-y-auto bg-[#0c0c10]">
          <div className="mx-auto max-w-[1440px] px-8 py-7">{children}</div>
        </main>
      </div>
    </div>
  )
}
