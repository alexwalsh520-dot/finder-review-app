import "server-only"

import { randomUUID } from "crypto"

import { createAdminClient } from "@/lib/supabase-admin"
import { recordReviewerHistoryCacheItem } from "@/lib/reviewer-history-cache"
import { getRequireOwnerApproval, listReadyForSmartleadRows } from "@/lib/data"
import type {
  AppRole,
  LeadCoachingFilter,
  ChecklistResult,
  LeadChecklist,
  LeadGender,
  LeadRow,
  ReviewStatus,
  ReviewerDecision,
  SessionPayload,
} from "@/lib/types"

const REVIEW_SELECT =
  "id,first_name,first_name_verified,full_name,email,instagram_handle,status,review_status,review_notes,reviewed_at,reviewed_by,sent_to_smartlead,smartlead_sent_at,batch_date"
const TOP_UP_APP_SETTING_KEY = "finder_review_top_up_request"
const DAILY_EMAIL_TARGET = 150
const DAILY_QUALIFIED_TARGET = 100

type ReviewAction =
  | "save"
  | "qualified"
  | "not_qualified"
  | "owner_approve"
  | "reject"
  | "reopen"
  | "va_approve"
  | "flag"

type ChecklistInput = {
  authority?: ChecklistResult
  personality?: ChecklistResult
  engagement?: ChecklistResult
}

type EmailTypeInput = "personal" | "management"
type GenderInput = LeadGender
type HasCoachingInput = boolean
type ExportFiltersInput = {
  gender?: LeadGender | null
  coaching?: LeadCoachingFilter | null
}
type ExportColumnKey =
  | "first_name"
  | "email"
  | "instagram_username"
  | "full_name"
  | "gender"
  | "coaching"
  | "email_type"
  | "source"

type ExportSelectionInput =
  | string[]
  | {
      leadIds?: string[]
      filters?: ExportFiltersInput | null
      columns?: ExportColumnKey[] | null
    }

function requireRole(session: SessionPayload, role: AppRole) {
  if (session.role !== role) {
    throw new Error("You do not have permission to do that.")
  }
}

function cleanText(value: string | null | undefined): string {
  return (value || "").trim()
}

function normalizeEmail(value: string | null | undefined): string {
  return cleanText(value).toLowerCase()
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function todayBusinessDate(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Makassar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date())
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${lookup.year}-${lookup.month}-${lookup.day}`
}

function normalizeChecklist(input: ChecklistInput | undefined): LeadChecklist {
  const next: LeadChecklist = {
    authority: null,
    personality: null,
    engagement: null,
  }
  for (const key of ["authority", "personality", "engagement"] as const) {
    const value = input?.[key]
    next[key] = value === "pass" || value === "fail" ? value : null
  }
  return next
}

function checklistAllPass(checklist: LeadChecklist) {
  return checklist.authority === "pass" && checklist.personality === "pass" && checklist.engagement === "pass"
}

function countsAsNetNewEmail(row: { email?: string | null; sent_to_smartlead?: boolean | null; reviewed_at?: string | null }) {
  const email = (row.email || "").trim()
  if (!email) {
    return false
  }
  if (row.sent_to_smartlead && !row.reviewed_at) {
    return false
  }
  return true
}

function countDistinctNetNewEmails(rows: Array<{ email?: string | null; sent_to_smartlead?: boolean | null; reviewed_at?: string | null }>) {
  const seen = new Set<string>()
  for (const row of rows) {
    const email = (row.email || "").trim().toLowerCase()
    if (!countsAsNetNewEmail(row) || seen.has(email)) {
      continue
    }
    seen.add(email)
  }
  return seen.size
}

function countDistinctReviewedEmails(rows: Array<{ email?: string | null; reviewed_at?: string | null }>) {
  const seen = new Set<string>()
  for (const row of rows) {
    const email = (row.email || "").trim().toLowerCase()
    if (!email || !row.reviewed_at || seen.has(email)) {
      continue
    }
    seen.add(email)
  }
  return seen.size
}

function fallbackFirstName(current: LeadRow, proposed: string): string {
  const cleaned = cleanText(proposed)
  if (cleaned) {
    return cleaned
  }
  if (current.first_name?.trim()) {
    return current.first_name.trim()
  }
  const fromFullName = cleanText(current.full_name).split(/\s+/)[0]
  return fromFullName || ""
}

async function loadLead(leadId: string): Promise<LeadRow> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.from("leads").select(REVIEW_SELECT).eq("id", leadId).maybeSingle()
  if (error || !data) {
    throw new Error(error?.message || "Lead not found.")
  }
  return data as LeadRow
}

async function insertReviewEvent(
  leadId: string,
  session: SessionPayload,
  action: string,
  payload: Record<string, unknown>,
  createdAt?: string,
) {
  const supabase = createAdminClient()
  const { error } = await supabase.from("lead_review_events").insert({
    lead_id: leadId,
    actor_role: session.role,
    actor_identifier: session.email,
    action,
    payload,
    created_at: createdAt || new Date().toISOString(),
  })
  if (error) {
    throw new Error(error.message)
  }
}

async function rollbackLeadUpdate(
  leadId: string,
  previous: Pick<
    LeadRow,
    "first_name" | "email" | "status" | "review_notes" | "review_status" | "reviewed_at" | "reviewed_by" | "first_name_verified"
  >,
) {
  const supabase = createAdminClient()
  const { error } = await supabase.from("leads").update(previous).eq("id", leadId)
  if (error) {
    throw new Error(error.message)
  }
}

export async function applyReviewAction(
  leadId: string,
  session: SessionPayload,
  input: {
    action: ReviewAction
    firstName?: string
    email?: string
    note?: string
    checklist?: ChecklistInput
    emailType?: EmailTypeInput
    gender?: GenderInput
    hasCoaching?: HasCoachingInput
  },
) {
  const supabase = createAdminClient()
  const lead = await loadLead(leadId)
  const note = cleanText(input.note)
  const firstName = fallbackFirstName(lead, input.firstName || "")
  const nextEmail = input.email === undefined ? normalizeEmail(lead.email) : normalizeEmail(input.email)
  const checklist = normalizeChecklist(input.checklist)
  const now = new Date().toISOString()
  const patch: Record<string, string | boolean | null> = {
    first_name: firstName || null,
    email: nextEmail || null,
  }
  if (!nextEmail) {
    throw new Error("Email is required.")
  }
  if (!isValidEmail(nextEmail)) {
    throw new Error("Enter a valid email before saving.")
  }
  let eventToInsert: { action: string; payload: Record<string, unknown> } | null = null
  if (input.emailType === "personal" || input.emailType === "management") {
    patch.status = input.emailType === "management" ? "mgmt_email" : "email_ready"
  }

  if (input.action === "save") {
    patch.review_notes = session.role === "reviewer" ? note || null : lead.review_notes
    if (note || input.emailType || input.gender || typeof input.hasCoaching === "boolean" || firstName || nextEmail !== normalizeEmail(lead.email)) {
      eventToInsert = {
        action: "save",
        payload: {
          note: note || null,
          email: nextEmail,
          previous_email: normalizeEmail(lead.email) || null,
          email_type: input.emailType || null,
          gender: input.gender || null,
          has_coaching: input.hasCoaching ?? null,
          first_name: firstName || null,
          previous_status: lead.review_status,
        },
      }
    }
  } else if (input.action === "qualified" || input.action === "va_approve") {
    requireRole(session, "reviewer")
    if (!checklistAllPass(checklist)) {
      throw new Error("All three qualification checks must pass before a lead can be marked qualified.")
    }
    if (input.emailType !== "personal" && input.emailType !== "management") {
      throw new Error("Choose Personal or Management before marking a lead qualified.")
    }
    if (input.gender !== "male" && input.gender !== "female") {
      throw new Error("Choose Male or Female before marking a lead qualified.")
    }
    if (typeof input.hasCoaching !== "boolean") {
      throw new Error("Choose Has coaching or No coaching before marking a lead qualified.")
    }
    const requireOwnerApproval = await getRequireOwnerApproval()
    patch.review_status = requireOwnerApproval ? "va_approved" : "approved"
    patch.review_notes = note || null
    patch.reviewed_at = now
    patch.reviewed_by = session.email
    patch.first_name_verified = true
    eventToInsert = {
      action: "qualified",
      payload: {
        recommendation: "qualified" satisfies ReviewerDecision,
        checklist,
        note: note || null,
        email: nextEmail,
        previous_email: normalizeEmail(lead.email) || null,
        email_type: input.emailType || null,
        gender: input.gender || null,
        has_coaching: input.hasCoaching ?? null,
        first_name: firstName || null,
        previous_status: lead.review_status,
        next_status: patch.review_status,
      },
    }
  } else if (input.action === "not_qualified" || input.action === "flag") {
    requireRole(session, "reviewer")
    if (!note) {
      throw new Error("Add a short note before marking a lead not qualified.")
    }
    patch.review_status = "flagged"
    patch.review_notes = note
    patch.reviewed_at = now
    patch.reviewed_by = session.email
    patch.first_name_verified = false
    eventToInsert = {
      action: "not_qualified",
      payload: {
        recommendation: "not_qualified" satisfies ReviewerDecision,
        checklist,
        note,
        email: nextEmail,
        previous_email: normalizeEmail(lead.email) || null,
        email_type: input.emailType || null,
        gender: input.gender || null,
        has_coaching: input.hasCoaching ?? null,
        first_name: firstName || null,
        previous_status: lead.review_status,
        next_status: patch.review_status,
      },
    }
  } else if (input.action === "owner_approve") {
    requireRole(session, "owner")
    patch.review_status = "approved"
    patch.review_notes = lead.review_notes
    patch.reviewed_at = now
    patch.reviewed_by = session.email
    patch.first_name_verified = true
    eventToInsert = {
      action: input.action,
      payload: {
        note: note || null,
        email: nextEmail,
        previous_email: normalizeEmail(lead.email) || null,
        email_type: input.emailType || null,
        gender: input.gender || null,
        has_coaching: input.hasCoaching ?? null,
        first_name: firstName || null,
        previous_status: lead.review_status,
        next_status: patch.review_status,
      },
    }
  } else if (input.action === "reject") {
    requireRole(session, "owner")
    patch.review_status = "rejected"
    patch.review_notes = lead.review_notes
    patch.reviewed_at = now
    patch.reviewed_by = session.email
    patch.first_name_verified = false
    eventToInsert = {
      action: input.action,
      payload: {
        note,
        email: nextEmail,
        previous_email: normalizeEmail(lead.email) || null,
        email_type: input.emailType || null,
        gender: input.gender || null,
        has_coaching: input.hasCoaching ?? null,
        first_name: firstName || null,
        previous_status: lead.review_status,
        next_status: patch.review_status,
      },
    }
  } else if (input.action === "reopen") {
    requireRole(session, "owner")
    patch.review_status = "unreviewed"
    patch.review_notes = lead.review_notes
    patch.reviewed_at = null
    patch.reviewed_by = null
    patch.first_name_verified = false
    eventToInsert = {
      action: input.action,
      payload: {
        note: note || null,
        email: nextEmail,
        previous_email: normalizeEmail(lead.email) || null,
        email_type: input.emailType || null,
        gender: input.gender || null,
        has_coaching: input.hasCoaching ?? null,
        first_name: firstName || null,
        previous_status: lead.review_status,
        next_status: patch.review_status,
      },
    }
  }

  const { data: updatedRows, error } = await supabase
    .from("leads")
    .update(patch)
    .eq("id", leadId)
    .eq("review_status", lead.review_status)
    .select("id")

  if (error) {
    throw new Error(error.message)
  }
  if (!updatedRows?.length) {
    throw new Error("This lead changed while you were editing it. Refresh and try again.")
  }
  if (eventToInsert) {
    try {
      await insertReviewEvent(leadId, session, eventToInsert.action, eventToInsert.payload, now)
      if (
        session.role === "reviewer" &&
        (eventToInsert.action === "save" || eventToInsert.action === "qualified" || eventToInsert.action === "not_qualified")
      ) {
        try {
          await recordReviewerHistoryCacheItem(session.email, {
            lead_id: leadId,
            created_at: now,
            action: eventToInsert.action,
          })
        } catch (cacheError) {
          console.error("Failed to update reviewer history cache", cacheError)
        }
      }
    } catch (error) {
      await rollbackLeadUpdate(leadId, {
        first_name: lead.first_name,
        email: lead.email,
        status: lead.status,
        review_notes: lead.review_notes,
        review_status: lead.review_status,
        reviewed_at: lead.reviewed_at,
        reviewed_by: lead.reviewed_by,
        first_name_verified: lead.first_name_verified,
      })
      throw error
    }
  }
}

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, "\"\"")}"`
  }
  return value
}

function buildExportSegmentLabel(filters: ExportFiltersInput | null): string {
  if (!filters) {
    return ""
  }
  const parts: string[] = []
  if (filters.gender) {
    parts.push(filters.gender)
  }
  if (filters.coaching === "has") {
    parts.push("has-coaching")
  } else if (filters.coaching === "none") {
    parts.push("no-coaching")
  }
  return parts.length ? `_${parts.join("_")}` : ""
}

const REQUIRED_EXPORT_COLUMNS: ExportColumnKey[] = ["first_name", "email", "instagram_username"]
const OPTIONAL_EXPORT_COLUMNS: ExportColumnKey[] = ["full_name", "gender", "coaching", "email_type", "source"]
const EXPORT_COLUMN_ORDER: ExportColumnKey[] = [...REQUIRED_EXPORT_COLUMNS, ...OPTIONAL_EXPORT_COLUMNS]

function normalizeExportColumns(columns: ExportColumnKey[] | null | undefined): ExportColumnKey[] {
  const selected = new Set<ExportColumnKey>(REQUIRED_EXPORT_COLUMNS)
  for (const column of columns || []) {
    if (OPTIONAL_EXPORT_COLUMNS.includes(column)) {
      selected.add(column)
    }
  }
  return EXPORT_COLUMN_ORDER.filter((column) => selected.has(column))
}

function readExportGender(row: LeadRow): string {
  return row.review_snapshot?.gender || row.gender || ""
}

function readExportCoaching(row: LeadRow): string {
  if (row.review_snapshot?.has_coaching === true) {
    return "has_coaching"
  }
  if (row.review_snapshot?.has_coaching === false) {
    return "no_coaching"
  }
  return ""
}

function readExportEmailType(row: LeadRow): string {
  if (row.review_snapshot?.email_type) {
    return row.review_snapshot.email_type
  }
  if (row.status === "mgmt_email") {
    return "management"
  }
  if (row.status === "email_ready") {
    return "personal"
  }
  return ""
}

function readExportColumnValue(row: LeadRow, column: ExportColumnKey): string {
  if (column === "first_name") {
    return fallbackFirstName(row, "")
  }
  if (column === "email") {
    return row.email || ""
  }
  if (column === "instagram_username") {
    return (row.instagram_handle || "").replace(/^@/, "")
  }
  if (column === "full_name") {
    return row.full_name || ""
  }
  if (column === "gender") {
    return readExportGender(row)
  }
  if (column === "coaching") {
    return readExportCoaching(row)
  }
  if (column === "email_type") {
    return readExportEmailType(row)
  }
  return row.source_detail || row.source || ""
}

export async function exportApprovedLeads(selection: ExportSelectionInput, session: SessionPayload) {
  requireRole(session, "owner")
  const leadIds = Array.isArray(selection) ? selection : selection.leadIds || []
  const filters = Array.isArray(selection) ? null : selection.filters || null
  const columns = normalizeExportColumns(Array.isArray(selection) ? null : selection.columns)

  if (!leadIds.length && !filters) {
    throw new Error("Choose at least one lead to export.")
  }

  const readyRows = await listReadyForSmartleadRows({
    gender: filters?.gender || undefined,
    coaching: filters?.coaching || undefined,
  })
  const readyRowsById = new Map(readyRows.map((lead) => [lead.id, lead]))
  const selectedIds = leadIds.length ? leadIds : readyRows.map((lead) => lead.id)

  if (!selectedIds.length) {
    throw new Error("There are no approved unsent leads in this segment.")
  }
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("leads")
    .select("id,first_name,full_name,email,instagram_handle,status,source,source_detail,review_status,sent_to_smartlead,smartlead_sent_at")
    .in("id", selectedIds)
    .eq("review_status", "approved")
    .neq("sent_to_smartlead", true)
    .not("email", "is", null)
    .neq("email", "")
    .in("status", ["email_ready", "mgmt_email"])

  if (error) {
    throw new Error(error.message)
  }
  const rows = ((data as LeadRow[] | null) || []) as LeadRow[]
  if (!rows.length) {
    throw new Error("There are no approved unsent leads in this selection.")
  }
  const { data: reviewEvents, error: reviewEventError } = await supabase
    .from("lead_review_events")
    .select("lead_id,action,created_at")
    .in("lead_id", rows.map((row) => row.id))
    .in("action", ["owner_approve", "reject", "reopen"])
    .order("created_at", { ascending: false })
  if (reviewEventError) {
    throw new Error(reviewEventError.message)
  }
  const blockedLeadIds = new Set<string>()
  const resolvedLeadIds = new Set<string>()
  for (const event of (((reviewEvents as Array<{ lead_id: string; action: string; created_at: string }> | null) || []))) {
    if (!event.lead_id || resolvedLeadIds.has(event.lead_id)) {
      continue
    }
    if (event.action === "reject") {
      blockedLeadIds.add(event.lead_id)
      resolvedLeadIds.add(event.lead_id)
      continue
    }
    if (event.action === "owner_approve" || event.action === "reopen") {
      resolvedLeadIds.add(event.lead_id)
    }
  }
  const rowById = new Map(rows.map((row) => [row.id, row]))
  const orderedRows = selectedIds
    .map((id) => {
      const row = rowById.get(id)
      const readyRow = readyRowsById.get(id)
      return row && readyRow
        ? ({
            ...row,
            review_snapshot: readyRow.review_snapshot || null,
            gender: readyRow.gender || row.gender || null,
          } as LeadRow)
        : null
    })
    .filter((row): row is LeadRow => Boolean(row))
  const eligibleRows = orderedRows.filter((row) => !blockedLeadIds.has(row.id))
  if (!eligibleRows.length) {
    throw new Error("There are no qualified unsent leads in this selection.")
  }

  const exportBatchId = randomUUID()
  const exportedAt = new Date().toISOString()
  const ids = eligibleRows.map((row) => row.id)
  const { data: updatedRows, error: updateError } = await supabase
    .from("leads")
    .update({
      review_status: "exported_pending_confirmation",
      exported_at: exportedAt,
      export_batch_id: exportBatchId,
    })
    .in("id", ids)
    .eq("review_status", "approved")
    .neq("sent_to_smartlead", true)
    .in("status", ["email_ready", "mgmt_email"])
    .select("id")
  if (updateError) {
    throw new Error(updateError.message)
  }
  if ((updatedRows || []).length !== ids.length) {
    throw new Error("Some leads changed before export completed. Refresh and try again.")
  }
  const { error: eventError } = await supabase.from("lead_review_events").insert(
    eligibleRows.map((row) => ({
      lead_id: row.id,
      actor_role: session.role,
      actor_identifier: session.email,
      action: "export",
      payload: {
        export_batch_id: exportBatchId,
        exported_at: exportedAt,
        email: row.email,
        instagram_handle: row.instagram_handle,
      },
    })),
  )
  if (eventError) {
    await supabase
      .from("leads")
      .update({
        review_status: "approved",
        exported_at: null,
        export_batch_id: null,
      })
      .in("id", ids)
      .eq("export_batch_id", exportBatchId)
    throw new Error(eventError.message)
  }

  const header = columns
  const lines = [
    header.join(","),
    ...eligibleRows.map((row) => columns.map((column) => escapeCsv(readExportColumnValue(row, column))).join(",")),
  ]
  return {
    batchId: exportBatchId,
    filename: `finder_smartlead_export${buildExportSegmentLabel(filters)}_${exportBatchId}.csv`,
    csv: `${lines.join("\n")}\n`,
  }
}

export async function updateRequireOwnerApproval(value: boolean, session: SessionPayload) {
  requireRole(session, "owner")
  const supabase = createAdminClient()
  const { error } = await supabase.from("app_settings").upsert({
    key: "require_owner_approval",
    value,
    updated_at: new Date().toISOString(),
  })
  if (error) {
    throw new Error(error.message)
  }
  if (!value) {
    const { error: autoApproveError } = await supabase.from("leads").update({ review_status: "approved" }).eq("review_status", "va_approved")
    if (autoApproveError) {
      throw new Error(autoApproveError.message)
    }
  }
}

export async function requestDailyTopUp(session: SessionPayload) {
  if (!["owner", "reviewer"].includes(session.role)) {
    throw new Error("You do not have permission to do that.")
  }
  const supabase = createAdminClient()
  const day = todayBusinessDate()
  const [{ data: cronJob, error: cronError }, { data: existingSetting, error: settingError }] = await Promise.all([
    supabase
      .from("cron_jobs")
      .select("id,last_status,last_run_at")
      .eq("id", "finder-v1-daily-run")
      .maybeSingle(),
    supabase
      .from("app_settings")
      .select("value")
      .eq("key", TOP_UP_APP_SETTING_KEY)
      .maybeSingle(),
  ])
  if (cronError) {
    throw new Error(cronError.message)
  }
  if (settingError) {
    throw new Error(settingError.message)
  }

  const { count: todayQualifiedCount, error: qualifiedError } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("batch_date", day)
    .eq("source", "finder_v1")
    .not("email", "is", null)
    .neq("email", "")
    .in("status", ["email_ready", "mgmt_email"])
    .not("reviewed_at", "is", null)
    .or("review_status.eq.va_approved,review_status.eq.approved,review_status.eq.exported_pending_confirmation,sent_to_smartlead.eq.true")
  if (qualifiedError) {
    throw new Error(qualifiedError.message)
  }

  if ((todayQualifiedCount || 0) >= DAILY_QUALIFIED_TARGET) {
    throw new Error("Today already has 100 qualified leads.")
  }

  const existingValue = (existingSetting?.value || {}) as Record<string, unknown>
  if (
    existingValue.day === day &&
    (existingValue.status === "requested" || existingValue.status === "running")
  ) {
    throw new Error("A top-up run is already active for today.")
  }

  if (cronJob?.last_status === "running") {
    throw new Error("The scraper is already running.")
  }

  const { data: todayRows, error: emailError } = await supabase
    .from("leads")
    .select("id,email,sent_to_smartlead,reviewed_at,review_status")
    .eq("batch_date", day)
    .eq("source", "finder_v1")
    .not("email", "is", null)
    .neq("email", "")
    .in("status", ["email_ready", "mgmt_email"])
  if (emailError) {
    throw new Error(emailError.message)
  }

  const rows =
    (((todayRows as Array<{
      id: string
      email: string | null
      sent_to_smartlead: boolean | null
      reviewed_at: string | null
      review_status: string | null
    }> | null) || []) as Array<{
      id: string
      email: string | null
      sent_to_smartlead: boolean | null
      reviewed_at: string | null
      review_status: string | null
    }>)
  const todayEmailCount = countDistinctNetNewEmails(rows)
  const todayReviewedCount = countDistinctReviewedEmails(rows)

  if (todayEmailCount >= DAILY_EMAIL_TARGET && todayReviewedCount < todayEmailCount) {
    throw new Error("Finish reviewing today's leads before requesting more.")
  }

  const needsNewEmails = todayEmailCount < DAILY_EMAIL_TARGET
  const neededQualified = Math.max(DAILY_QUALIFIED_TARGET - (todayQualifiedCount || 0), 0)
  const targetEmailCount = needsNewEmails ? DAILY_EMAIL_TARGET : todayEmailCount + Math.max(neededQualified, 25)
  const requestedAt = new Date().toISOString()
  const message = needsNewEmails
    ? `Need ${DAILY_EMAIL_TARGET - todayEmailCount} more new emails. Scraper request queued.`
    : `Need ${neededQualified} more qualified leads. Scraper request queued.`
  const value = {
    day,
    status: "requested",
    request_id: randomUUID(),
    requested_at: requestedAt,
    requested_by: session.email,
    started_at: null,
    completed_at: null,
    failed_at: null,
    target_qualified: DAILY_QUALIFIED_TARGET,
    today_qualified_count: todayQualifiedCount || 0,
    today_email_count: todayEmailCount,
    target_email_count: targetEmailCount,
    latest_message: message,
  }

  const { error: upsertError } = await supabase.from("app_settings").upsert({
    key: TOP_UP_APP_SETTING_KEY,
    value,
    updated_at: requestedAt,
  })
  if (upsertError) {
    throw new Error(upsertError.message)
  }

  const { error: eventError } = await supabase.from("agent_events").insert({
    agent: "finder_v1_worker",
    event: "top_up_requested",
    status: "ok",
    data: {
      day,
      target_qualified: DAILY_QUALIFIED_TARGET,
      today_qualified_count: todayQualifiedCount || 0,
      today_email_count: todayEmailCount,
      target_email_count: targetEmailCount,
      requested_by: session.email,
      requested_at: requestedAt,
      message,
    },
  })
  if (eventError) {
    throw new Error(eventError.message)
  }

  return value
}
