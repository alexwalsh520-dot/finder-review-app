import Link from "next/link"

import { PaginationControls } from "@/components/pagination-controls"
import { ReadyExportTable } from "@/components/ready-export-table"
import { requireSession } from "@/lib/auth"
import { getReadyForSmartlead } from "@/lib/data"

type SearchParams = {
  page?: string
  gender?: string
  coaching?: string
}

export default async function ReadyPage({ searchParams }: { searchParams?: SearchParams }) {
  await requireSession(["owner"])
  const activeGender = searchParams?.gender === "male" || searchParams?.gender === "female" ? searchParams.gender : ""
  const activeCoaching = searchParams?.coaching === "has" || searchParams?.coaching === "none" ? searchParams.coaching : ""
  const queue = await getReadyForSmartlead({
    page: searchParams?.page,
    gender: activeGender || undefined,
    coaching: activeCoaching || undefined,
  })

  return (
    <div className="space-y-6 p-2 md:p-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slateWarm">Ready for Smartlead</p>
          <h2 className="mt-2 text-3xl font-semibold text-ink">Approved leads ready to export</h2>
        </div>
        <p className="text-sm text-slateWarm">
          {queue.total ? `Showing ${queue.startIndex}-${queue.endIndex} of ${queue.total}` : "0 approved unsent leads"}
        </p>
      </div>

      <div className="panel-muted px-4 py-4">
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

          <button type="submit" className="gold-button px-4 py-2 text-sm">
            Apply filters
          </button>
          <Link href="/ready" className="ghost-button px-4 py-2 text-sm">
            Clear
          </Link>
        </form>
        <p className="mt-3 text-xs text-slateWarm">
          Filter by gender, coaching, or both. Then use the matching export button below to download the full segment across all pages.
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
        searchParams={{ gender: activeGender || undefined, coaching: activeCoaching || undefined }}
      />

      <ReadyExportTable
        leads={queue.items}
        activeFilters={{ gender: activeGender || undefined, coaching: activeCoaching || undefined }}
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
        searchParams={{ gender: activeGender || undefined, coaching: activeCoaching || undefined }}
      />
    </div>
  )
}
