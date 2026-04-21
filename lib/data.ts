import "server-only"

import { createAdminClient } from "@/lib/supabase-admin"
import { getOptionalEnv } from "@/lib/env"
import { maybeFreshenPendingSmartlead } from "@/lib/smartlead"
import type {
  CronJobRow,
  DailyEmailPerformanceRow,
  FileEntry,
  LeadCoachingFilter,
  LeadChecklist,
  LeadGender,
  LeadListResult,
  PaginatedResult,
  LeadReviewSnapshot,
  LeadRow,
  ReviewQueueResult,
  ReviewerDecision,
  TopUpStatus,
  WorkerEvent,
  WorkerEventSummary,
} from "@/lib/types"

const LEAD_SELECT = [
  "id",
  "first_name",
  "first_name_verified",
  "full_name",
  "email",
  "email_source",
  "instagram_handle",
  "instagram_url",
  "follower_count",
  "status",
  "bio",
  "source",
  "source_detail",
  "batch_date",
  "review_status",
  "reviewed_at",
  "reviewed_by",
  "review_notes",
  "exported_at",
  "export_batch_id",
  "sent_to_smartlead",
  "smartlead_campaign_id",
  "smartlead_sent_at",
  "created_at",
].join(",")

const BUCKET_NAME = getOptionalEnv("FINDER_OUTPUT_BUCKET") || "finder-outputs"
const PAGE_SIZE = 50
const REMOTE_FETCH_BATCH_SIZE = 500
const LEAD_ID_FETCH_BATCH_SIZE = 200
const REVIEW_QUEUE_PAGE_SIZE = 10
const DAILY_EMAIL_TARGET = 150
const DAILY_QUALIFIED_TARGET = 100
const TOP_UP_APP_SETTING_KEY = "finder_review_top_up_request"
const TOP_UP_EVENT_NAMES = new Set([
  "top_up_requested",
  "top_up_started",
  "top_up_completed",
  "top_up_failed",
  "daily_run_started",
  "daily_run_completed",
  "daily_run_partial",
  "daily_run_stalled",
  "daily_run_failed",
])
const REVIEW_DECISION_ACTIONS = new Set(["qualified", "not_qualified", "va_approve", "flag"])

export type ReviewFilters = {
  q?: string
  batchDate?: string
  emailType?: string
  source?: string
  page?: string | number
}

export type ReadyFilters = {
  page?: string | number
  gender?: string
  coaching?: string
}

function castRows<T>(rows: unknown): T[] {
  return ((rows as T[] | null) || []) as T[]
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

function buildPastBusinessDays(days: number): string[] {
  const values: string[] = []
  const now = Date.now()
  for (let index = 0; index < days; index += 1) {
    const date = new Date(now - index * 24 * 60 * 60 * 1000)
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Makassar",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date)
    const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]))
    values.push(`${lookup.year}-${lookup.month}-${lookup.day}`)
  }
  return values
}

function normalizeBusinessDay(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
}

function normalizePage(value: string | number | undefined): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value)
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed
    }
  }
  return 1
}

function applyHasEmailFilters(query: any) {
  return query.not("email", "is", null).neq("email", "")
}

function applySharedQueueFilters(query: any, filters: ReviewFilters) {
  let next = applyHasEmailFilters(query).neq("sent_to_smartlead", true).in("status", ["email_ready", "mgmt_email"])
  if (filters.batchDate) {
    next = next.eq("batch_date", filters.batchDate)
  }
  if (filters.emailType === "management") {
    next = next.eq("status", "mgmt_email")
  } else if (filters.emailType === "personal") {
    next = next.eq("status", "email_ready")
  }
  if (filters.source) {
    next = next.ilike("source_detail", `%${filters.source}%`)
  }
  if (filters.q) {
    const safe = filters.q.replace(/,/g, " ")
    next = next.or(`instagram_handle.ilike.%${safe}%,full_name.ilike.%${safe}%,email.ilike.%${safe}%`)
  }
  return next
}

function emptyChecklist(): LeadChecklist {
  return {
    authority: null,
    personality: null,
    engagement: null,
  }
}

function parseChecklist(payload: Record<string, unknown> | null | undefined): LeadChecklist {
  const source = payload?.checklist as Record<string, unknown> | undefined
  const next = emptyChecklist()
  for (const key of ["authority", "personality", "engagement"] as const) {
    const value = source?.[key]
    next[key] = value === "pass" || value === "fail" ? value : null
  }
  return next
}

function parseRecommendation(action: string, payload: Record<string, unknown> | null | undefined): ReviewerDecision | null {
  const explicit = payload?.recommendation
  if (explicit === "qualified" || explicit === "not_qualified") {
    return explicit
  }
  if (action === "qualified" || action === "va_approve") {
    return "qualified"
  }
  if (action === "not_qualified" || action === "flag") {
    return "not_qualified"
  }
  return null
}

function parseOwnerDecision(action: string): "qualified" | "disqualified" | null {
  if (action === "owner_approve") {
    return "qualified"
  }
  if (action === "reject") {
    return "disqualified"
  }
  return null
}

function parseEmailType(payload: Record<string, unknown> | null | undefined): "personal" | "management" | null {
  const explicit = payload?.email_type
  return explicit === "personal" || explicit === "management" ? explicit : null
}

function parseGender(payload: Record<string, unknown> | null | undefined): LeadGender | null {
  const explicit = payload?.gender
  return explicit === "male" || explicit === "female" ? explicit : null
}

function parseHasCoaching(payload: Record<string, unknown> | null | undefined): boolean | null {
  const explicit = payload?.has_coaching
  return typeof explicit === "boolean" ? explicit : null
}

function normalizeReadyGenderFilter(value: string | null | undefined): LeadGender | null {
  return value === "male" || value === "female" ? value : null
}

function normalizeReadyCoachingFilter(value: string | null | undefined): LeadCoachingFilter | null {
  return value === "has" || value === "none" ? value : null
}

function readLeadGender(lead: LeadRow): LeadGender | null {
  return lead.gender || lead.review_snapshot?.gender || null
}

function readLeadHasCoaching(lead: LeadRow): boolean | null {
  return lead.review_snapshot?.has_coaching ?? null
}

function matchesReadyFilters(
  lead: LeadRow,
  filters: { gender: LeadGender | null; coaching: LeadCoachingFilter | null },
): boolean {
  const leadGender = readLeadGender(lead)
  if (filters.gender && leadGender !== filters.gender) {
    return false
  }

  const hasCoaching = readLeadHasCoaching(lead)
  if (filters.coaching === "has" && hasCoaching !== true) {
    return false
  }
  if (filters.coaching === "none" && hasCoaching !== false) {
    return false
  }

  return true
}

function isEligibleForSmartlead(lead: LeadRow): boolean {
  if (lead.review_status !== "approved") {
    return false
  }
  if (lead.review_snapshot?.owner_decision === "disqualified") {
    return false
  }
  return true
}

function applyReviewSnapshots(leads: LeadRow[], snapshots: Map<string, LeadReviewSnapshot>) {
  return leads.map((lead) => ({
    ...lead,
    review_snapshot: snapshots.get(lead.id) || null,
  }))
}

async function fetchReviewSnapshots(leadIds: string[]): Promise<Map<string, LeadReviewSnapshot>> {
  const snapshotMap = new Map<string, LeadReviewSnapshot>()
  if (!leadIds.length) {
    return snapshotMap
  }
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("lead_review_events")
    .select("lead_id,action,payload,created_at,actor_identifier,actor_role")
    .in("lead_id", leadIds)
    .order("created_at", { ascending: false })
    .limit(leadIds.length * 12)

  if (error) {
    throw new Error(error.message)
  }

  for (const row of castRows<{
    lead_id: string
    action: string
    payload: Record<string, unknown> | null
    created_at: string
    actor_identifier: string
    actor_role: string
  }>(data)) {
    const parsedEmailType = parseEmailType(row.payload)
    const parsedGender = parseGender(row.payload)
    const parsedHasCoaching = parseHasCoaching(row.payload)
    const parsedNote = typeof row.payload?.note === "string" ? row.payload.note : null
    const hasDecision = REVIEW_DECISION_ACTIONS.has(row.action)
    const hasUsefulPayload =
      hasDecision || parsedEmailType !== null || parsedGender !== null || parsedHasCoaching !== null || parsedNote !== null
    if (!hasUsefulPayload) {
      continue
    }
    const current = (snapshotMap.get(row.lead_id) || {
      recommendation: null,
      owner_decision: null,
      checklist: emptyChecklist(),
      email_type: null,
      gender: null,
      has_coaching: null,
      va_note: null,
      owner_note: null,
      reviewed_at: null,
      reviewed_by: null,
    }) as LeadReviewSnapshot & { _ownerDecisionResolved?: boolean }
    if (!current._ownerDecisionResolved) {
      const ownerDecision = parseOwnerDecision(row.action)
      if (ownerDecision !== null) {
        current.owner_decision = ownerDecision
        current._ownerDecisionResolved = true
      } else if (row.action === "reopen") {
        current.owner_decision = null
        current._ownerDecisionResolved = true
      }
    }
    if (current.email_type === null && parsedEmailType !== null) {
      current.email_type = parsedEmailType
    }
    if (current.gender === null && parsedGender !== null) {
      current.gender = parsedGender
    }
    if (current.has_coaching === null && parsedHasCoaching !== null) {
      current.has_coaching = parsedHasCoaching
    }
    if (parsedNote !== null) {
      if (row.actor_role === "reviewer" && current.va_note === null) {
        current.va_note = parsedNote
      }
      if (row.actor_role === "owner" && current.owner_note === null) {
        current.owner_note = parsedNote
      }
    }
    if (current.recommendation === null && hasDecision) {
      current.recommendation = parseRecommendation(row.action, row.payload)
      current.checklist = parseChecklist(row.payload)
      current.reviewed_at = row.created_at
      current.reviewed_by = row.actor_identifier
    }
    snapshotMap.set(row.lead_id, current)
  }

  return snapshotMap
}

async function fetchLeadsByIds(
  leadIds: string[],
  options: {
    includeSent?: boolean
    q?: string
  } = {},
): Promise<LeadRow[]> {
  if (!leadIds.length) {
    return []
  }

  const supabase = createAdminClient()
  const rows: LeadRow[] = []
  const searchQuery = options.q?.trim()
  const safeSearch = searchQuery ? searchQuery.replace(/,/g, " ") : null

  for (let index = 0; index < leadIds.length; index += LEAD_ID_FETCH_BATCH_SIZE) {
    const batchIds = leadIds.slice(index, index + LEAD_ID_FETCH_BATCH_SIZE)
    let query = applyHasEmailFilters(
      supabase
        .from("leads")
        .select(LEAD_SELECT)
        .in("id", batchIds)
    ).in("status", ["email_ready", "mgmt_email"])

    if (!options.includeSent) {
      query = query.neq("sent_to_smartlead", true)
    }

    if (safeSearch) {
      query = query.or(`instagram_handle.ilike.%${safeSearch}%,full_name.ilike.%${safeSearch}%,email.ilike.%${safeSearch}%`)
    }

    const { data, error } = await query.order("created_at", { ascending: false })
    if (error) {
      throw new Error(error.message)
    }
    rows.push(...castRows<LeadRow>(data))
  }

  return rows
}

function buildPaginatedResult<T>(items: T[], total: number, page: number): PaginatedResult<T> {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const startIndex = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const endIndex = total === 0 ? 0 : startIndex + items.length - 1
  return {
    items,
    total,
    page: currentPage,
    pageSize: PAGE_SIZE,
    totalPages,
    hasNext: currentPage < totalPages,
    hasPrevious: currentPage > 1,
    startIndex,
    endIndex,
  }
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

function leadEmailKey(row: { id?: string | null; email?: string | null }) {
  const email = (row.email || "").trim().toLowerCase()
  return email || `row:${row.id || ""}`
}

function dedupeLeadRowsByEmail<T extends { id?: string | null; email?: string | null }>(rows: T[]) {
  const seen = new Set<string>()
  const deduped: T[] = []
  for (const row of rows) {
    const key = leadEmailKey(row)
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    deduped.push(row)
  }
  return deduped
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

function countDistinctLeadEmails<T extends { id?: string | null; email?: string | null }>(rows: T[]) {
  return dedupeLeadRowsByEmail(rows).length
}

async function fetchAllRows<T>(buildQuery: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>) {
  const rows: T[] = []
  for (let from = 0; ; from += REMOTE_FETCH_BATCH_SIZE) {
    const to = from + REMOTE_FETCH_BATCH_SIZE - 1
    const { data, error } = await buildQuery(from, to)
    if (error) {
      throw new Error(error.message)
    }
    const chunk = castRows<T>(data)
    rows.push(...chunk)
    if (chunk.length < REMOTE_FETCH_BATCH_SIZE) {
      break
    }
  }
  return rows
}

async function countLeadsByStatus(reviewStatus: string, extraFilters?: (query: any) => any) {
  const supabase = createAdminClient()
  const data = await fetchAllRows<{ id: string; email: string | null }>((from, to) => {
    let query = applyHasEmailFilters(
      supabase
        .from("leads")
        .select("id,email")
        .eq("review_status", reviewStatus)
    )
      .neq("sent_to_smartlead", true)
      .in("status", ["email_ready", "mgmt_email"])
    if (extraFilters) {
      query = extraFilters(query)
    }
    return query.range(from, to)
  })
  return countDistinctLeadEmails(data)
}

async function countTodayQualifiedLeads(day = todayBusinessDate()) {
  const supabase = createAdminClient()
  const data = await fetchAllRows<{ id: string; email: string | null }>((from, to) =>
    applyHasEmailFilters(
      supabase
        .from("leads")
        .select("id,email")
        .eq("batch_date", day)
        .eq("source", "finder_v1")
        .not("reviewed_at", "is", null)
        .or("review_status.eq.va_approved,review_status.eq.approved,review_status.eq.exported_pending_confirmation,sent_to_smartlead.eq.true")
    )
      .in("status", ["email_ready", "mgmt_email"])
      .range(from, to)
  )
  return countDistinctLeadEmails(data)
}

async function countTodayAutoSentLeads(day = todayBusinessDate()) {
  const supabase = createAdminClient()
  const data = await fetchAllRows<{ id: string; email: string | null }>((from, to) =>
    applyHasEmailFilters(
      supabase
        .from("leads")
        .select("id,email")
        .eq("batch_date", day)
        .eq("source", "finder_v1")
        .eq("sent_to_smartlead", true)
        .is("reviewed_at", null)
    )
      .in("status", ["email_ready", "mgmt_email"])
      .range(from, to)
  )
  return countDistinctLeadEmails(data)
}

async function countTodayUnreviewedLeads(day = todayBusinessDate()) {
  const supabase = createAdminClient()
  const data = await fetchAllRows<{ id: string; email: string | null }>((from, to) =>
    applyHasEmailFilters(
      supabase
        .from("leads")
        .select("id,email")
        .eq("batch_date", day)
        .eq("source", "finder_v1")
        .eq("review_status", "unreviewed")
    )
      .in("status", ["email_ready", "mgmt_email"])
      .range(from, to)
  )
  return countDistinctLeadEmails(data)
}

async function countTodayReviewedLeads(day = todayBusinessDate()) {
  const supabase = createAdminClient()
  const data = await fetchAllRows<{ id: string; email: string | null }>((from, to) =>
    applyHasEmailFilters(
      supabase
        .from("leads")
        .select("id,email")
        .eq("batch_date", day)
        .eq("source", "finder_v1")
        .not("reviewed_at", "is", null)
    )
      .in("status", ["email_ready", "mgmt_email"])
      .range(from, to)
  )
  return countDistinctLeadEmails(data)
}

async function countTodayWaitingOwnerLeads(day = todayBusinessDate()) {
  const supabase = createAdminClient()
  const data = await fetchAllRows<{ id: string; email: string | null }>((from, to) =>
    applyHasEmailFilters(
      supabase
        .from("leads")
        .select("id,email")
        .eq("batch_date", day)
        .eq("source", "finder_v1")
        .in("review_status", ["va_approved", "flagged"])
        .neq("sent_to_smartlead", true)
    )
      .in("status", ["email_ready", "mgmt_email"])
      .range(from, to)
  )
  return countDistinctLeadEmails(data)
}

async function countTodayReadyLeads(day = todayBusinessDate()) {
  const supabase = createAdminClient()
  const data = await fetchAllRows<{ id: string; email: string | null }>((from, to) =>
    applyHasEmailFilters(
      supabase
        .from("leads")
        .select("id,email")
        .eq("batch_date", day)
        .eq("source", "finder_v1")
        .eq("review_status", "approved")
        .neq("sent_to_smartlead", true)
    )
      .in("status", ["email_ready", "mgmt_email"])
      .range(from, to)
  )
  return countDistinctLeadEmails(data)
}

async function countTodayEmails(day = todayBusinessDate()) {
  const supabase = createAdminClient()
  const { data, error } = await applyHasEmailFilters(
    supabase
      .from("leads")
      .select("email,sent_to_smartlead,reviewed_at")
      .eq("batch_date", day)
      .eq("source", "finder_v1")
  ).in("status", ["email_ready", "mgmt_email"])
  if (error) {
    throw new Error(error.message)
  }
  return countDistinctNetNewEmails(
    castRows<{ email: string | null; sent_to_smartlead: boolean | null; reviewed_at: string | null }>(data)
  )
}

async function getWorkerJobs(): Promise<CronJobRow[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("cron_jobs")
    .select("id,agent,name,schedule,enabled,last_run_at,next_run_at,last_status,last_duration_ms,run_count")
    .in("id", ["finder-v1-daily-run", "finder-v1-doc-harvest", "finder-v1-smartlead-reconcile"])
    .order("id", { ascending: true })
  if (error) {
    throw new Error(error.message)
  }
  return castRows<CronJobRow>(data)
}

async function getWorkerEvents(limit = 20): Promise<WorkerEvent[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("agent_events")
    .select("id,agent,event,status,data,created_at")
    .eq("agent", "finder_v1_worker")
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) {
    throw new Error(error.message)
  }
  return castRows<WorkerEvent>(data)
}

function summarizeWorkerEvent(event: WorkerEvent): WorkerEventSummary {
  const data = event.data || {}
  const currentDailyCount = Number(data.current_daily_count || 0)
  const targetEmails = Number(data.target_emails || 0)
  const todayEmailCount = Number(data.today_email_count || 0)
  const targetEmailCount = Number(data.target_email_count || 0)
  const qualifiedCount = Number(data.today_qualified_count || 0)
  const qualifiedTarget = Number(data.target_qualified || 0)
  const pendingDocJobs = Number(data.pending_doc_jobs || 0)
  const labelMap: Record<string, string> = {
    top_up_requested: "Top-up requested",
    top_up_started: "Top-up started",
    top_up_completed: "Top-up finished",
    top_up_failed: "Top-up failed",
    daily_run_started: "Scraper started",
    daily_run_completed: "Scraper finished",
    daily_run_partial: "Scraper paused",
    daily_run_stalled: "Scraper stalled",
    daily_run_failed: "Scraper failed",
  }
  let message = ""
  if (event.event === "top_up_requested") {
    message =
      typeof data.message === "string" && data.message.trim()
        ? data.message.trim()
        : `Need ${Math.max(DAILY_EMAIL_TARGET - todayEmailCount, 0)} more new emails today.`
  } else if (event.event === "top_up_started") {
    if (todayEmailCount < DAILY_EMAIL_TARGET) {
      message = `Scraper is looking for ${DAILY_EMAIL_TARGET - todayEmailCount} more new emails.`
    } else if (targetEmailCount > todayEmailCount) {
      message = `Scraper is finding more leads after today's review.`
    } else if (qualifiedTarget > 0 && qualifiedCount < qualifiedTarget) {
      message = `Scraper is finding more leads so today can reach ${qualifiedTarget} qualified.`
    } else {
      message = "Scraper is finding more leads for today."
    }
  } else if (event.event === "top_up_completed") {
    message =
      typeof data.message === "string" && data.message.trim()
        ? data.message.trim()
        : `Run finished. Today is at ${todayEmailCount} new emails.`
  } else if (event.event === "daily_run_started") {
    if (currentDailyCount < DAILY_EMAIL_TARGET) {
      message = `Scraper is looking for ${DAILY_EMAIL_TARGET - currentDailyCount} more new emails.`
    } else if (targetEmails > currentDailyCount) {
      message = "Scraper is finding more leads after today's review."
    } else {
      message = "Scraper is running for today."
    }
  } else if (event.event === "daily_run_completed") {
    message = `Scraper finished with ${currentDailyCount} new emails today.`
  } else if (event.event === "daily_run_partial" || event.event === "daily_run_stalled") {
    message = pendingDocJobs > 0 ? `${pendingDocJobs} DOC jobs still pending.` : "Waiting for the next useful cycle."
  } else if (typeof data.message === "string" && data.message.trim()) {
    message = data.message.trim()
  } else {
    message = event.event.replace(/_/g, " ")
  }
  return {
    id: event.id,
    label: labelMap[event.event] || event.event.replace(/_/g, " "),
    message,
    status: event.status,
    created_at: event.created_at,
  }
}

async function getTopUpRequestRecord() {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("app_settings")
    .select("value,updated_at")
    .eq("key", TOP_UP_APP_SETTING_KEY)
    .maybeSingle()
  if (error) {
    throw new Error(error.message)
  }
  return data as { value: Record<string, unknown>; updated_at: string } | null
}

function parseTopUpStatus(value: unknown): TopUpStatus["status"] {
  if (value === "requested" || value === "running" || value === "completed" || value === "failed") {
    return value
  }
  return "idle"
}

function cronJobLooksActive(job: CronJobRow | null) {
  if (!job?.last_run_at) {
    return false
  }
  const lastStatus = (job.last_status || "").trim().toLowerCase()
  if (!["running", "behind_pace", "on_pace"].includes(lastStatus)) {
    return false
  }
  const lastRun = new Date(job.last_run_at)
  if (Number.isNaN(lastRun.getTime())) {
    return false
  }
  return Date.now() - lastRun.getTime() < 20 * 60 * 60 * 1000
}

function cronJobLooksBroken(job: CronJobRow | null) {
  if (!job?.last_run_at) {
    return false
  }
  const lastStatus = (job.last_status || "").trim().toLowerCase()
  if (!["stalled", "partial", "error", "failed"].includes(lastStatus)) {
    return false
  }
  const lastRun = new Date(job.last_run_at)
  if (Number.isNaN(lastRun.getTime())) {
    return false
  }
  return Date.now() - lastRun.getTime() < 20 * 60 * 60 * 1000
}

function defaultTopUpMessage(
  status: TopUpStatus["status"],
  mode: TopUpStatus["mode"],
  shortfall: number,
  todayEmailCount: number,
  todayUnreviewedCount: number,
) {
  if (status === "requested") {
    return "Top-up requested. The scraper will pick it up shortly."
  }
  if (status === "running") {
    return "Scraper is finding more leads for today right now."
  }
  if (status === "completed") {
    if (mode === "emails" && shortfall > 0) {
      return `Run finished. Today is at ${todayEmailCount} new emails.`
    }
    if (mode === "qualified" && shortfall > 0) {
      return `Run finished. Review the new leads and request another top-up if you still need ${shortfall}.`
    }
    return "Today is on track."
  }
  if (status === "failed") {
    return "The last top-up failed. You can try again."
  }
  if (mode === "emails") {
    return `Today is at ${todayEmailCount} new emails.`
  }
  if (mode === "review") {
    return `${todayUnreviewedCount} from today still need review.`
  }
  if (mode === "qualified") {
    return `Today still needs ${shortfall} more qualified leads.`
  }
  return "Today is on track."
}

async function getTopUpStatus(jobs?: CronJobRow[], events?: WorkerEvent[]): Promise<TopUpStatus> {
  const day = todayBusinessDate()
  const [todayQualifiedCount, todayEmailCount, todayReviewedCount, todayUnreviewedCount, todayAutoSentCount, topUpRecord, liveJobs, liveEvents] = await Promise.all([
    countTodayQualifiedLeads(day),
    countTodayEmails(day),
    countTodayReviewedLeads(day),
    countTodayUnreviewedLeads(day),
    countTodayAutoSentLeads(day),
    getTopUpRequestRecord(),
    jobs ? Promise.resolve(jobs) : getWorkerJobs(),
    events ? Promise.resolve(events) : getWorkerEvents(16),
  ])
  const requestValue = topUpRecord?.value || {}
  const requestedDay = typeof requestValue.day === "string" ? requestValue.day : day
  const activeRequest = requestedDay === day ? requestValue : {}
  const status = parseTopUpStatus(activeRequest.status)
  const emailShortfall = Math.max(DAILY_EMAIL_TARGET - todayEmailCount, 0)
  const reviewShortfall = Math.max(todayEmailCount - todayReviewedCount, 0)
  const qualifiedShortfall = Math.max(DAILY_QUALIFIED_TARGET - todayQualifiedCount, 0)
  let mode: TopUpStatus["mode"] = "done"
  let shortfall = 0
  if (emailShortfall > 0) {
    mode = "emails"
    shortfall = emailShortfall
  } else if (reviewShortfall > 0) {
    mode = "review"
    shortfall = reviewShortfall
  } else if (qualifiedShortfall > 0) {
    mode = "qualified"
    shortfall = qualifiedShortfall
  }
  const requestIsActive = status === "requested" || status === "running"
  const emailTargetValue =
    requestIsActive && typeof activeRequest.target_email_count === "number"
      ? activeRequest.target_email_count
      : mode === "qualified"
        ? todayEmailCount + (qualifiedShortfall > 0 ? Math.max(qualifiedShortfall, 25) : 0)
        : DAILY_EMAIL_TARGET
  const recentEvents = liveEvents.filter((event) => TOP_UP_EVENT_NAMES.has(event.event)).slice(0, 6).map(summarizeWorkerEvent)
  const dailyRunJob = liveJobs.find((job) => job.id === "finder-v1-daily-run") || null
  const derivedStatus =
    status === "idle" && cronJobLooksActive(dailyRunJob) && mode !== "done"
      ? "running"
      : status === "idle" && cronJobLooksBroken(dailyRunJob) && mode !== "done"
        ? "failed"
      : status === "completed" && mode !== "done"
        ? "idle"
      : status
  const canRequestTopUp = mode === "emails" || mode === "qualified"
  const title =
    mode === "emails"
      ? `${emailShortfall} more new emails needed`
      : mode === "review"
        ? `Review ${reviewShortfall} more leads first`
        : mode === "qualified"
          ? `${qualifiedShortfall} more qualified leads needed`
          : "No top-up needed"
  const fallbackMessage = defaultTopUpMessage(derivedStatus, mode, shortfall, todayEmailCount, todayUnreviewedCount)
  const storedMessage = typeof activeRequest.latest_message === "string" && activeRequest.latest_message.trim() ? activeRequest.latest_message.trim() : ""
  const clearlyFailed = (message: string | null | undefined) => /\bfailed\b|\bstalled\b/i.test(message || "")
  const failedMessage =
    storedMessage && clearlyFailed(storedMessage)
      ? storedMessage
      : recentEvents[0]?.message && clearlyFailed(recentEvents[0].message)
        ? recentEvents[0].message
      : storedMessage
          ? `${fallbackMessage} ${storedMessage}`
          : recentEvents[0]?.message || fallbackMessage
  const latestMessage =
    derivedStatus === "requested" || derivedStatus === "running"
      ? fallbackMessage
      : derivedStatus === "failed"
        ? failedMessage
      : mode === "emails"
        ? fallbackMessage
        : storedMessage || recentEvents[0]?.message || fallbackMessage

  return {
    day,
    status: derivedStatus,
    todayQualifiedCount,
    qualifiedTarget: DAILY_QUALIFIED_TARGET,
    todayEmailCount,
    todayReviewedCount,
    todayUnreviewedCount,
    todayAutoSentCount,
    emailTarget: mode === "done" ? null : emailTargetValue,
    needsTopUp: mode !== "done",
    canRequestTopUp,
    mode,
    shortfall,
    title,
    requestedAt: typeof activeRequest.requested_at === "string" ? activeRequest.requested_at : null,
    requestedBy: typeof activeRequest.requested_by === "string" ? activeRequest.requested_by : null,
    startedAt: typeof activeRequest.started_at === "string" ? activeRequest.started_at : null,
    completedAt: typeof activeRequest.completed_at === "string" ? activeRequest.completed_at : null,
    failedAt: typeof activeRequest.failed_at === "string" ? activeRequest.failed_at : null,
    latestMessage,
    recentEvents,
  }
}

async function getDailyEmailPerformance(days = 10): Promise<DailyEmailPerformanceRow[]> {
  const supabase = createAdminClient()
  const recentDays = buildPastBusinessDays(days)
  const oldestDay = recentDays[recentDays.length - 1]
  const { data, error } = await applyHasEmailFilters(
    supabase
      .from("leads")
      .select("batch_date,email,sent_to_smartlead,reviewed_at")
      .eq("source", "finder_v1")
      .gte("batch_date", oldestDay)
  ).in("status", ["email_ready", "mgmt_email"])
  if (error) {
    throw new Error(error.message)
  }

  const counts = new Map<string, number>(recentDays.map((day) => [day, 0]))
  const seenByDay = new Map<string, Set<string>>(recentDays.map((day) => [day, new Set<string>()]))
  for (const row of castRows<{ batch_date: string | null; email: string | null; sent_to_smartlead: boolean | null; reviewed_at: string | null }>(data)) {
    if (!row.batch_date || !counts.has(row.batch_date) || !countsAsNetNewEmail(row)) {
      continue
    }
    const email = (row.email || "").trim().toLowerCase()
    if (!email) {
      continue
    }
    const seen = seenByDay.get(row.batch_date)
    if (seen?.has(email)) {
      continue
    }
    seen?.add(email)
    counts.set(row.batch_date, (counts.get(row.batch_date) || 0) + 1)
  }

  return recentDays.map((day) => {
    const newEmails = counts.get(day) || 0
    return {
      day,
      newEmails,
      targetEmails: DAILY_EMAIL_TARGET,
      hitTarget: newEmails >= DAILY_EMAIL_TARGET,
    }
  })
}

async function listRecentFiles(): Promise<FileEntry[]> {
  const supabase = createAdminClient()
  const days = buildPastBusinessDays(7)
  const files: FileEntry[] = []
  for (const day of days) {
    const { data, error } = await supabase.storage.from(BUCKET_NAME).list(`finder-v1/daily/${day}`, {
      limit: 50,
      sortBy: { column: "name", order: "desc" },
    })
    if (error || !data) {
      continue
    }
    for (const entry of data) {
      if (!entry.name) {
        continue
      }
      files.push({
        bucket: BUCKET_NAME,
        day,
        name: entry.name,
        path: `finder-v1/daily/${day}/${entry.name}`,
      })
    }
  }
  return files
}

export async function getRequireOwnerApproval(): Promise<boolean> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.from("app_settings").select("value").eq("key", "require_owner_approval").maybeSingle()
  if (error) {
    throw new Error(error.message)
  }
  if (!data) {
    return true
  }
  return Boolean(data.value)
}

export async function getDashboardData(dayInput?: string | null) {
  await maybeFreshenPendingSmartlead(15)
  const [
    jobs,
    events,
    requireOwnerApproval,
    dailyEmailPerformance,
    unreviewed,
    waitingOwnerPositive,
    waitingOwnerNegative,
    ready,
    pendingExport,
    sent,
    topUp,
  ] =
    await Promise.all([
      getWorkerJobs(),
      getWorkerEvents(16),
      getRequireOwnerApproval(),
      getDailyEmailPerformance(10),
      countLeadsByStatus("unreviewed"),
      countLeadsByStatus("va_approved"),
      countLeadsByStatus("flagged"),
      countLeadsByStatus("approved"),
      countLeadsByStatus("exported_pending_confirmation"),
      (async () => {
        const supabase = createAdminClient()
        const sentRows = await fetchAllRows<{ id: string; email: string | null }>((from, to) =>
          applyHasEmailFilters(
            supabase
              .from("leads")
              .select("id,email")
              .eq("sent_to_smartlead", true)
          ).range(from, to)
        )
        return countDistinctLeadEmails(sentRows)
      })(),
      getTopUpStatus(),
    ])

  const availableDays = dailyEmailPerformance.map((row) => row.day)
  const requestedDay = normalizeBusinessDay(dayInput)
  const selectedDay = requestedDay && availableDays.includes(requestedDay) ? requestedDay : availableDays[0] || todayBusinessDate()
  const selectedPerformance = dailyEmailPerformance.find((row) => row.day === selectedDay) || {
    day: selectedDay,
    newEmails: 0,
    targetEmails: DAILY_EMAIL_TARGET,
    hitTarget: false,
  }
  const [selectedReviewedCount, selectedWaitingOwnerCount, selectedReadyCount, selectedUnreviewedCount] = await Promise.all([
    countTodayReviewedLeads(selectedDay),
    countTodayWaitingOwnerLeads(selectedDay),
    countTodayReadyLeads(selectedDay),
    countTodayUnreviewedLeads(selectedDay),
  ])

  return {
    selectedDay,
    availableDays,
    counts: {
      unreviewed,
      waitingOwner: waitingOwnerPositive + waitingOwnerNegative,
      ready,
      pendingExport,
      sent,
      todayEmailCount: selectedPerformance.newEmails,
      todayTarget: selectedPerformance.targetEmails,
      todayTargetHit: selectedPerformance.hitTarget,
      todayReviewedCount: selectedReviewedCount,
      todayWaitingOwnerCount: selectedWaitingOwnerCount,
      todayReadyCount: selectedReadyCount,
      todayUnreviewedCount: selectedUnreviewedCount,
      todayQualifiedCount: topUp.todayQualifiedCount,
      qualifiedTarget: topUp.qualifiedTarget,
      needsTopUp: topUp.needsTopUp,
    },
    dailyEmailPerformance,
    workerJobs: jobs,
    requireOwnerApproval,
    topUp,
    workerHighlights: events.filter((event) => TOP_UP_EVENT_NAMES.has(event.event)).slice(0, 3).map(summarizeWorkerEvent),
  }
}

export async function getReviewQueue(filters: ReviewFilters): Promise<ReviewQueueResult> {
  const supabase = createAdminClient()
  const page = normalizePage(filters.page)
  const from = (page - 1) * REVIEW_QUEUE_PAGE_SIZE
  const to = from + REVIEW_QUEUE_PAGE_SIZE
  const { data, error } = await applySharedQueueFilters(
    supabase.from("leads").select(LEAD_SELECT).eq("review_status", "unreviewed"),
    filters
  )
    .order("batch_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to)

  if (error) {
    throw new Error(error.message)
  }

  const rows = castRows<LeadRow>(data)
  const hasNext = rows.length > REVIEW_QUEUE_PAGE_SIZE
  const pageItems = hasNext ? rows.slice(0, REVIEW_QUEUE_PAGE_SIZE) : rows
  const snapshots = await fetchReviewSnapshots(pageItems.map((lead) => lead.id))
  const items = applyReviewSnapshots(pageItems, snapshots)
  const startIndex = items.length ? from + 1 : 0
  const endIndex = items.length ? from + items.length : 0

  return {
    items,
    total: endIndex + (hasNext ? 1 : 0),
    page,
    pageSize: REVIEW_QUEUE_PAGE_SIZE,
    totalPages: hasNext ? page + 1 : page,
    hasNext,
    hasPrevious: page > 1,
    startIndex,
    endIndex,
  }
}

export async function getReviewerHistory(reviewerEmail: string, filters: ReviewFilters): Promise<ReviewQueueResult> {
  const supabase = createAdminClient()
  const page = normalizePage(filters.page)
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const events = await fetchAllRows<{ lead_id: string; created_at: string }>((rangeFrom, rangeTo) =>
    supabase
      .from("lead_review_events")
      .select("lead_id,created_at")
      .eq("actor_role", "reviewer")
      .eq("actor_identifier", reviewerEmail)
      .in("action", ["qualified", "not_qualified", "save"])
      .order("created_at", { ascending: false })
      .range(rangeFrom, rangeTo)
  )

  const orderedLeadIds: string[] = []
  const seenLeadIds = new Set<string>()
  for (const event of events) {
    if (!event.lead_id || seenLeadIds.has(event.lead_id)) {
      continue
    }
    seenLeadIds.add(event.lead_id)
    orderedLeadIds.push(event.lead_id)
  }

  if (!orderedLeadIds.length) {
    return buildPaginatedResult([], 0, page)
  }

  let filteredLeadIds = orderedLeadIds
  if (filters.q?.trim()) {
    const filteredRows = await fetchLeadsByIds(orderedLeadIds, {
      includeSent: true,
      q: filters.q,
    })
    const matchingLeadIds = new Set(filteredRows.map((lead) => lead.id))
    filteredLeadIds = orderedLeadIds.filter((leadId) => matchingLeadIds.has(leadId))
  }

  if (!filteredLeadIds.length) {
    return buildPaginatedResult([], 0, page)
  }

  const pageLeadIds = filteredLeadIds.slice(from, to + 1)
  const pageRows = await fetchLeadsByIds(pageLeadIds, {
    includeSent: true,
  })
  const leadMap = new Map(pageRows.map((lead) => [lead.id, lead]))
  const orderedLeads = pageLeadIds
    .map((leadId) => leadMap.get(leadId))
    .filter((lead): lead is LeadRow => Boolean(lead))
  const snapshots = await fetchReviewSnapshots(orderedLeads.map((lead) => lead.id))
  const items = applyReviewSnapshots(orderedLeads, snapshots)
  return buildPaginatedResult(items, filteredLeadIds.length, page)
}

export async function getOwnerQueue(pageInput?: string | number): Promise<LeadListResult> {
  const supabase = createAdminClient()
  const page = normalizePage(pageInput)
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1
  const rows = await fetchAllRows<LeadRow>((rangeFrom, rangeTo) =>
    applyHasEmailFilters(
      supabase
        .from("leads")
        .select(LEAD_SELECT)
        .in("review_status", ["va_approved", "flagged"])
        .neq("sent_to_smartlead", true)
    )
      .in("status", ["email_ready", "mgmt_email"])
      .order("reviewed_at", { ascending: false })
      .range(rangeFrom, rangeTo)
  )
  const deduped = dedupeLeadRowsByEmail(rows)
  const snapshots = await fetchReviewSnapshots(deduped.map((lead) => lead.id))
  const items = applyReviewSnapshots(deduped, snapshots)
  return buildPaginatedResult(items.slice(from, to + 1), items.length, page)
}

export async function getOwnerHistory(ownerEmail: string, pageInput?: string | number): Promise<LeadListResult> {
  const supabase = createAdminClient()
  const page = normalizePage(pageInput)
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const events = await fetchAllRows<{ lead_id: string; created_at: string }>((rangeFrom, rangeTo) =>
    supabase
      .from("lead_review_events")
      .select("lead_id,created_at")
      .eq("actor_role", "owner")
      .eq("actor_identifier", ownerEmail)
      .in("action", ["owner_approve", "reject"])
      .order("created_at", { ascending: false })
      .range(rangeFrom, rangeTo)
  )

  const orderedLeadIds: string[] = []
  const seenLeadIds = new Set<string>()
  for (const event of events) {
    if (!event.lead_id || seenLeadIds.has(event.lead_id)) {
      continue
    }
    seenLeadIds.add(event.lead_id)
    orderedLeadIds.push(event.lead_id)
  }

  if (!orderedLeadIds.length) {
    return buildPaginatedResult([], 0, page)
  }

  const pageLeadIds = orderedLeadIds.slice(from, to + 1)
  const { data, error } = await applyHasEmailFilters(
    supabase
      .from("leads")
      .select(LEAD_SELECT)
      .in("id", pageLeadIds)
  ).order("reviewed_at", { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  const leadMap = new Map(castRows<LeadRow>(data).map((lead) => [lead.id, lead]))
  const orderedLeads = pageLeadIds
    .map((leadId) => leadMap.get(leadId))
    .filter((lead): lead is LeadRow => Boolean(lead))
  const snapshots = await fetchReviewSnapshots(orderedLeads.map((lead) => lead.id))
  const items = applyReviewSnapshots(orderedLeads, snapshots)
  return buildPaginatedResult(items, orderedLeadIds.length, page)
}

export async function listReadyForSmartleadRows(filters: ReadyFilters = {}): Promise<LeadRow[]> {
  await maybeFreshenPendingSmartlead(15)
  const supabase = createAdminClient()
  const rows = await fetchAllRows<LeadRow>((rangeFrom, rangeTo) =>
    applyHasEmailFilters(
      supabase
        .from("leads")
        .select(LEAD_SELECT)
        .eq("review_status", "approved")
        .neq("sent_to_smartlead", true)
    )
      .in("status", ["email_ready", "mgmt_email"])
      .order("reviewed_at", { ascending: false })
      .range(rangeFrom, rangeTo)
  )
  const deduped = dedupeLeadRowsByEmail(rows)
  const snapshots = await fetchReviewSnapshots(deduped.map((lead) => lead.id))
  const items = applyReviewSnapshots(deduped, snapshots)
  const normalizedFilters = {
    gender: normalizeReadyGenderFilter(filters.gender),
    coaching: normalizeReadyCoachingFilter(filters.coaching),
  }
  return items.filter((lead) => isEligibleForSmartlead(lead) && matchesReadyFilters(lead, normalizedFilters))
}

export async function getReadyForSmartlead(filtersOrPage?: ReadyFilters | string | number): Promise<LeadListResult> {
  const filters =
    typeof filtersOrPage === "string" || typeof filtersOrPage === "number" || filtersOrPage == null
      ? { page: filtersOrPage }
      : filtersOrPage
  const page = normalizePage(filters.page)
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1
  const items = await listReadyForSmartleadRows(filters)
  return buildPaginatedResult(items.slice(from, to + 1), items.length, page)
}

export async function getExportHistory(pageInput?: string | number) {
  await maybeFreshenPendingSmartlead(25)
  const supabase = createAdminClient()
  const page = normalizePage(pageInput)
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const [pendingRowsRaw, sentRowsRaw] = await Promise.all([
    fetchAllRows<LeadRow>((rangeFrom, rangeTo) =>
      applyHasEmailFilters(
        supabase
          .from("leads")
          .select(LEAD_SELECT)
          .eq("review_status", "exported_pending_confirmation")
          .neq("sent_to_smartlead", true)
      )
        .in("status", ["email_ready", "mgmt_email"])
        .order("exported_at", { ascending: false })
        .range(rangeFrom, rangeTo)
    ),
    fetchAllRows<LeadRow>((rangeFrom, rangeTo) =>
      applyHasEmailFilters(
        supabase
          .from("leads")
          .select(LEAD_SELECT)
          .eq("sent_to_smartlead", true)
          .not("exported_at", "is", null)
      )
        .in("status", ["email_ready", "mgmt_email"])
        .order("smartlead_sent_at", { ascending: false })
        .range(rangeFrom, rangeTo)
    ),
  ])

  const pendingRows = dedupeLeadRowsByEmail(pendingRowsRaw)
  const sentRows = dedupeLeadRowsByEmail(sentRowsRaw)
  const snapshots = await fetchReviewSnapshots([...pendingRows, ...sentRows].map((row) => row.id))
  const pendingItems = applyReviewSnapshots(pendingRows, snapshots)
  const sentItems = applyReviewSnapshots(sentRows, snapshots)
  const batchMap = new Map<string, { id: string; exportedAt: string | null; count: number }>()
  for (const row of [...pendingItems, ...sentItems]) {
    if (!row.export_batch_id) {
      continue
    }
    const existing = batchMap.get(row.export_batch_id)
    if (existing) {
      existing.count += 1
      continue
    }
    batchMap.set(row.export_batch_id, {
      id: row.export_batch_id,
      exportedAt: row.exported_at,
      count: 1,
    })
  }

  return {
    pending: buildPaginatedResult(pendingItems.slice(from, to + 1), pendingItems.length, page),
    sent: buildPaginatedResult(sentItems.slice(from, to + 1), sentItems.length, page),
    batches: [...batchMap.values()].sort((a, b) => (b.exportedAt || "").localeCompare(a.exportedAt || "")),
  }
}

export async function getFilesAndStatus() {
  const [files, jobs, events, topUp] = await Promise.all([listRecentFiles(), getWorkerJobs(), getWorkerEvents(20), getTopUpStatus()])
  return {
    files,
    workerJobs: jobs,
    workerEvents: events,
    topUp,
  }
}

export async function getRunStatus() {
  const [jobs, events, topUp] = await Promise.all([getWorkerJobs(), getWorkerEvents(20), getTopUpStatus()])
  return {
    workerJobs: jobs,
    workerEvents: events,
    topUp,
  }
}
