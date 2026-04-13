"use client"

import { useRouter } from "next/navigation"
import { startTransition, useState } from "react"

import { createInstagramUrl } from "@/lib/format"
import type { LeadRow } from "@/lib/types"

export function ReadyExportTable({ leads }: { leads: LeadRow[] }) {
  const router = useRouter()
  const [selected, setSelected] = useState<string[]>(leads.map((lead) => lead.id))
  const [status, setStatus] = useState("")
  const [pending, setPending] = useState(false)

  const allSelected = selected.length === leads.length && leads.length > 0

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]))
  }

  async function exportSelected() {
    setPending(true)
    setStatus("")
    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ leadIds: selected }),
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
      setStatus("Export complete")
      startTransition(() => {
        router.refresh()
      })
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Export failed.")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="panel-muted flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <label className="flex items-center gap-2 text-sm font-medium text-ink">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() => setSelected(allSelected ? [] : leads.map((lead) => lead.id))}
          />
          Select all
        </label>
        <div className="flex items-center gap-3">
          <p className="text-sm text-slateWarm">{selected.length} selected</p>
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
                <td className="px-4 py-4 text-slateWarm">{lead.source_detail || lead.source || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
