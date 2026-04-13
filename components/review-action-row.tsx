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

function initialFirstName(lead: LeadRow): string {
  if (lead.first_name?.trim()) {
    return lead.first_name.trim()
  }
  if (lead.full_name?.trim()) {
    return lead.full_name.trim().split(/\s+/)[0] || ""
  }
  return ""
}

export function ReviewActionRow({ lead, mode }: Props) {
  const router = useRouter()
  const originalFirstName = initialFirstName(lead)
  const originalNote = lead.review_notes || ""

  const [firstName, setFirstName] = useState(originalFirstName)
  const [note, setNote] = useState(originalNote)
  const [status, setStatus] = useState("")
  const [pending, setPending] = useState(false)
  const [showNameActions, setShowNameActions] = useState(false)
  const [showNoteActions, setShowNoteActions] = useState(false)

  const nameDirty = firstName.trim() !== originalFirstName
  const noteDirty = note !== originalNote

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
      setStatus(action === "save" ? "Saved" : "Updated")
      setShowNameActions(false)
      setShowNoteActions(false)
      startTransition(() => {
        router.refresh()
      })
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Action failed.")
    } finally {
      setPending(false)
    }
  }

  function cancelNameEdit() {
    setFirstName(originalFirstName)
    setShowNameActions(false)
    setStatus("")
  }

  function cancelNoteEdit() {
    setNote(originalNote)
    setShowNoteActions(false)
    setStatus("")
  }

  return (
    <article className="panel p-5">
      <div className="grid gap-5 xl:grid-cols-[1.05fr_1fr_0.8fr]">
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <a
                href={createInstagramUrl(lead.instagram_handle)}
                target="_blank"
                rel="noreferrer"
                className="text-lg font-semibold text-ink underline-offset-2 hover:underline"
              >
                @{lead.instagram_handle}
              </a>
              <span className="rounded-full border border-white/[0.08] px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-slateWarm">
                {lead.review_status}
              </span>
            </div>
            <p className="text-sm text-white/70">{lead.full_name || "No full name"}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="panel-muted p-3">
              <p className="section-label">Email</p>
              <p className="mt-2 break-all text-sm font-medium text-ink">{lead.email}</p>
              <p className="mt-2 text-xs text-slateWarm">
                {lead.status === "mgmt_email" ? "Management" : "Personal"} · {lead.email_source || "Unknown source"}
              </p>
            </div>
            <div className="panel-muted p-3">
              <p className="section-label">Lead details</p>
              <p className="mt-2 text-sm text-ink">Followers {compactNumber(lead.follower_count)}</p>
              <p className="mt-2 text-xs text-slateWarm">Batch {lead.batch_date || "—"}</p>
              <p className="mt-1 text-xs text-slateWarm">Source {lead.source_detail || lead.source || "—"}</p>
            </div>
          </div>

          <div className="panel-muted p-3">
            <p className="section-label">Bio</p>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-white/72">{lead.bio || "No bio available."}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="panel-muted p-4">
            <p className="section-label">First name</p>
            <div className="mt-3 space-y-3">
              <input
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                onFocus={() => setShowNameActions(true)}
                placeholder="First name"
                className="w-full"
              />
              {(showNameActions || nameDirty) ? (
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => runAction("save")} disabled={pending || !nameDirty} className="gold-button px-3 py-2 text-xs">
                    Save name
                  </button>
                  <button type="button" onClick={cancelNameEdit} disabled={pending} className="ghost-button px-3 py-2 text-xs">
                    Cancel
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <div className="panel-muted p-4">
            <p className="section-label">Review note</p>
            <div className="mt-3 space-y-3">
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                onFocus={() => setShowNoteActions(true)}
                rows={5}
                className="w-full"
                placeholder="Leave a note for the review trail"
              />
              {(showNoteActions || noteDirty) ? (
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => runAction("save")} disabled={pending || !noteDirty} className="gold-button px-3 py-2 text-xs">
                    Save note
                  </button>
                  <button type="button" onClick={cancelNoteEdit} disabled={pending} className="ghost-button px-3 py-2 text-xs">
                    Cancel
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="panel-muted p-4">
            <p className="section-label">Actions</p>
            <p className="mt-3 text-xs text-slateWarm">Updated {formatDateTime(lead.reviewed_at || lead.created_at)}</p>
            <div className="mt-4 flex flex-wrap gap-2">
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
          </div>

          {status ? (
            <div className="panel-muted p-3">
              <p className="text-sm text-slateWarm">{status}</p>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  )
}
