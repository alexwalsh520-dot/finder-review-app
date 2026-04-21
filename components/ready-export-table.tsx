"use client"

import { useRouter } from "next/navigation"
import { startTransition, useEffect, useState } from "react"

import { createInstagramUrl } from "@/lib/format"
import type { LeadCoachingFilter, LeadGender, LeadRow } from "@/lib/types"

type ReadyExportFilters = {
  gender?: LeadGender | null
  coaching?: LeadCoachingFilter | null
}

function leadGenderLabel(lead: LeadRow): string {
  const gender = lead.review_snapshot?.gender || lead.gender
  if (gender === "male") {
    return "Male"
  }
  if (gender === "female") {
    return "Female"
  }
  return "—"
}

function leadCoachingLabel(lead: LeadRow): string {
  if (lead.review_snapshot?.has_coaching === true) {
    return "Has coaching"
  }
  if (lead.review_snapshot?.has_coaching === false) {
    return "No coaching"
  }
  return "—"
}

export function ReadyExportTable({
  leads,
  activeFilters,
  matchingTotal,
}: {
  leads: LeadRow[]
  activeFilters: ReadyExportFilters
  matchingTotal: number
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<string[]>(leads.map((lead) => lead.id))
  const [status, setStatus] = useState("")
  const [pending, setPending] = useState(false)

  const allSelected = selected.length === leads.length && leads.length > 0
  const hasActiveSegment = Boolean(activeFilters.gender || activeFilters.coaching)

  useEffect(() => {
    setSelected(leads.map((lead) => lead.id))
  }, [leads])

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]))
  }

  async function runExport(body: Record<string, unknown>, successMessage: string) {
    setPending(true)
    setStatus("")
    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || "Export failed.")
      }
      const blob = await response.blob()
      const disposition = response.headers.get("content-disposition") || ""
      const match = disposition.match(/filename=\"?([^\";]+)\"?/)
      const filename = match?.[1] || "finder_smartlead_export.csv"
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = filename
      anchor.click()
      URL.revokeObjectURL(url)
      setStatus(successMessage)
      startTransition(() => {
        router.refresh()
      })
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Export failed.")
    } finally {
      setPending(false)
    }
  }

  async function exportSelected() {
    await runExport({ leadIds: selected }, "Selected leads exported")
  }

  async function exportMatchingSegment() {
    await runExport(
      {
        filters: {
          gender: activeFilters.gender || undefined,
          coaching: activeFilters.coaching || undefined,
        },
      },
      "Matching segment exported",
    )
  }

  return (
    <div className="space-y-4">
      <div className="panel-muted flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-ink">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => setSelected(allSelected ? [] : leads.map((lead) => lead.id))}
            />
            Select all on this page
          </label>
          {hasActiveSegment ? (
            <p className="text-xs text-slateWarm">Segment export uses your current filters and includes all {matchingTotal} matching leads across every page.</p>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <p className="text-sm text-slateWarm">{selected.length} selected</p>
          {hasActiveSegment ? (
            <button type="button" onClick={exportMatchingSegment} disabled={pending || matchingTotal === 0} className="ghost-button px-4 py-2 text-sm">
              {pending ? "Exporting..." : `Export ${matchingTotal} matching`}
            </button>
          ) : null}
          <button
            type="button"
            onClick={exportSelected}
            disabled={pending || selected.length === 0}
            className="gold-button px-4 py-2 text-sm"
          >
            {pending ? "Exporting..." : "Export CSV"}
          </button>
        </div>
      </div>
      {status ? <p className="text-sm text-slateWarm">{status}</p> : null}
      <div className="table-shell">
        <table className="text-sm">
          <thead className="table-head text-left">
            <tr>
              <th className="px-4 py-3"></th>
              <th className="px-4 py-3">Lead</th>
              <th className="px-4 py-3">First name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Gender</th>
              <th className="px-4 py-3">Coaching</th>
              <th className="px-4 py-3">Source</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id} className="border-t border-stone-200/80">
                <td className="px-4 py-4">
                  <input type="checkbox" checked={selected.includes(lead.id)} onChange={() => toggle(lead.id)} />
                </td>
                <td className="px-4 py-4">
                  <div className="space-y-1">
                    <a href={createInstagramUrl(lead.instagram_handle)} target="_blank" rel="noreferrer" className="font-semibold text-ink underline-offset-2 hover:underline">
                      @{lead.instagram_handle}
                    </a>
                    <p className="text-xs text-slateWarm">{lead.full_name || "No full name"}</p>
                  </div>
                </td>
                <td className="px-4 py-4">{lead.first_name || "—"}</td>
                <td className="px-4 py-4">{lead.email}</td>
                <td className="px-4 py-4 text-slateWarm">{leadGenderLabel(lead)}</td>
                <td className="px-4 py-4 text-slateWarm">{leadCoachingLabel(lead)}</td>
                <td className="px-4 py-4 text-slateWarm">{lead.source_detail || lead.source || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
