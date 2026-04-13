import { ReviewActionRow } from "@/components/review-action-row"
import { requireSession } from "@/lib/auth"
import { getOwnerQueue } from "@/lib/data"

export default async function OwnerQueuePage() {
  await requireSession(["owner"])
  const leads = await getOwnerQueue()

  return (
    <div className="space-y-6 p-2 md:p-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slateWarm">Owner queue</p>
          <h2 className="mt-2 text-3xl font-semibold text-ink">VA-approved and flagged leads</h2>
        </div>
        <p className="text-sm text-slateWarm">{leads.length} leads waiting</p>
      </div>
      <div className="space-y-4">
        {leads.map((lead) => (
          <ReviewActionRow key={lead.id} lead={lead} mode="owner" />
        ))}
        {!leads.length ? (
          <div className="panel p-6">
            <p className="text-sm text-slateWarm">No leads are waiting in the owner queue right now.</p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
