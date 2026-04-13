import { ReviewActionRow } from "@/components/review-action-row"
import { getReviewQueue } from "@/lib/data"

type SearchParams = {
  q?: string
  batchDate?: string
  emailType?: string
  source?: string
}

export default async function ReviewQueuePage({ searchParams }: { searchParams: SearchParams }) {
  const leads = await getReviewQueue(searchParams)

  return (
    <div className="space-y-6 p-2 md:p-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slateWarm">Reviewer queue</p>
          <h2 className="mt-2 text-3xl font-semibold text-ink">Unreviewed emailed leads</h2>
        </div>
        <p className="text-sm text-slateWarm">{leads.length} leads shown</p>
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

      <div className="space-y-4">
        {leads.map((lead) => (
          <ReviewActionRow key={lead.id} lead={lead} mode="reviewer" />
        ))}
        {!leads.length ? (
          <div className="panel p-6">
            <p className="text-sm text-slateWarm">No leads match the current filters.</p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
