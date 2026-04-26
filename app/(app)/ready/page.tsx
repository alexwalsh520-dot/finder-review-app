import Link from "next/link"

import { PaginationControls } from "@/components/pagination-controls"
import { ReadyExportTable } from "@/components/ready-export-table"
import { requireSession } from "@/lib/auth"
import { getReadyForSmartlead } from "@/lib/data"

type SearchParams = {
  page?: string
  gender?: string
  coaching?: string
  exportStatus?: string
}

const SEGMENT_PRESETS = [
  { label: "All", gender: "", coaching: "" },
  { label: "Male + Has coaching", gender: "male", coaching: "has" },
  { label: "Male + No coaching", gender: "male", coaching: "none" },
  { label: "Female + Has coaching", gender: "female", coaching: "has" },
  { label: "Female + No coaching", gender: "female", coaching: "none" },
]

function readyHref(gender: string, coaching: string, exportStatus: string) {
  const params = new URLSearchParams()
  if (gender) {
    params.set("gender", gender)
  }
  if (coaching) {
    params.set("coaching", coaching)
  }
  if (exportStatus) {
    params.set("exportStatus", exportStatus)
  }
  const query = params.toString()
  return query ? `/ready?${query}` : "/ready"
}

export default async function ReadyPage({ searchParams }: { searchParams?: SearchParams }) {
  await requireSession(["owner"])
  const activeGender = searchParams?.gender === "male" || searchParams?.gender === "female" ? searchParams.gender : ""
  const activeCoaching = searchParams?.coaching === "has" || searchParams?.coaching === "none" ? searchParams.coaching : ""
  const activeExportStatus =
    searchParams?.exportStatus === "previously_exported" || searchParams?.exportStatus === "all_unsent" ? searchParams.exportStatus : ""
  const queue = await getReadyForSmartlead({
    page: searchParams?.page,
    gender: activeGender || undefined,
    coaching: activeCoaching || undefined,
    exportStatus: activeExportStatus || undefined,
  })

  return (
    <div className="space-y-6 p-2 md:p-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slateWarm">Ready for Smartlead</p>
          <h2 className="mt-2 text-3xl font-semibold text-ink">Approved leads ready to export</h2>
        </div>
        <p className="text-sm text-slateWarm">
          {queue.total ? `Showing ${queue.startIndex}-${queue.endIndex} of ${queue.total}` : "0 matching unsent leads"}
        </p>
      </div>

      <div className="panel-muted px-4 py-4">
        <div className="mb-4 flex flex-wrap gap-2">
          {SEGMENT_PRESETS.map((preset) => {
            const active = preset.gender === activeGender && preset.coaching === activeCoaching
            return (
              <Link
                key={preset.label}
                href={readyHref(preset.gender, preset.coaching, activeExportStatus)}
                className={[
                  "rounded-full px-3 py-2 text-xs font-semibold",
                  active ? "bg-[#c9a96e]/15 text-[#d4b87d]" : "bg-white/[0.04] text-slateWarm hover:text-ink",
                ].join(" ")}
              >
                {preset.label}
              </Link>
            )
          })}
        </div>

        <form action="/ready" className="flex flex-wrap items-end gap-3">
          <div className="min-w-[180px]">
            <label htmlFor="ready-gender" className="block text-xs font-semibold uppercase tracking-[0.18em] text-slateWarm">
              Gender
            </label>
            <select id="ready-gender" name="gender" defaultValue={activeGender} className="mt-2 w-full">
              <option value="">All genders</option>
              <option value="male">Male only</option>
              <option value="female">Female only</option>
            </select>
          </div>

          <div className="min-w-[220px]">
            <label htmlFor="ready-coaching" className="block text-xs font-semibold uppercase tracking-[0.18em] text-slateWarm">
              Coaching
            </label>
            <select id="ready-coaching" name="coaching" defaultValue={activeCoaching} className="mt-2 w-full">
              <option value="">All coaching statuses</option>
              <option value="has">Has coaching</option>
              <option value="none">No coaching</option>
            </select>
          </div>

          <div className="min-w-[240px]">
            <label htmlFor="ready-export-status" className="block text-xs font-semibold uppercase tracking-[0.18em] text-slateWarm">
              Export status
            </label>
            <select id="ready-export-status" name="exportStatus" defaultValue={activeExportStatus} className="mt-2 w-full">
              <option value="">Ready only</option>
              <option value="previously_exported">Previously exported</option>
              <option value="all_unsent">Ready + previously exported</option>
            </select>
          </div>

          <button type="submit" className="gold-button px-4 py-2 text-sm">
            Apply filters
          </button>
          <Link href="/ready" className="ghost-button px-4 py-2 text-sm">
            Clear
          </Link>
        </form>
        <p className="mt-3 text-xs text-slateWarm">
          The export button below downloads every matching lead across all pages.
        </p>
      </div>

      <PaginationControls
        pathname="/ready"
        page={queue.page}
        totalPages={queue.totalPages}
        hasNext={queue.hasNext}
        hasPrevious={queue.hasPrevious}
        startIndex={queue.startIndex}
        endIndex={queue.endIndex}
        total={queue.total}
        searchParams={{ gender: activeGender || undefined, coaching: activeCoaching || undefined, exportStatus: activeExportStatus || undefined }}
      />

      <ReadyExportTable
        leads={queue.items}
        activeFilters={{ gender: activeGender || undefined, coaching: activeCoaching || undefined, exportStatus: activeExportStatus || undefined }}
        matchingTotal={queue.total}
      />

      <PaginationControls
        pathname="/ready"
        page={queue.page}
        totalPages={queue.totalPages}
        hasNext={queue.hasNext}
        hasPrevious={queue.hasPrevious}
        startIndex={queue.startIndex}
        endIndex={queue.endIndex}
        total={queue.total}
        searchParams={{ gender: activeGender || undefined, coaching: activeCoaching || undefined, exportStatus: activeExportStatus || undefined }}
      />
    </div>
  )
}
