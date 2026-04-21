import { PaginationControls } from "@/components/pagination-controls"
import { requireSession } from "@/lib/auth"
import { formatDateTime } from "@/lib/format"
import { getExportHistory } from "@/lib/data"

export default async function ExportsPage({ searchParams }: { searchParams?: { page?: string } }) {
  await requireSession(["owner"])
  const data = await getExportHistory(searchParams?.page)

  return (
    <div className="space-y-6 p-2 md:p-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slateWarm">Export history</p>
        <h2 className="mt-2 text-3xl font-semibold text-ink">Pending confirmation and recent sent rows</h2>
      </div>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="panel p-5">
          <p className="section-label">Recent export batches</p>
          <div className="mt-4 space-y-3">
            {data.batches.map((batch) => (
              <article key={batch.id} className="panel-muted p-4">
                <p className="font-medium text-ink">{batch.id}</p>
                <p className="mt-1 text-sm text-slateWarm">{batch.count} leads · {formatDateTime(batch.exportedAt)}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="panel p-5">
            <div className="flex items-center justify-between gap-4">
              <p className="section-label">Pending Smartlead confirmation</p>
              <p className="text-sm text-slateWarm">
                {data.pending.total ? `Showing ${data.pending.startIndex}-${data.pending.endIndex} of ${data.pending.total}` : "0 rows"}
              </p>
            </div>
            <div className="mt-4">
              <PaginationControls
                pathname="/exports"
                page={data.pending.page}
                totalPages={data.pending.totalPages}
                hasNext={data.pending.hasNext}
                hasPrevious={data.pending.hasPrevious}
                startIndex={data.pending.startIndex}
                endIndex={data.pending.endIndex}
                total={data.pending.total}
              />
            </div>
            <div className="mt-4 space-y-3">
              {data.pending.items.map((lead) => (
                <article key={lead.id} className="panel-muted p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-ink">{lead.email}</p>
                      <p className="mt-1 text-sm text-slateWarm">@{lead.instagram_handle} · batch {lead.export_batch_id}</p>
                    </div>
                    <p className="text-sm text-slateWarm">{formatDateTime(lead.exported_at)}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="panel p-5">
            <div className="flex items-center justify-between gap-4">
              <p className="section-label">Recently confirmed sent</p>
              <p className="text-sm text-slateWarm">
                {data.sent.total ? `Showing ${data.sent.startIndex}-${data.sent.endIndex} of ${data.sent.total}` : "0 rows"}
              </p>
            </div>
            <div className="mt-4">
              <PaginationControls
                pathname="/exports"
                page={data.sent.page}
                totalPages={data.sent.totalPages}
                hasNext={data.sent.hasNext}
                hasPrevious={data.sent.hasPrevious}
                startIndex={data.sent.startIndex}
                endIndex={data.sent.endIndex}
                total={data.sent.total}
              />
            </div>
            <div className="mt-4 space-y-3">
              {data.sent.items.map((lead) => (
                <article key={lead.id} className="panel-muted p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-ink">{lead.email}</p>
                      <p className="mt-1 text-sm text-slateWarm">@{lead.instagram_handle} · campaign {lead.smartlead_campaign_id || "—"}</p>
                    </div>
                    <p className="text-sm text-slateWarm">{formatDateTime(lead.smartlead_sent_at)}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
