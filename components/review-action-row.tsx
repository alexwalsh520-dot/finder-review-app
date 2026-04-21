"use client"

import { ChevronDown, CircleHelp, ExternalLink } from "lucide-react"
import { useRouter } from "next/navigation"
import { startTransition, useEffect, useMemo, useState } from "react"

import { compactNumber, createInstagramUrl, formatDateTime, formatDayLabel } from "@/lib/format"
import type { ChecklistResult, LeadChecklist, LeadGender, LeadRow } from "@/lib/types"

type Mode = "reviewer" | "owner"

type Props = {
  lead: LeadRow
  mode: Mode
}

const CHECKLIST_ITEMS: Array<{
  key: keyof LeadChecklist
  label: string
  help: string
}> = [
  {
    key: "authority",
    label: "Authority / Credibility",
    help: "Look for at least two recent posts that make the audience trust this person’s expertise, physique, or useful coaching.",
  },
  {
    key: "personality",
    label: "Personality / Relatability",
    help: "Look for at least two recent posts that show opinion, style, humor, or something that makes the creator feel human and likable.",
  },
  {
    key: "engagement",
    label: "Engagement / Visceral Reaction",
    help: "Look for spoken content, a strong vibe, or something that clearly gets people reacting and paying attention.",
  },
]

function initialFirstName(lead: LeadRow): string {
  if (lead.first_name?.trim()) {
    return lead.first_name.trim()
  }
  if (lead.full_name?.trim()) {
    return lead.full_name.trim().split(/\s+/)[0] || ""
  }
  return ""
}

function initialEmail(lead: LeadRow): string {
  return (lead.email || "").trim()
}

function initialEmailType(lead: LeadRow): "personal" | "management" | null {
  return lead.review_snapshot?.email_type || null
}

function resolvedLeadEmailType(lead: LeadRow): "personal" | "management" | null {
  if (lead.review_snapshot?.email_type) {
    return lead.review_snapshot.email_type
  }
  if (lead.status === "mgmt_email") {
    return "management"
  }
  if (lead.status === "email_ready") {
    return "personal"
  }
  return null
}

function initialGender(lead: LeadRow): LeadGender | null {
  return lead.gender || lead.review_snapshot?.gender || null
}

function initialHasCoaching(lead: LeadRow): boolean | null {
  return lead.review_snapshot?.has_coaching ?? null
}

function formatEmailTypeLabel(value: "personal" | "management" | null | undefined): string {
  if (value === "management") {
    return "Management"
  }
  if (value === "personal") {
    return "Personal"
  }
  return "Not chosen"
}

function formatGenderLabel(value: LeadGender | null | undefined): string {
  if (value === "male") {
    return "Male"
  }
  if (value === "female") {
    return "Female"
  }
  return "Not chosen"
}

function formatCoachingLabel(value: boolean | null | undefined): string {
  if (value === true) {
    return "Has coaching"
  }
  if (value === false) {
    return "No coaching"
  }
  return "Not chosen"
}

function emptyChecklist(): LeadChecklist {
  return {
    authority: null,
    personality: null,
    engagement: null,
  }
}

function statusLabel(lead: LeadRow) {
  if (lead.sent_to_smartlead) {
    return "Sent"
  }
  if (lead.review_status === "unreviewed") {
    return "Needs VA review"
  }
  if (lead.review_status === "va_approved") {
    return "VA says qualified"
  }
  if (lead.review_status === "flagged") {
    return "VA says not qualified"
  }
  if (lead.review_status === "approved") {
    return "Ready for Smartlead"
  }
  if (lead.review_status === "exported_pending_confirmation") {
    return "Pending Smartlead"
  }
  if (lead.review_status === "rejected") {
    return "Rejected"
  }
  return lead.review_status
}

function decisionTimestampLabel(lead: LeadRow, mode: Mode) {
  if (mode === "owner" && lead.review_snapshot?.reviewed_at) {
    return `VA reviewed ${formatDateTime(lead.review_snapshot.reviewed_at)}`
  }
  if (lead.reviewed_at) {
    return `Reviewed ${formatDateTime(lead.reviewed_at)}`
  }
  return `Created ${formatDateTime(lead.created_at)}`
}

function checklistSummary(checklist: LeadChecklist) {
  return CHECKLIST_ITEMS.map((item) => ({
    ...item,
    value: checklist[item.key],
  }))
}

type SavedFields = {
  firstName: string
  email: string
  emailType: "personal" | "management" | null
  gender: LeadGender | null
  hasCoaching: boolean | null
  note: string
}

function buildSavedFields(lead: LeadRow, mode: Mode): SavedFields {
  return {
    firstName: initialFirstName(lead),
    email: initialEmail(lead).toLowerCase(),
    emailType: initialEmailType(lead),
    gender: initialGender(lead),
    hasCoaching: initialHasCoaching(lead),
    note: (mode === "owner" ? lead.review_snapshot?.owner_note || "" : lead.review_snapshot?.va_note || lead.review_notes || "").trim(),
  }
}

function resolveSavedFirstName(lead: LeadRow, value: string): string {
  const trimmed = value.trim()
  if (trimmed) {
    return trimmed
  }
  return initialFirstName(lead)
}

function resolveSavedEmail(value: string): string {
  return value.trim().toLowerCase()
}

export function ReviewActionRow({ lead, mode }: Props) {
  const router = useRouter()
  const [savedFields, setSavedFields] = useState<SavedFields>(() => buildSavedFields(lead, mode))
  const [firstName, setFirstName] = useState(savedFields.firstName)
  const [email, setEmail] = useState(savedFields.email)
  const [emailType, setEmailType] = useState<"personal" | "management" | null>(savedFields.emailType)
  const [gender, setGender] = useState<LeadGender | null>(savedFields.gender)
  const [hasCoaching, setHasCoaching] = useState<boolean | null>(savedFields.hasCoaching)
  const [note, setNote] = useState(savedFields.note)
  const [checklist, setChecklist] = useState<LeadChecklist>(lead.review_snapshot?.checklist || emptyChecklist())
  const [status, setStatus] = useState("")
  const [pending, setPending] = useState(false)
  const [showNameActions, setShowNameActions] = useState(false)
  const [showEmailActions, setShowEmailActions] = useState(false)
  const [showEmailTypeActions, setShowEmailTypeActions] = useState(false)
  const [showGenderActions, setShowGenderActions] = useState(false)
  const [showCoachingActions, setShowCoachingActions] = useState(false)
  const [showNoteActions, setShowNoteActions] = useState(false)
  const [showChecklistHelp, setShowChecklistHelp] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const nextSavedFields = buildSavedFields(lead, mode)
    setSavedFields(nextSavedFields)
    setFirstName(nextSavedFields.firstName)
    setEmail(nextSavedFields.email)
    setEmailType(nextSavedFields.emailType)
    setGender(nextSavedFields.gender)
    setHasCoaching(nextSavedFields.hasCoaching)
    setNote(nextSavedFields.note)
    setChecklist(lead.review_snapshot?.checklist || emptyChecklist())
    setPending(false)
  }, [lead, mode])

  const nameDirty = firstName.trim() !== savedFields.firstName
  const emailDirty = resolveSavedEmail(email) !== savedFields.email
  const emailTypeDirty = emailType !== savedFields.emailType
  const genderDirty = gender !== savedFields.gender
  const coachingDirty = hasCoaching !== savedFields.hasCoaching
  const noteDirty = note.trim() !== savedFields.note
  const checklistAllPass = checklist.authority === "pass" && checklist.personality === "pass" && checklist.engagement === "pass"
  const ownerCanApprove = lead.review_status !== "approved" && lead.review_status !== "exported_pending_confirmation" && !lead.sent_to_smartlead
  const ownerCanReject = lead.review_status !== "rejected" && !lead.sent_to_smartlead
  const ownerCanReopen = !lead.sent_to_smartlead
  const reviewerDecisionSummary = useMemo(() => {
    if (!lead.review_snapshot?.recommendation) {
      return null
    }
    return lead.review_snapshot.recommendation === "qualified" ? "VA recommendation: Qualified" : "VA recommendation: Not qualified"
  }, [lead.review_snapshot])

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
          email,
          note,
          checklist,
          emailType: emailType || undefined,
          gender: gender || undefined,
          hasCoaching: typeof hasCoaching === "boolean" ? hasCoaching : undefined,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload.error || "Action failed.")
      }
      if (action === "save") {
        const nextSavedFields: SavedFields = {
          firstName: resolveSavedFirstName(lead, firstName),
          email: resolveSavedEmail(email),
          emailType,
          gender,
          hasCoaching,
          note: note.trim(),
        }
        setSavedFields(nextSavedFields)
        setFirstName(nextSavedFields.firstName)
        setEmail(nextSavedFields.email)
        setNote(nextSavedFields.note)
        setStatus("Saved. This lead stays in Review Queue until you mark Qualified or Not qualified.")
      } else {
        setStatus("Decision saved.")
      }
      setShowNameActions(false)
      setShowEmailActions(false)
      setShowEmailTypeActions(false)
      setShowGenderActions(false)
      setShowCoachingActions(false)
      setShowNoteActions(false)
      if (action !== "save") {
        startTransition(() => {
          router.refresh()
        })
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Action failed.")
    } finally {
      setPending(false)
    }
  }

  function cancelNameEdit() {
    setFirstName(savedFields.firstName)
    setShowNameActions(false)
    setStatus("")
  }

  function cancelEmailEdit() {
    setEmail(savedFields.email)
    setShowEmailActions(false)
    setStatus("")
  }

  function cancelNoteEdit() {
    setNote(savedFields.note)
    setShowNoteActions(false)
    setStatus("")
  }

  function cancelEmailTypeEdit() {
    setEmailType(savedFields.emailType)
    setShowEmailTypeActions(false)
    setStatus("")
  }

  function cancelGenderEdit() {
    setGender(savedFields.gender)
    setShowGenderActions(false)
    setStatus("")
  }

  function cancelCoachingEdit() {
    setHasCoaching(savedFields.hasCoaching)
    setShowCoachingActions(false)
    setStatus("")
  }

  function updateChecklist(key: keyof LeadChecklist, value: ChecklistResult) {
    setChecklist((current) => ({
      ...current,
      [key]: current[key] === value ? null : value,
    }))
  }

  if (mode === "reviewer") {
    return (
      <article className="panel overflow-hidden p-0">
        <div className="grid gap-3 px-4 py-4 md:grid-cols-[1.2fr_1.35fr_0.7fr_0.75fr_0.95fr_auto] md:items-center">
          <div className="min-w-0">
            <a
              href={createInstagramUrl(lead.instagram_handle)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex max-w-full items-center gap-1 truncate text-sm font-semibold text-ink underline-offset-2 hover:underline"
            >
              <span className="truncate">@{lead.instagram_handle}</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            </a>
            <p className="mt-1 truncate text-xs text-slateWarm">{lead.full_name || "No full name"}</p>
          </div>

          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{email || "No email"}</p>
            <p className="mt-1 truncate text-xs text-slateWarm">
              {emailType ? (emailType === "management" ? "Management" : "Personal") : "Type not chosen"}
              {" · "}
              {gender ? (gender === "male" ? "Male" : "Female") : "Gender not chosen"}
              {" · "}
              {hasCoaching === null ? "Coaching not chosen" : hasCoaching ? "Has coaching" : "No coaching"}
            </p>
          </div>

          <div>
            <p className="text-sm font-medium text-ink">{compactNumber(lead.follower_count)}</p>
            <p className="mt-1 text-xs text-slateWarm">Followers</p>
          </div>

          <div>
            <p className="text-sm font-medium text-ink">{formatDayLabel(lead.batch_date)}</p>
            <p className="mt-1 text-xs text-slateWarm">Batch date</p>
          </div>

          <div>
            <span className="inline-flex rounded-full border border-white/[0.08] px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-slateWarm">
              {statusLabel(lead)}
            </span>
          </div>

          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={() => setExpanded((current) => !current)}
              className="ghost-button flex h-9 w-9 items-center justify-center p-0"
              aria-label={expanded ? "Collapse lead" : "Expand lead"}
            >
              <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
            </button>
          </div>
        </div>

        {expanded ? (
          <div className="border-t border-white/[0.08] px-4 py-4">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]">
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="panel-muted p-3">
                    <p className="section-label">Lead details</p>
                    <p className="mt-2 text-sm text-ink">Followers {compactNumber(lead.follower_count)}</p>
                    <p className="mt-2 text-xs text-slateWarm">Source {lead.source_detail || lead.source || "—"}</p>
                    <p className="mt-1 text-xs text-slateWarm">{decisionTimestampLabel(lead, mode)}</p>
                  </div>
                  <div className="panel-muted p-3">
                    <p className="section-label">Bio</p>
                    <p className="mt-2 line-clamp-6 whitespace-pre-wrap text-sm leading-6 text-white/72">{lead.bio || "No bio available."}</p>
                  </div>
                </div>

                <div className="panel-muted p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="section-label">Qualification checklist</p>
                      <p className="mt-2 text-sm text-slateWarm">Base this on the creator&apos;s last 10 posts.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowChecklistHelp((current) => !current)}
                      className="ghost-button flex items-center gap-2 px-3 py-2 text-xs"
                    >
                      <CircleHelp className="h-4 w-4" />
                      What counts?
                    </button>
                  </div>
                  {showChecklistHelp ? (
                    <div className="mt-4 rounded-2xl border border-white/[0.06] bg-black/10 p-4 text-sm text-slateWarm">
                      <p className="font-medium text-ink">Use these three checks before marking Qualified.</p>
                      <div className="mt-3 space-y-3">
                        <p>
                          <span className="font-medium text-ink">Authority / Credibility:</span> At least two recent posts should show a real reason to trust
                          them: useful coaching, tips that clearly work, a strong physique while giving advice, or clear hands-on expertise.
                        </p>
                        <p>
                          <span className="font-medium text-ink">Personality / Relatability:</span> At least two recent posts should show opinion, humor,
                          style, or something personal enough that they feel human, likable, and not like a helpful robot.
                        </p>
                        <p>
                          <span className="font-medium text-ink">Engagement / Visceral Reaction:</span> Look for talking, a strong point of view, or content
                          that makes people react. The best creators feel bold, memorable, and can be strongly polarizing in a way that pulls people in.
                        </p>
                        <p>
                          <span className="font-medium text-ink">Quick gut check:</span> If they are just posting tricks, flips, or generic lifestyle content
                          without trust, personality, or reaction, that is a fail. We are looking for someone who could build a real cult-following style of
                          audience connection, not just someone who posts.
                        </p>
                      </div>
                    </div>
                  ) : null}
                  <div className="mt-4 space-y-3">
                    {CHECKLIST_ITEMS.map((item) => (
                      <div key={item.key} className="grid gap-3 rounded-2xl border border-white/[0.06] bg-black/10 p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                        <div className="min-w-0">
                          <p className="font-medium text-ink">{item.label}</p>
                          <p className="mt-1 text-xs text-slateWarm">{item.help}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => updateChecklist(item.key, "pass")}
                            className={[
                              "rounded-full px-3 py-2 text-xs font-semibold",
                              checklist[item.key] === "pass" ? "bg-emerald-500/15 text-emerald-300" : "bg-white/[0.04] text-slateWarm",
                            ].join(" ")}
                          >
                            Pass
                          </button>
                          <button
                            type="button"
                            onClick={() => updateChecklist(item.key, "fail")}
                            className={[
                              "rounded-full px-3 py-2 text-xs font-semibold",
                              checklist[item.key] === "fail" ? "bg-rose-500/15 text-rose-300" : "bg-white/[0.04] text-slateWarm",
                            ].join(" ")}
                          >
                            Fail
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="panel-muted p-4">
                  <p className="section-label">Email</p>
                  <div className="mt-3 space-y-3">
                    <input
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      onFocus={() => setShowEmailActions(true)}
                      placeholder="Email"
                      className="w-full"
                      type="email"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                    <p className="text-xs text-slateWarm">Replace this if the VA finds a better email. The saved value will be used in Smartlead exports.</p>
                    {(showEmailActions || emailDirty) ? (
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => runAction("save")} disabled={pending || !emailDirty || !email.trim()} className="gold-button px-3 py-2 text-xs">
                          Save email
                        </button>
                        <button type="button" onClick={cancelEmailEdit} disabled={pending} className="ghost-button px-3 py-2 text-xs">
                          Cancel
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="panel-muted p-4">
                  <p className="section-label">Email type</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEmailType("personal")
                        setShowEmailTypeActions(true)
                      }}
                      className={[
                        "rounded-full px-3 py-2 text-xs font-semibold",
                        emailType === "personal" ? "bg-[#c9a96e]/15 text-[#d4b87d]" : "bg-white/[0.04] text-slateWarm",
                      ].join(" ")}
                    >
                      Personal
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEmailType("management")
                        setShowEmailTypeActions(true)
                      }}
                      className={[
                        "rounded-full px-3 py-2 text-xs font-semibold",
                        emailType === "management" ? "bg-[#c9a96e]/15 text-[#d4b87d]" : "bg-white/[0.04] text-slateWarm",
                      ].join(" ")}
                    >
                      Management
                    </button>
                  </div>
                  {(showEmailTypeActions || emailTypeDirty) ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => runAction("save")}
                        disabled={pending || !emailTypeDirty}
                        className="gold-button px-3 py-2 text-xs"
                      >
                        Save type
                      </button>
                      <button type="button" onClick={cancelEmailTypeEdit} disabled={pending} className="ghost-button px-3 py-2 text-xs">
                        Cancel
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="panel-muted p-4">
                  <p className="section-label">Gender</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setGender("male")
                        setShowGenderActions(true)
                      }}
                      className={[
                        "rounded-full px-3 py-2 text-xs font-semibold",
                        gender === "male" ? "bg-[#c9a96e]/15 text-[#d4b87d]" : "bg-white/[0.04] text-slateWarm",
                      ].join(" ")}
                    >
                      Male
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setGender("female")
                        setShowGenderActions(true)
                      }}
                      className={[
                        "rounded-full px-3 py-2 text-xs font-semibold",
                        gender === "female" ? "bg-[#c9a96e]/15 text-[#d4b87d]" : "bg-white/[0.04] text-slateWarm",
                      ].join(" ")}
                    >
                      Female
                    </button>
                  </div>
                  {(showGenderActions || genderDirty) ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => runAction("save")}
                        disabled={pending || !genderDirty}
                        className="gold-button px-3 py-2 text-xs"
                      >
                        Save gender
                      </button>
                      <button type="button" onClick={cancelGenderEdit} disabled={pending} className="ghost-button px-3 py-2 text-xs">
                        Cancel
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="panel-muted p-4">
                  <p className="section-label">Coaching</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setHasCoaching(true)
                        setShowCoachingActions(true)
                      }}
                      className={[
                        "rounded-full px-3 py-2 text-xs font-semibold",
                        hasCoaching === true ? "bg-[#c9a96e]/15 text-[#d4b87d]" : "bg-white/[0.04] text-slateWarm",
                      ].join(" ")}
                    >
                      Has coaching
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setHasCoaching(false)
                        setShowCoachingActions(true)
                      }}
                      className={[
                        "rounded-full px-3 py-2 text-xs font-semibold",
                        hasCoaching === false ? "bg-[#c9a96e]/15 text-[#d4b87d]" : "bg-white/[0.04] text-slateWarm",
                      ].join(" ")}
                    >
                      No coaching
                    </button>
                  </div>
                  {(showCoachingActions || coachingDirty) ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => runAction("save")}
                        disabled={pending || !coachingDirty}
                        className="gold-button px-3 py-2 text-xs"
                      >
                        Save coaching
                      </button>
                      <button type="button" onClick={cancelCoachingEdit} disabled={pending} className="ghost-button px-3 py-2 text-xs">
                        Cancel
                      </button>
                    </div>
                  ) : null}
                </div>

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
                  <p className="section-label">VA note</p>
                  <div className="mt-3 space-y-3">
                    <textarea
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      onFocus={() => setShowNoteActions(true)}
                      rows={4}
                      className="w-full"
                      placeholder="Leave context for Alex if needed"
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

                <div className="panel-muted p-4">
                  <p className="section-label">Decision</p>
                  <p className="mt-3 text-xs text-slateWarm">
                    Qualified unlocks only when all 3 checklist items pass, the email type is chosen, gender is chosen, and coaching is marked.
                  </p>
                  <p className="mt-1 text-xs text-slateWarm">Not qualified requires a note. Use it for broader disqualifiers like non-English or content that is too lifestyle-focused.</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => runAction("qualified")}
                      disabled={pending || !checklistAllPass || !emailType || !gender || hasCoaching === null}
                      className="gold-button px-3 py-2 text-xs"
                    >
                      Qualified
                    </button>
                    <button
                      type="button"
                      onClick={() => runAction("not_qualified")}
                      disabled={pending || !note.trim()}
                      className="warning-button px-3 py-2 text-xs"
                    >
                      Not qualified
                    </button>
                  </div>
                  {status ? <p className="mt-4 text-sm text-slateWarm">{status}</p> : null}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </article>
    )
  }

  return (
    <article className="panel p-5">
      <div className="grid gap-5 xl:grid-cols-[1.05fr_1fr_0.9fr]">
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
                {statusLabel(lead)}
              </span>
            </div>
            <p className="text-sm text-white/70">{lead.full_name || "No full name"}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="panel-muted p-3">
              <p className="section-label">Email</p>
              <p className="mt-2 break-all text-sm font-medium text-ink">{lead.email}</p>
              <p className="mt-2 text-xs text-slateWarm">{formatEmailTypeLabel(resolvedLeadEmailType(lead))} · {lead.email_source || "Unknown source"}</p>
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

          {mode === "owner" && lead.review_snapshot ? (
            <div className="panel-muted p-4">
              <p className="section-label">VA review</p>
              <p className="mt-2 text-sm font-medium text-ink">{reviewerDecisionSummary || "VA recommendation saved"}</p>
              {lead.review_snapshot.va_note ? <p className="mt-2 text-sm text-white/72">VA note: {lead.review_snapshot.va_note}</p> : null}
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/[0.06] bg-black/10 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slateWarm">Email type</p>
                  <p className="mt-1 text-sm text-ink">{formatEmailTypeLabel(lead.review_snapshot.email_type)}</p>
                </div>
                <div className="rounded-2xl border border-white/[0.06] bg-black/10 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slateWarm">Gender</p>
                  <p className="mt-1 text-sm text-ink">{formatGenderLabel(lead.review_snapshot.gender)}</p>
                </div>
                <div className="rounded-2xl border border-white/[0.06] bg-black/10 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slateWarm">Coaching</p>
                  <p className="mt-1 text-sm text-ink">{formatCoachingLabel(lead.review_snapshot.has_coaching)}</p>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {checklistSummary(lead.review_snapshot.checklist).map((item) => (
                  <div key={item.key} className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-black/10 px-3 py-2">
                    <p className="text-sm text-white/75">{item.label}</p>
                    <span
                      className={[
                        "rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]",
                        item.value === "pass"
                          ? "bg-emerald-500/10 text-emerald-300"
                          : item.value === "fail"
                            ? "bg-rose-500/10 text-rose-300"
                            : "bg-white/[0.04] text-slateWarm",
                      ].join(" ")}
                    >
                      {item.value || "not marked"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
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
            <p className="section-label">Owner note</p>
            <div className="mt-3 space-y-3">
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                onFocus={() => setShowNoteActions(true)}
                rows={5}
                className="w-full"
                placeholder="Leave a note for the record"
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
            <p className="section-label">Owner decision</p>
            <p className="mt-3 text-xs text-slateWarm">{decisionTimestampLabel(lead, mode)}</p>
            {reviewerDecisionSummary ? <p className="mt-2 text-sm text-ink">{reviewerDecisionSummary}</p> : null}
            {lead.sent_to_smartlead ? <p className="mt-2 text-sm text-slateWarm">This lead has already been sent to Smartlead, so owner actions are locked.</p> : null}
            <div className="mt-4 flex flex-wrap gap-2">
              {ownerCanApprove ? (
                <button type="button" onClick={() => runAction("owner_approve")} disabled={pending} className="gold-button px-3 py-2 text-xs">
                  {lead.review_status === "rejected" ? "Qualify instead" : "Qualify"}
                </button>
              ) : null}
              {ownerCanReject ? (
                <button type="button" onClick={() => runAction("reject")} disabled={pending} className="danger-button px-3 py-2 text-xs">
                  {lead.review_status === "approved" || lead.review_status === "exported_pending_confirmation" ? "Disqualify instead" : "Disqualify"}
                </button>
              ) : null}
              {ownerCanReopen ? (
                <button type="button" onClick={() => runAction("reopen")} disabled={pending} className="ghost-button px-3 py-2 text-xs">
                Reopen
                </button>
              ) : null}
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
