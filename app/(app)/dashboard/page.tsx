import { DashboardAutoRefresh } from "@/components/dashboard-auto-refresh"
import { DailyProgressChart } from "@/components/daily-progress-chart"
import { requireSession } from "@/lib/auth"
import { getDashboardData } from "@/lib/data"
import { formatDayLabel } from "@/lib/format"
import Link from "next/link"

type SearchParams = Promise<{ day?: string }> | { day?: string }

export const dynamic = "force-dynamic"

export default async function DashboardPage({ searchParams }: { searchParams?: SearchParams }) {
  await requireSession()
  const resolvedSearchParams = searchParams ? await searchParams : {}
  const data = await getDashboardData(resolvedSearchParams.day)
  const chartRows = [...data.dailyEmailPerformance.slice(0, 7)].reverse()
  const reviewedShare = data.counts.todayEmailCount > 0 ? Math.round((data.counts.todayReviewedCount / data.counts.todayEmailCount) * 100) : 0
  const todayParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Makassar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date())
  const todayLookup = Object.fromEntries(todayParts.map((part) => [part.type, part.value]))
  const todayBusinessDate = `${todayLookup.year}-${todayLookup.month}-${todayLookup.day}`
  const selectedIndex = data.availableDays.findIndex((day) => day === data.selectedDay)
  const olderDay = selectedIndex >= 0 && selectedIndex < data.availableDays.length - 1 ? data.availableDays[selectedIndex + 1] : null
  const newerDay = selectedIndex > 0 ? data.availableDays[selectedIndex - 1] : null

  return (
    <div className="space-y-6 p-2 md:p-4">
      <DashboardAutoRefresh enabled={data.selectedDay === todayBusinessDate} />
      <section className="panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Link
                href={olderDay ? `/dashboard?day=${olderDay}` : "/dashboard"}
                className={`ghost-button flex h-9 w-9 items-center justify-center p-0 ${olderDay ? "" : "pointer-events-none opacity-30"}`}
                aria-disabled={!olderDay}
              >
                ←
              </Link>
              <Link
                href={newerDay ? `/dashboard?day=${newerDay}` : "/dashboard"}
                className={`ghost-button flex h-9 w-9 items-center justify-center p-0 ${newerDay ? "" : "pointer-events-none opacity-30"}`}
                aria-disabled={!newerDay}
              >
                →
              </Link>
            </div>
            <h2 className="mt-3 text-3xl font-semibold text-ink">{formatDayLabel(data.selectedDay)}</h2>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <article className="panel-muted p-4">
            <p className="section-label">New emails today</p>
            <p className="mt-2 text-3xl font-semibold text-ink">{data.counts.todayEmailCount}</p>
          </article>
          <article className="panel-muted p-4">
            <p className="section-label">Reviewed today</p>
            <p className="mt-2 text-3xl font-semibold text-ink">{data.counts.todayReviewedCount}</p>
          </article>
          <article className="panel-muted p-4">
            <p className="section-label">Waiting on Alex</p>
            <p className="mt-2 text-3xl font-semibold text-ink">{data.counts.todayWaitingOwnerCount}</p>
          </article>
          <article className="panel-muted p-4">
            <p className="section-label">Ready for Smartlead</p>
            <p className="mt-2 text-3xl font-semibold text-ink">{data.counts.todayReadyCount}</p>
          </article>
        </div>

        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-between gap-3 text-sm">
            <p className="font-medium text-ink">{data.counts.todayUnreviewedCount} still waiting review</p>
            <p className="text-slateWarm">{reviewedShare}% reviewed</p>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-black/10">
            <div
              className="h-full rounded-full bg-[#c9a96e] transition-all"
              style={{ width: `${Math.min(Math.max(reviewedShare, 0), 100)}%` }}
            />
          </div>
        </div>
      </section>

      <section className="panel p-5">
        <p className="section-label">Daily progress</p>
        <h3 className="mt-2 text-2xl font-semibold text-ink">New emails by day</h3>
        <div className="mt-4">
          <DailyProgressChart rows={chartRows} />
        </div>
      </section>
    </div>
  )
}
