import "server-only"

import { createAdminClient } from "@/lib/supabase-admin"
import { getOptionalEnv } from "@/lib/env"

const SMARTLEAD_BASE = "https://server.smartlead.ai/api/v1"
const WORKER_RECONCILE_JOB_ID = "finder-v1-smartlead-reconcile"

type SmartleadLead = {
  id?: string | number
  campaign_id?: string | number | null
  lead_campaign_data?: Array<{ campaign_id?: string | number | null }>
}

function extractCampaignId(payload: SmartleadLead): string | null {
  const fromMembership = payload.lead_campaign_data?.[0]?.campaign_id
  if (fromMembership != null) {
    return String(fromMembership)
  }
  if (payload.campaign_id != null) {
    return String(payload.campaign_id)
  }
  return null
}

async function lookupSmartleadLeadByEmail(email: string): Promise<SmartleadLead | null> {
  const apiKey = getOptionalEnv("SMARTLEAD_API_KEY")
  if (!apiKey || !email) {
    return null
  }
  const url = `${SMARTLEAD_BASE}/leads/?api_key=${encodeURIComponent(apiKey)}&email=${encodeURIComponent(email)}`
  const response = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      "user-agent": "finder-review-app/1.0",
    },
    cache: "no-store",
  })
  if (!response.ok) {
    throw new Error(`Smartlead lookup failed: ${response.status}`)
  }
  return (await response.json()) as SmartleadLead
}

function lastRunIsFresh(lastRunAt: string | null, minutes: number): boolean {
  if (!lastRunAt) {
    return false
  }
  const last = new Date(lastRunAt)
  if (Number.isNaN(last.getTime())) {
    return false
  }
  return Date.now() - last.getTime() < minutes * 60 * 1000
}

export async function maybeFreshenPendingSmartlead(limit = 25) {
  const apiKey = getOptionalEnv("SMARTLEAD_API_KEY")
  if (!apiKey) {
    return { refreshed: false, reason: "missing_key", confirmed: 0 }
  }

  const supabase = createAdminClient()
  const { data: workerJob, error: workerJobError } = await supabase
    .from("cron_jobs")
    .select("last_run_at")
    .eq("id", WORKER_RECONCILE_JOB_ID)
    .maybeSingle()
  if (workerJobError) {
    return { refreshed: false, reason: "job_lookup_failed", confirmed: 0 }
  }

  if (lastRunIsFresh(workerJob?.last_run_at ?? null, 8)) {
    return { refreshed: false, reason: "worker_recent", confirmed: 0 }
  }

  const { data: rows, error } = await supabase
    .from("leads")
    .select("id,email,instagram_handle,review_status,smartlead_sent_at")
    .eq("review_status", "exported_pending_confirmation")
    .neq("sent_to_smartlead", true)
    .is("smartlead_sent_at", null)
    .not("email", "is", null)
    .limit(limit)

  if (error) {
    return { refreshed: false, reason: "pending_lookup_failed", confirmed: 0 }
  }

  const pendingRows = Array.isArray(rows) ? rows : rows ? [rows] : []
  let confirmed = 0
  for (const row of pendingRows) {
    try {
      const email = (row.email || "").trim().toLowerCase()
      if (!email) {
        continue
      }
      const smartleadLead = await lookupSmartleadLeadByEmail(email)
      if (!smartleadLead?.id) {
        continue
      }
      const campaignId = extractCampaignId(smartleadLead)
      const patch: Record<string, string | boolean> = {
        sent_to_smartlead: true,
        smartlead_sent_at: new Date().toISOString(),
        review_status: "approved",
      }
      if (campaignId) {
        patch.smartlead_campaign_id = campaignId
      }
      const { error: updateError } = await supabase.from("leads").update(patch).eq("id", row.id)
      if (updateError) {
        continue
      }
      confirmed += 1
      try {
        await supabase.from("lead_review_events").insert({
          lead_id: row.id,
          actor_role: "app_server",
          actor_identifier: "finder-review-app",
          action: "smartlead_confirmed",
          payload: {
            email,
            instagram_handle: row.instagram_handle,
            campaign_id: campaignId,
          },
        })
      } catch {
        // Confirmation already landed on the lead row; do not treat audit-event failure as a sync failure.
      }
    } catch {
      continue
    }
  }

  return {
    refreshed: true,
    reason: "app_refresh",
    confirmed,
  }
}
