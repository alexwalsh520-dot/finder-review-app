import Link from "next/link"

type Props = {
  pathname: string
  page: number
  totalPages: number
  hasNext: boolean
  hasPrevious: boolean
  startIndex: number
  endIndex: number
  total: number
  searchParams?: Record<string, string | undefined>
}

function buildHref(pathname: string, searchParams: Record<string, string | undefined>, page: number) {
  const params = new URLSearchParams()
  Object.entries(searchParams).forEach(([key, value]) => {
    if (!value || key === "page") {
      return
    }
    params.set(key, value)
  })
  if (page > 1) {
    params.set("page", String(page))
  }
  const query = params.toString()
  return query ? `${pathname}?${query}` : pathname
}

export function PaginationControls({
  pathname,
  page,
  totalPages,
  hasNext,
  hasPrevious,
  startIndex,
  endIndex,
  total,
  searchParams = {},
}: Props) {
  if (totalPages <= 1) {
    return null
  }

  return (
    <div className="panel-muted flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <p className="text-sm text-slateWarm">
        Showing {startIndex}-{endIndex} of {total}
      </p>
      <div className="flex items-center gap-2">
        <Link
          href={buildHref(pathname, searchParams, page - 1)}
          aria-disabled={!hasPrevious}
          className={[
            "ghost-button px-3 py-2 text-sm",
            !hasPrevious ? "pointer-events-none opacity-50" : "",
          ].join(" ")}
        >
          Previous
        </Link>
        <p className="px-2 text-sm text-slateWarm">
          Page {page} of {totalPages}
        </p>
        <Link
          href={buildHref(pathname, searchParams, page + 1)}
          aria-disabled={!hasNext}
          className={[
            "ghost-button px-3 py-2 text-sm",
            !hasNext ? "pointer-events-none opacity-50" : "",
          ].join(" ")}
        >
          Next
        </Link>
      </div>
    </div>
  )
}
