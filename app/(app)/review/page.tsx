import Link from "next/link"

import { LiveTopUpPanel } from "@/components/live-top-up-panel"
import { PaginationControls } from "@/components/pagination-controls"
import { ReviewActionRow } from "@/components/review-action-row"
import { requireSession } from "@/lib/auth"
import { getReviewerHistory, getReviewQueue, getRunStatus } from "@/lib/data"

type SearchParams = {
  page?: string
  view?: string
  q?: string
}

function buildReviewHref(view: "queue" | "history", q?: string) {
  const params = new URLSearchParams()
  if (view === "history") {
    params.set("view", "history")
  }
  if (q?.trim()) {
    params.set("q", q.trim())
  }
  const query = params.toString()
  return query ? `/review?${query}` : "/review"
}

export default async function ReviewQueuePage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireSession()
  const activeView = session.role === "reviewer" && searchParams.view === "history" ? "history" : "queue"
  const searchQuery = searchParams.q?.trim() || ""
  const [queue, runStatus] = await Promise.all([
    activeView === "history" ? getReviewerHistory(session.email, searchParams) : getReviewQueue(searchParams),
    getRunStatus(),
  ])
  const historyNeedsSearch = activeView === "history" && !searchQuery
  const showingLabel = historyNeedsSearch
    ? "Search by handle, name, or email"
    : queue.total > queue.items.length
      ? `Showing ${queue.startIndex}-${queue.endIndex} of ${queue.total} matching leads`
      : `${queue.total} matching leads`
  const todaySummary = `${runStatus.topUp.todayEmailCount} new today · ${runStatus.topUp.todayUnreviewedCount} still waiting review`
  const heading = activeView === "history" ? "Your review history" : "Unreviewed emailed leads"
  const subheading =
    activeView === "history"
      ? historyNeedsSearch
        ? "Search for a handle, name, or email to reopen a lead you already touched, including leads already sent to Smartlead."
        : "Open any past decision to review it again or make changes before it gets sent."
      : todaySummary

  return (
    <div className="space-y-6 p-2 md:p-4">
      <LiveTopUpPanel initialTopUp={runStatus.topUp} compact />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slateWarm">Reviewer queue</p>
          <h2 className="mt-2 text-3xl font-semibold text-ink">{heading}</h2>
          <p className="mt-2 text-sm text-slateWarm">{subheading}</p>
        </div>
        <p className="text-sm text-slateWarm">{showingLabel}</p>
      </div>

      {session.role === "reviewer" ? (
        <div className="flex flex-wrap gap-2">
          <Link
            href={buildReviewHref("queue", searchQuery)}
            className={[
              "rounded-full px-4 py-2 text-sm font-medium",
              activeView === "queue" ? "bg-[#c9a96e]/15 text-[#d4b87d]" : "bg-white/[0.04] text-slateWarm hover:text-ink",
            ].join(" ")}
          >
            Needs review
          </Link>
          <Link
            href={buildReviewHref("history", searchQuery)}
            className={[
              "rounded-full px-4 py-2 text-sm font-medium",
              activeView === "history" ? "bg-[#c9a96e]/15 text-[#d4b87d]" : "bg-white/[0.04] text-slateWarm hover:text-ink",
            ].join(" ")}
          >
            History
          </Link>
        </div>
      ) : null}

      <form className="panel flex flex-wrap items-center gap-3 p-4" action="/review" method="get">
        {activeView === "history" ? <input type="hidden" name="view" value="history" /> : null}
        <input
          type="search"
          name="q"
          defaultValue={searchQuery}
          placeholder="Search handle, name, or email"
          className="min-w-[240px] flex-1"
        />
        <button type="submit" className="gold-button px-4 py-2 text-sm">
          Search
        </button>
        {searchQuery ? (
          <Link href={buildReviewHref(activeView, "")} className="ghost-button px-4 py-2 text-sm">
            Clear
          </Link>
        ) : null}
      </form>

      {!historyNeedsSearch ? (
        <PaginationControls
          pathname="/review"
          page={queue.page}
          totalPages={queue.totalPages}
          hasNext={queue.hasNext}
          hasPrevious={queue.hasPrevious}
          startIndex={queue.startIndex}
          endIndex={queue.endIndex}
          total={queue.total}
          searchParams={activeView === "history" ? { view: "history", q: searchQuery || undefined } : { q: searchQuery || undefined }}
        />
      ) : null}

      <div className="space-y-4">
        <div className="panel-muted hidden px-4 py-3 md:grid md:grid-cols-[1.2fr_1.35fr_0.7fr_0.75fr_0.95fr_auto] md:items-center md:gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slateWarm">Creator</p>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slateWarm">Email</p>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slateWarm">Followers</p>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slateWarm">Batch</p>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slateWarm">Status</p>
          <p className="text-right text-xs font-semibold uppercase tracking-[0.18em] text-slateWarm">Open</p>
        </div>
        {queue.items.map((lead) => (
          <ReviewActionRow key={lead.id} lead={lead} mode="reviewer" />
        ))}
        {!queue.items.length ? (
          <div className="panel p-6">
            <p className="text-sm text-slateWarm">
              {historyNeedsSearch ? "Search for a specific lead to open reviewer history without loading the full archive." : "No leads match the current filters."}
            </p>
          </div>
        ) : null}
      </div>

      {!historyNeedsSearch ? (
        <PaginationControls
          pathname="/review"
          page={queue.page}
          totalPages={queue.totalPages}
          hasNext={queue.hasNext}
          hasPrevious={queue.hasPrevious}
          startIndex={queue.startIndex}
          endIndex={queue.endIndex}
          total={queue.total}
          searchParams={activeView === "history" ? { view: "history", q: searchQuery || undefined } : { q: searchQuery || undefined }}
        />
      ) : null}
    </div>
  )
}
