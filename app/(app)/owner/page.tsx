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
      <div className="table-shell overflow-x-auto">
        <table>
          <thead className="table-head text-left">
            <tr>
              <th className="px-4 py-3">Lead</th>
              <th className="px-4 py-3">First name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Notes</th>
              <th className="px-4 py-3">Bio</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <ReviewActionRow key={lead.id} lead={lead} mode="owner" />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
