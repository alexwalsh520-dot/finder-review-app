import Link from "next/link"

import { PaginationControls } from "@/components/pagination-controls"
import { ReviewActionRow } from "@/components/review-action-row"
import { requireSession } from "@/lib/auth"
import { getOwnerHistory, getOwnerQueue } from "@/lib/data"

export default async function OwnerQueuePage({ searchParams }: { searchParams?: { page?: string; view?: string } }) {
  const session = await requireSession(["owner"])
  const activeView = searchParams?.view === "history" ? "history" : "queue"
  const queue = activeView === "history" ? await getOwnerHistory(session.email, searchParams?.page) : await getOwnerQueue(searchParams?.page)

  return (
    <div className="space-y-6 p-2 md:p-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slateWarm">Owner queue</p>
          <h2 className="mt-2 text-3xl font-semibold text-ink">
            {activeView === "history" ? "Owner decision history" : "Qualified and not qualified leads waiting on Alex"}
          </h2>
          <p className="mt-2 text-sm text-slateWarm">
            {activeView === "history" ? "See your past approvals and rejections so rejected leads do not disappear." : "Approve, reject, or send leads back without losing track of them."}
          </p>
        </div>
        <p className="text-sm text-slateWarm">
          {queue.total ? `Showing ${queue.startIndex}-${queue.endIndex} of ${queue.total}` : activeView === "history" ? "0 history items" : "0 leads waiting"}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/owner"
          className={[
            "rounded-full px-4 py-2 text-sm font-medium",
            activeView === "queue" ? "bg-[#c9a96e]/15 text-[#d4b87d]" : "bg-white/[0.04] text-slateWarm hover:text-ink",
          ].join(" ")}
        >
          Needs action
        </Link>
        <Link
          href="/owner?view=history"
          className={[
            "rounded-full px-4 py-2 text-sm font-medium",
            activeView === "history" ? "bg-[#c9a96e]/15 text-[#d4b87d]" : "bg-white/[0.04] text-slateWarm hover:text-ink",
          ].join(" ")}
        >
          History
        </Link>
      </div>

      <PaginationControls
        pathname="/owner"
        page={queue.page}
        totalPages={queue.totalPages}
        hasNext={queue.hasNext}
        hasPrevious={queue.hasPrevious}
        startIndex={queue.startIndex}
        endIndex={queue.endIndex}
        total={queue.total}
        searchParams={activeView === "history" ? { view: "history" } : {}}
      />

      <div className="space-y-4">
        {queue.items.map((lead) => (
          <ReviewActionRow key={lead.id} lead={lead} mode="owner" />
        ))}
        {!queue.items.length ? (
          <div className="panel p-6">
            <p className="text-sm text-slateWarm">
              {activeView === "history" ? "No owner history items yet." : "No leads are waiting in the owner queue right now."}
            </p>
          </div>
        ) : null}
      </div>

      <PaginationControls
        pathname="/owner"
        page={queue.page}
        totalPages={queue.totalPages}
        hasNext={queue.hasNext}
        hasPrevious={queue.hasPrevious}
        startIndex={queue.startIndex}
        endIndex={queue.endIndex}
        total={queue.total}
        searchParams={activeView === "history" ? { view: "history" } : {}}
      />
    </div>
  )
}
