"use client"

import { useRouter } from "next/navigation"
import { startTransition, useState } from "react"

import { compactNumber, createInstagramUrl, formatDateTime } from "@/lib/format"
import type { LeadRow } from "@/lib/types"

type Mode = "reviewer" | "owner"

type Props = {
  lead: LeadRow
  mode: Mode
}

export function ReviewActionRow({ lead, mode }: Props) {
  const router = useRouter()
  const [firstName, setFirstName] = useState(lead.first_name || "")
  const [note, setNote] = useState(lead.review_notes || "")
  const [status, setStatus] = useState("")
  const [pending, setPending] = useState(false)

  async function runAction(action: string) {
    setPending(true)
    setStatus("")
    try {
      const response = await fetch(`/api/review/${lead.id}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action,
          firstName,
          note,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload.error || "Action failed.")
      }
      setStatus("Saved")
      startTransition(() => {
        router.refresh()
      })
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Action failed.")
    } finally {
      setPending(false)
    }
  }

  return (
    <tr className="border-b border-stone-200/80">
      <td className="px-4 py-4">
        <div className="space-y-1">
          <a href={createInstagramUrl(lead.instagram_handle)} target="_blank" rel="noreferrer" className="font-semibold text-ink underline-offset-2 hover:underline">
            @{lead.instagram_handle}
          </a>
          <p className="text-sm text-slateWarm">{lead.full_name || "No full name"}</p>
          <p className="text-xs text-slateWarm">Batch {lead.batch_date || "—"}</p>
        </div>
      </td>
      <td className="px-4 py-4">
        <div className="space-y-2">
          <input value={firstName} onChange={(event) => setFirstName(event.target.value)} placeholder="First name" className="w-full" />
          <p className="text-xs text-slateWarm">Followers {compactNumber(lead.follower_count)}</p>
        </div>
      </td>
      <td className="px-4 py-4">
        <div className="space-y-2">
          <p className="text-sm font-medium text-ink">{lead.email}</p>
          <p className="text-xs text-slateWarm">{lead.status === "mgmt_email" ? "Management" : "Personal"} · {lead.email_source || "Unknown source"}</p>
        </div>
      </td>
      <td className="px-4 py-4">
        <div className="space-y-2">
          <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} className="w-full min-w-[280px]" placeholder="Review note" />
          <p className="text-xs text-slateWarm">Source {lead.source_detail || lead.source || "—"}</p>
        </div>
      </td>
      <td className="px-4 py-4">
        <p className="max-w-md whitespace-pre-wrap text-sm leading-6 text-slateWarm">{lead.bio || "No bio available."}</p>
      </td>
      <td className="px-4 py-4">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-slateWarm">{lead.review_status}</p>
          <p className="text-xs text-slateWarm">Updated {formatDateTime(lead.reviewed_at || lead.created_at)}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => runAction("save")} disabled={pending} className="ghost-button px-3 py-2 text-xs">
              Save
            </button>
            {mode === "reviewer" ? (
              <>
                <button type="button" onClick={() => runAction("va_approve")} disabled={pending} className="gold-button px-3 py-2 text-xs">
                  VA Approve
                </button>
                <button type="button" onClick={() => runAction("flag")} disabled={pending} className="warning-button px-3 py-2 text-xs">
                  Flag for Alex
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => runAction("owner_approve")} disabled={pending} className="gold-button px-3 py-2 text-xs">
                  Approve
                </button>
                <button type="button" onClick={() => runAction("reject")} disabled={pending} className="danger-button px-3 py-2 text-xs">
                  Reject
                </button>
                <button type="button" onClick={() => runAction("reopen")} disabled={pending} className="ghost-button px-3 py-2 text-xs">
                  Reopen
                </button>
              </>
            )}
          </div>
          {status ? <p className="text-xs text-slateWarm">{status}</p> : null}
        </div>
      </td>
    </tr>
  )
}
