import Link from "next/link"

import { ReviewActionRow } from "@/components/review-action-row"
import { getReviewQueue } from "@/lib/data"

type SearchParams = {
  q?: string
  batchDate?: string
  emailType?: string
  source?: string
  page?: string
}

function buildHref(searchParams: SearchParams, page: number) {
  const params = new URLSearchParams()
  if (searchParams.q) {
    params.set("q", searchParams.q)
  }
  if (searchParams.batchDate) {
    params.set("batchDate", searchParams.batchDate)
  }
  if (searchParams.emailType) {
    params.set("emailType", searchParams.emailType)
  }
  if (searchParams.source) {
    params.set("source", searchParams.source)
  }
  if (page > 1) {
    params.set("page", String(page))
  }
  const query = params.toString()
  return query ? `/review?${query}` : "/review"
}

export default async function ReviewQueuePage({ searchParams }: { searchParams: SearchParams }) {
  const queue = await getReviewQueue(searchParams)

  return (
    <div className="space-y-6 p-2 md:p-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slateWarm">Reviewer queue</p>
          <h2 className="mt-2 text-3xl font-semibold text-ink">Unreviewed emailed leads</h2>
        </div>
        <p className="text-sm text-slateWarm">
          {queue.total ? `Showing ${queue.startIndex}-${queue.endIndex} of ${queue.total}` : "0 leads shown"}
        </p>
      </div>

      <form className="panel grid gap-3 p-4 md:grid-cols-4">
        <input name="q" placeholder="Search handle, name, email" defaultValue={searchParams.q || ""} />
        <input name="batchDate" placeholder="Batch date (YYYY-MM-DD)" defaultValue={searchParams.batchDate || ""} />
        <select name="emailType" defaultValue={searchParams.emailType || ""}>
          <option value="">All email types</option>
          <option value="personal">Personal</option>
          <option value="management">Management</option>
        </select>
        <div className="flex gap-2">
          <input name="source" placeholder="Source / seed" defaultValue={searchParams.source || ""} className="flex-1" />
          <button type="submit" className="gold-button px-4 py-2 text-sm">
            Filter
          </button>
        </div>
      </form>

      {queue.totalPages > 1 ? (
        <div className="panel-muted flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <p className="text-sm text-slateWarm">
            Page {queue.page} of {queue.totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Link
              href={buildHref(searchParams, queue.page - 1)}
              aria-disabled={!queue.hasPrevious}
              className={["ghost-button px-3 py-2 text-sm", !queue.hasPrevious ? "pointer-events-none opacity-50" : ""].join(" ")}
            >
              Previous
            </Link>
            <Link
              href={buildHref(searchParams, queue.page + 1)}
              aria-disabled={!queue.hasNext}
              className={["ghost-button px-3 py-2 text-sm", !queue.hasNext ? "pointer-events-none opacity-50" : ""].join(" ")}
            >
              Next
            </Link>
          </div>
        </div>
      ) : null}

      <div className="space-y-4">
        {queue.items.map((lead) => (
          <ReviewActionRow key={lead.id} lead={lead} mode="reviewer" />
        ))}
        {!queue.items.length ? (
          <div className="panel p-6">
            <p className="text-sm text-slateWarm">No leads match the current filters.</p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
