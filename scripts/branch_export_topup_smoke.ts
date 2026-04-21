import { createClient } from "@supabase/supabase-js"

import { applyReviewAction, exportApprovedLeads, requestDailyTopUp, updateRequireOwnerApproval } from "@/lib/review-actions"
import { getOwnerQueue, getReadyForSmartlead, getRequireOwnerApproval, getReviewQueue } from "@/lib/data"
import { maybeFreshenPendingSmartlead } from "@/lib/smartlead"

const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase env")
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const ownerSession = { email: "smoke-owner@example.com", role: "owner" as const, exp: 9999999999 }
const reviewerSession = { email: "smoke-reviewer@example.com", role: "reviewer" as const, exp: 9999999999 }
const marker = `smoke-${Date.now()}`
const createdLeadIds: string[] = []

type AppSettingRow = { key: string; value: any; updated_at?: string | null }
type CronJobSnapshot = { id: string; last_status: string | null; last_run_at: string | null }

async function insertLead(handle: string, email: string, batchDate: string) {
  const payload = {
    instagram_handle: handle,
    full_name: `Smoke ${handle}`,
    first_name: "Smoke",
    email,
    status: "email_ready",
    review_status: "unreviewed",
    source: "finder_v1",
    source_detail: marker,
    batch_date: batchDate,
    sent_to_smartlead: false,
    first_name_verified: false,
  }
  const { data, error } = await supabase
    .from("leads")
    .insert(payload)
    .select("id,instagram_handle,email,review_status,status,batch_date")
    .single()
  if (error || !data) {
    throw new Error(`Insert failed for ${handle}: ${error?.message}`)
  }
  createdLeadIds.push(data.id)
  return data as { id: string; instagram_handle: string; email: string; review_status: string; status: string; batch_date: string }
}

async function deleteCreatedData() {
  if (createdLeadIds.length) {
    await supabase.from("lead_review_events").delete().in("lead_id", createdLeadIds)
    await supabase.from("leads").delete().in("id", createdLeadIds)
  }
}

async function readAppSetting(key: string): Promise<AppSettingRow | null> {
  const { data, error } = await supabase.from("app_settings").select("key,value,updated_at").eq("key", key).maybeSingle()
  if (error) throw error
  return (data as AppSettingRow | null) || null
}

async function restoreAppSetting(key: string, snapshot: AppSettingRow | null) {
  if (!snapshot) {
    await supabase.from("app_settings").delete().eq("key", key)
    return
  }
  const { error } = await supabase.from("app_settings").upsert(snapshot)
  if (error) throw error
}

async function readCronJob(id: string): Promise<CronJobSnapshot> {
  const { data, error } = await supabase.from("cron_jobs").select("id,last_status,last_run_at").eq("id", id).single()
  if (error || !data) throw new Error(error?.message || `Cron job ${id} not found`)
  return data as CronJobSnapshot
}

async function restoreCronJob(snapshot: CronJobSnapshot) {
  const { error } = await supabase
    .from("cron_jobs")
    .update({ last_status: snapshot.last_status, last_run_at: snapshot.last_run_at })
    .eq("id", snapshot.id)
  if (error) throw error
}

async function countVaApproved() {
  const { count, error } = await supabase.from("leads").select("id", { count: "exact", head: true }).eq("review_status", "va_approved")
  if (error) throw error
  return count || 0
}

async function main() {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Makassar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
  const originalRequireOwnerApproval = await readAppSetting("require_owner_approval")
  const originalTopUp = await readAppSetting("finder_review_top_up_request")
  const reconcileCron = await readCronJob("finder-v1-smartlead-reconcile")
  const dailyCron = await readCronJob("finder-v1-daily-run")
  const originalRequireValue = await getRequireOwnerApproval()

  try {
    const existingVaApproved = await countVaApproved()
    if (existingVaApproved !== 0) {
      throw new Error(`Unsafe to test owner-approval toggle automatically because live va_approved count is ${existingVaApproved}`)
    }

    const saveLead = await insertLead(`${marker}-save`, `${marker}-save@example.com`, today)
    await applyReviewAction(saveLead.id, reviewerSession, {
      action: "save",
      firstName: "Avery",
      note: "Saved before decision",
      emailType: "management",
      gender: "female",
    })
    const saveQueue = await getReviewQueue({ q: `${marker}-save` })
    const savedRow = saveQueue.items[0]
    if (
      !savedRow ||
      savedRow.review_snapshot?.va_note !== "Saved before decision" ||
      savedRow.review_snapshot?.email_type !== "management" ||
      savedRow.review_snapshot?.gender !== "female" ||
      savedRow.first_name !== "Avery"
    ) {
      throw new Error("Save/reload persistence failed")
    }

    await updateRequireOwnerApproval(true, ownerSession)
    const leadOn = await insertLead(`${marker}-on`, `${marker}-on@example.com`, today)
    await applyReviewAction(leadOn.id, reviewerSession, {
      action: "qualified",
      firstName: "Riley",
      note: "Qualified with owner approval on",
      emailType: "personal",
      gender: "female",
      checklist: { authority: "pass", personality: "pass", engagement: "pass" },
    })
    const { data: onRow } = await supabase.from("leads").select("review_status").eq("id", leadOn.id).single()
    if (onRow?.review_status !== "va_approved") {
      throw new Error(`Expected va_approved with owner approval on, got ${onRow?.review_status}`)
    }

    await updateRequireOwnerApproval(false, ownerSession)
    const { data: autoApprovedRow } = await supabase.from("leads").select("review_status").eq("id", leadOn.id).single()
    if (autoApprovedRow?.review_status !== "approved") {
      throw new Error(`Expected existing va_approved lead to auto-approve when toggle turned off, got ${autoApprovedRow?.review_status}`)
    }

    const leadOffQualified = await insertLead(`${marker}-offq`, `${marker}-offq@example.com`, today)
    await applyReviewAction(leadOffQualified.id, reviewerSession, {
      action: "qualified",
      firstName: "Jamie",
      note: "Qualified with owner approval off",
      emailType: "personal",
      gender: "male",
      checklist: { authority: "pass", personality: "pass", engagement: "pass" },
    })
    const { data: offQualifiedRow } = await supabase.from("leads").select("review_status").eq("id", leadOffQualified.id).single()
    if (offQualifiedRow?.review_status !== "approved") {
      throw new Error(`Expected approved with owner approval off, got ${offQualifiedRow?.review_status}`)
    }

    const leadOffFlagged = await insertLead(`${marker}-offf`, `${marker}-offf@example.com`, today)
    await applyReviewAction(leadOffFlagged.id, reviewerSession, {
      action: "not_qualified",
      firstName: "Morgan",
      note: "Still not qualified with owner approval off",
      emailType: "management",
      gender: "male",
      checklist: { authority: "fail", personality: "pass", engagement: "pass" },
    })
    const { data: offFlaggedRow } = await supabase.from("leads").select("review_status,status").eq("id", leadOffFlagged.id).single()
    if (offFlaggedRow?.review_status !== "flagged" || offFlaggedRow?.status !== "mgmt_email") {
      throw new Error(`Expected flagged/mgmt_email with owner approval off, got ${JSON.stringify(offFlaggedRow)}`)
    }

    const readyQueue = await getReadyForSmartlead()
    if (!readyQueue.items.some((row) => row.id === leadOffQualified.id)) {
      throw new Error("Qualified lead with owner approval off did not appear in ready queue")
    }
    const ownerQueue = await getOwnerQueue()
    if (!ownerQueue.items.some((row) => row.id === leadOffFlagged.id)) {
      throw new Error("Not-qualified lead with owner approval off did not remain in owner queue")
    }

    const exportLead = await insertLead(`${marker}-export`, `${marker}-export@example.com`, today)
    await supabase
      .from("leads")
      .update({ review_status: "approved", reviewed_at: new Date().toISOString(), reviewed_by: ownerSession.email })
      .eq("id", exportLead.id)
    const exported = await exportApprovedLeads([exportLead.id], ownerSession)
    const { data: exportedRow } = await supabase
      .from("leads")
      .select("review_status,export_batch_id,exported_at,sent_to_smartlead,smartlead_sent_at")
      .eq("id", exportLead.id)
      .single()
    if (exportedRow?.review_status !== "exported_pending_confirmation" || !exportedRow.export_batch_id || !exported.csv.includes(`${marker}-export@example.com`)) {
      throw new Error("Export step failed to move lead into exported_pending_confirmation correctly")
    }

    const { data: pendingRowsBeforeFreshen } = await supabase
      .from("leads")
      .select("id,email,review_status,smartlead_sent_at,sent_to_smartlead")
      .eq("review_status", "exported_pending_confirmation")
      .neq("sent_to_smartlead", true)
      .is("smartlead_sent_at", null)
      .not("email", "is", null)
      .limit(5)

    await supabase.from("cron_jobs").update({ last_run_at: "2026-04-01T00:00:00Z" }).eq("id", "finder-v1-smartlead-reconcile")
    const originalFetch = global.fetch
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
      if (url.includes("server.smartlead.ai")) {
        return new Response(JSON.stringify({ id: "fake-smartlead-id", campaign_id: "campaign-123" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      }
      return originalFetch(input as any, init)
    }
    try {
      const freshen = await maybeFreshenPendingSmartlead(25)
      if (freshen.confirmed < 1) {
        const { data: rowAfterFailedFreshen } = await supabase
          .from("leads")
          .select("id,review_status,sent_to_smartlead,smartlead_sent_at,smartlead_campaign_id")
          .eq("id", exportLead.id)
          .single()
        throw new Error(
          `Expected maybeFreshenPendingSmartlead to confirm at least one exported lead, got ${JSON.stringify({
            freshen,
            pendingRowsBeforeFreshen,
            rowAfterFailedFreshen,
          })}`,
        )
      }
    } finally {
      global.fetch = originalFetch
      await restoreCronJob(reconcileCron)
    }
    const { data: confirmedRow } = await supabase
      .from("leads")
      .select("review_status,sent_to_smartlead,smartlead_sent_at,smartlead_campaign_id")
      .eq("id", exportLead.id)
      .single()
    if (confirmedRow?.sent_to_smartlead !== true || !confirmedRow.smartlead_sent_at || confirmedRow.smartlead_campaign_id !== "campaign-123") {
      throw new Error(`Smartlead confirmation path failed: ${JSON.stringify(confirmedRow)}`)
    }

    await supabase.from("app_settings").upsert({
      key: "finder_review_top_up_request",
      value: {
        day: today,
        status: "requested",
        request_id: `${marker}-request`,
        requested_at: new Date().toISOString(),
        requested_by: ownerSession.email,
      },
      updated_at: new Date().toISOString(),
    })
    let activeRequestBlocked = false
    try {
      await requestDailyTopUp(reviewerSession)
    } catch (error) {
      if (String(error).includes("already active for today")) {
        activeRequestBlocked = true
      }
    }
    if (!activeRequestBlocked) {
      throw new Error("Active top-up request guard failed")
    }
    await restoreAppSetting("finder_review_top_up_request", originalTopUp)

    await supabase.from("cron_jobs").update({ last_status: "running" }).eq("id", "finder-v1-daily-run")
    let runningBlocked = false
    try {
      await requestDailyTopUp(reviewerSession)
    } catch (error) {
      if (String(error).includes("scraper is already running")) {
        runningBlocked = true
      }
    }
    if (!runningBlocked) {
      throw new Error("Daily-run running guard failed")
    }
    await restoreCronJob(dailyCron)

    console.log(
      JSON.stringify(
        {
          status: "ok",
          originalRequireOwnerApproval: originalRequireValue,
          savePersistence: true,
          requireOwnerApprovalOnPath: true,
          requireOwnerApprovalOffPath: true,
          notQualifiedOffPath: true,
          exportTransition: true,
          smartleadRefreshSimulation: true,
          topUpActiveRequestGuard: true,
          topUpRunningGuard: true,
        },
        null,
        2,
      ),
    )
  } finally {
    await restoreAppSetting("require_owner_approval", originalRequireOwnerApproval)
    await restoreAppSetting("finder_review_top_up_request", originalTopUp)
    await restoreCronJob(reconcileCron)
    await restoreCronJob(dailyCron)
    await deleteCreatedData()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
