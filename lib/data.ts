import "server-only"

import { createAdminClient } from "@/lib/supabase-admin"
import { getOptionalEnv } from "@/lib/env"
import { maybeFreshenPendingSmartlead } from "@/lib/smartlead"
import type { CronJobRow, FileEntry, LeadRow, ReviewQueueResult, WorkerEvent } from "@/lib/types"

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
const PAGE_SIZE = 25

export type ReviewFilters = {
  q?: string
  batchDate?: string
  emailType?: string
  source?: string
  page?: string
}

function castRows<T>(rows: unknown): T[] {
  return ((rows as T[] | null) || []) as T[]
}

function normalizePage(value: string | undefined): number {
  if (!value) {
    return 1
  }
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1
  }
  return parsed
}

function buildPaginatedResult<T>(items: T[], total: number, page: number) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const hasNext = currentPage < totalPages
  const hasPrevious = currentPage > 1
  const startIndex = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const endIndex = total === 0 ? 0 : startIndex + items.length - 1

  return {
    items,
    total,
    page: currentPage,
    pageSize: PAGE_SIZE,
    totalPages,
    hasNext,
    hasPrevious,
    startIndex,
    endIndex,
  }
}

function applySharedQueueFilters(query: any, filters: ReviewFilters) {
  let next = query.not("email", "is", null).neq("sent_to_smartlead", true).in("status", ["email_ready", "mgmt_email"])
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

async function countLeadsByStatus(reviewStatus: string, extraFilters?: (query: any) => any) {
  const supabase = createAdminClient()
  let query = supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("review_status", reviewStatus)
    .not("email", "is", null)
    .neq("sent_to_smartlead", true)
    .in("status", ["email_ready", "mgmt_email"])
  if (extraFilters) {
    query = extraFilters(query)
  }
  const { count, error } = await query
  if (error) {
    throw new Error(error.message)
  }
  return count || 0
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

export async function getDashboardData() {
  await maybeFreshenPendingSmartlead(15)
  const [unreviewed, waitingOwner, flagged, ready, pendingExport, sent, jobs, events, requireOwnerApproval] = await Promise.all([
    countLeadsByStatus("unreviewed"),
    countLeadsByStatus("va_approved"),
    countLeadsByStatus("flagged"),
    countLeadsByStatus("approved"),
    countLeadsByStatus("exported_pending_confirmation"),
    (async () => {
      const supabase = createAdminClient()
      const { count, error } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .not("email", "is", null)
        .eq("sent_to_smartlead", true)
      if (error) {
        throw new Error(error.message)
      }
      return count || 0
    })(),
    getWorkerJobs(),
    getWorkerEvents(12),
    getRequireOwnerApproval(),
  ])

  const latestWithCounts = events.find((event) => event.data?.current_daily_count != null) || null
  const todayEmailCount = Number(latestWithCounts?.data?.current_daily_count || 0)
  const pendingDocCount = Number(latestWithCounts?.data?.pending_doc_jobs || 0)

  return {
    counts: {
      unreviewed,
      waitingOwner,
      flagged,
      ready,
      pendingExport,
      sent,
      todayEmailCount,
      pendingDocCount,
    },
    workerJobs: jobs,
    workerEvents: events,
    requireOwnerApproval,
  }
}

export async function getReviewQueue(filters: ReviewFilters): Promise<ReviewQueueResult> {
  const supabase = createAdminClient()
  const page = normalizePage(filters.page)
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1
  let query = supabase.from("leads").select(LEAD_SELECT, { count: "exact" }).eq("review_status", "unreviewed")
  query = applySharedQueueFilters(query, filters)
  const { data, error, count } = await query
    .order("batch_date", { ascending: false })
    .order("follower_count", { ascending: false })
    .range(from, to)
  if (error) {
    throw new Error(error.message)
  }
  return buildPaginatedResult(castRows<LeadRow>(data), count || 0, page)
}

export async function getOwnerQueue(): Promise<LeadRow[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("leads")
    .select(LEAD_SELECT)
    .in("review_status", ["va_approved", "flagged"])
    .neq("sent_to_smartlead", true)
    .not("email", "is", null)
    .order("reviewed_at", { ascending: false })
    .limit(150)
  if (error) {
    throw new Error(error.message)
  }
  return castRows<LeadRow>(data)
}

export async function getReadyForSmartlead(): Promise<LeadRow[]> {
  await maybeFreshenPendingSmartlead(15)
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("leads")
    .select(LEAD_SELECT)
    .eq("review_status", "approved")
    .neq("sent_to_smartlead", true)
    .not("email", "is", null)
    .order("reviewed_at", { ascending: false })
    .limit(250)
  if (error) {
    throw new Error(error.message)
  }
  return castRows<LeadRow>(data)
}

export async function getExportHistory() {
  await maybeFreshenPendingSmartlead(25)
  const supabase = createAdminClient()
  const [{ data: pending, error: pendingError }, { data: sent, error: sentError }] = await Promise.all([
    supabase
      .from("leads")
      .select(LEAD_SELECT)
      .eq("review_status", "exported_pending_confirmation")
      .neq("sent_to_smartlead", true)
      .not("email", "is", null)
      .order("exported_at", { ascending: false })
      .limit(150),
    supabase
      .from("leads")
      .select(LEAD_SELECT)
      .eq("sent_to_smartlead", true)
      .not("exported_at", "is", null)
      .order("smartlead_sent_at", { ascending: false })
      .limit(150),
  ])
  if (pendingError) {
    throw new Error(pendingError.message)
  }
  if (sentError) {
    throw new Error(sentError.message)
  }

  const pendingRows = castRows<LeadRow>(pending)
  const sentRows = castRows<LeadRow>(sent)
  const batchMap = new Map<string, { id: string; exportedAt: string | null; count: number }>()
  for (const row of [...pendingRows, ...sentRows]) {
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
    pending: pendingRows,
    sent: sentRows,
    batches: [...batchMap.values()].sort((a, b) => (b.exportedAt || "").localeCompare(a.exportedAt || "")),
  }
}

export async function getFilesAndStatus() {
  const [files, jobs, events] = await Promise.all([listRecentFiles(), getWorkerJobs(), getWorkerEvents(20)])
  return {
    files,
    workerJobs: jobs,
    workerEvents: events,
  }
}

export async function getRunStatus() {
  const [jobs, events] = await Promise.all([getWorkerJobs(), getWorkerEvents(20)])
  return {
    workerJobs: jobs,
    workerEvents: events,
  }
}
