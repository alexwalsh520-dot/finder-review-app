import Link from "next/link"

import { requireSession } from "@/lib/auth"
import { getDashboardData } from "@/lib/data"
import { formatDateTime } from "@/lib/format"

const cards = [
  { key: "unreviewed", label: "Unreviewed" },
  { key: "waitingOwner", label: "Waiting for owner" },
  { key: "flagged", label: "Flagged" },
  { key: "ready", label: "Ready for export" },
  { key: "pendingExport", label: "Pending Smartlead" },
  { key: "sent", label: "Sent" },
] as const

export default async function DashboardPage() {
  await requireSession()
  const data = await getDashboardData()

  return (
    <div className="space-y-6 p-2 md:p-4">
      <div className="panel overflow-hidden px-6 py-6 text-white">
        <p className="section-label text-emberSoft">Overview</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-semibold">Review pipeline at a glance</h2>
            <p className="mt-2 text-sm text-white/55">
              Today the worker reports {data.counts.todayEmailCount} emails and {data.counts.pendingDocCount} pending DOC jobs.
            </p>
          </div>
          <Link href="/ready" className="gold-button px-4 py-3 text-sm">
            Open Ready for Smartlead
          </Link>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <article key={card.key} className="panel p-5">
            <p className="section-label">{card.label}</p>
            <p className="mt-4 text-4xl font-semibold text-ink">{data.counts[card.key]}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="panel p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="section-label">Worker health</p>
              <h3 className="mt-2 text-2xl font-semibold text-ink">Cloud jobs</h3>
            </div>
            <p className="text-sm text-slateWarm">
              Owner approval is <span className="font-semibold text-ink">{data.requireOwnerApproval ? "on" : "off"}</span>
            </p>
          </div>
          <div className="table-shell mt-5">
            <table className="text-sm">
              <thead className="table-head text-left">
                <tr>
                  <th className="px-4 py-3">Job</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Last run</th>
                  <th className="px-4 py-3">Next run</th>
                </tr>
              </thead>
              <tbody>
                {data.workerJobs.map((job) => (
                  <tr key={job.id} className="border-t border-stone-200/80">
                    <td className="px-4 py-4">
                      <p className="font-medium text-ink">{job.name}</p>
                      <p className="text-xs text-slateWarm">{job.schedule}</p>
                    </td>
                    <td className="px-4 py-4 text-ink">{job.last_status || "—"}</td>
                    <td className="px-4 py-4 text-slateWarm">{formatDateTime(job.last_run_at)}</td>
                    <td className="px-4 py-4 text-slateWarm">{formatDateTime(job.next_run_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel p-5">
          <p className="section-label">Recent worker events</p>
          <div className="mt-5 space-y-3">
            {data.workerEvents.slice(0, 8).map((event) => (
              <article key={event.id} className="panel-muted p-4">
                <div className="flex items-center justify-between gap-4">
                  <p className="font-medium text-ink">{event.event}</p>
                  <p className="text-xs uppercase tracking-[0.2em] text-slateWarm">{event.status}</p>
                </div>
                <p className="mt-2 text-xs text-slateWarm">{formatDateTime(event.created_at)}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
