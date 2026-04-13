import { ReadyExportTable } from "@/components/ready-export-table"
import { requireSession } from "@/lib/auth"
import { getReadyForSmartlead } from "@/lib/data"

export default async function ReadyPage() {
  await requireSession(["owner"])
  const leads = await getReadyForSmartlead()

  return (
    <div className="space-y-6 p-2 md:p-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slateWarm">Ready for Smartlead</p>
          <h2 className="mt-2 text-3xl font-semibold text-ink">Approved leads ready to export</h2>
        </div>
        <p className="text-sm text-slateWarm">{leads.length} approved unsent leads</p>
      </div>
      <ReadyExportTable leads={leads} />
    </div>
  )
}
