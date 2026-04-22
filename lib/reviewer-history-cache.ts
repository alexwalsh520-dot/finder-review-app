import "server-only"

import { createAdminClient } from "@/lib/supabase-admin"

const REVIEWER_HISTORY_CACHE_KEY_PREFIX = "reviewer_history:"
const REVIEWER_HISTORY_CACHE_VERSION = 1
const REVIEWER_HISTORY_CACHE_LIMIT = 5000

export type ReviewerHistoryAction = "save" | "qualified" | "not_qualified"

export type ReviewerHistoryCacheItem = {
  lead_id: string
  created_at: string
  action: ReviewerHistoryAction
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function buildReviewerHistoryCacheKey(email: string) {
  return `${REVIEWER_HISTORY_CACHE_KEY_PREFIX}${normalizeEmail(email)}`
}

function parseReviewerHistoryCache(value: unknown): ReviewerHistoryCacheItem[] {
  const rawItems = Array.isArray((value as { items?: unknown[] } | null)?.items)
    ? ((value as { items: unknown[] }).items || [])
    : []
  const items: ReviewerHistoryCacheItem[] = []
  const seenLeadIds = new Set<string>()

  for (const rawItem of rawItems) {
    const item = rawItem as Partial<ReviewerHistoryCacheItem> | null
    const leadId = typeof item?.lead_id === "string" ? item.lead_id.trim() : ""
    const createdAt = typeof item?.created_at === "string" ? item.created_at.trim() : ""
    const action = item?.action
    if (!leadId || !createdAt || seenLeadIds.has(leadId)) {
      continue
    }
    if (action !== "save" && action !== "qualified" && action !== "not_qualified") {
      continue
    }
    seenLeadIds.add(leadId)
    items.push({
      lead_id: leadId,
      created_at: createdAt,
      action,
    })
  }

  return items
}

export async function readReviewerHistoryCache(reviewerEmail: string): Promise<ReviewerHistoryCacheItem[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", buildReviewerHistoryCacheKey(reviewerEmail))
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return parseReviewerHistoryCache(data?.value)
}

export async function recordReviewerHistoryCacheItem(reviewerEmail: string, item: ReviewerHistoryCacheItem) {
  const supabase = createAdminClient()
  const key = buildReviewerHistoryCacheKey(reviewerEmail)
  const { data, error } = await supabase.from("app_settings").select("value").eq("key", key).maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  const existing = parseReviewerHistoryCache(data?.value)
  const nextItems = [item, ...existing.filter((entry) => entry.lead_id !== item.lead_id)].slice(0, REVIEWER_HISTORY_CACHE_LIMIT)
  const { error: upsertError } = await supabase.from("app_settings").upsert({
    key,
    value: {
      version: REVIEWER_HISTORY_CACHE_VERSION,
      items: nextItems,
    },
  })

  if (upsertError) {
    throw new Error(upsertError.message)
  }
}
