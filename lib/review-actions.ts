import "server-only"

import { randomUUID } from "crypto"

import { createAdminClient } from "@/lib/supabase-admin"
import { getRequireOwnerApproval } from "@/lib/data"
import type { AppRole, LeadRow, ReviewStatus, SessionPayload } from "@/lib/types"

const REVIEW_SELECT = "id,first_name,full_name,email,instagram_handle,review_status,review_notes,sent_to_smartlead,smartlead_sent_at"

type ReviewAction =
  | "save"
  | "va_approve"
  | "flag"
  | "owner_approve"
  | "reject"
  | "reopen"

function requireRole(session: SessionPayload, role: AppRole) {
  if (session.role !== role) {
    throw new Error("You do not have permission to do that.")
  }
}

function cleanText(value: string | null | undefined): string {
  return (value || "").trim()
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
) {
  const supabase = createAdminClient()
  const { error } = await supabase.from("lead_review_events").insert({
    lead_id: leadId,
    actor_role: session.role,
    actor_identifier: session.email,
    action,
    payload,
  })
  if (error) {
    throw new Error(error.message)
  }
}

export async function applyReviewAction(
  leadId: string,
  session: SessionPayload,
  input: { action: ReviewAction; firstName?: string; note?: string },
) {
  const supabase = createAdminClient()
  const lead = await loadLead(leadId)
  const note = cleanText(input.note)
  const firstName = fallbackFirstName(lead, input.firstName || "")
  const now = new Date().toISOString()
  const patch: Record<string, string | boolean | null> = {
    first_name: firstName || null,
  }

  if (input.action === "save") {
    patch.review_notes = note || null
  } else if (input.action === "va_approve") {
    requireRole(session, "reviewer")
    const requireOwnerApproval = await getRequireOwnerApproval()
    patch.review_status = requireOwnerApproval ? "va_approved" : "approved"
    patch.review_notes = note || null
    patch.reviewed_at = now
    patch.reviewed_by = session.email
    patch.first_name_verified = true
  } else if (input.action === "flag") {
    if (!note) {
      throw new Error("A note is required when flagging a lead.")
    }
    patch.review_status = "flagged"
    patch.review_notes = note
    patch.reviewed_at = now
    patch.reviewed_by = session.email
    patch.first_name_verified = false
  } else if (input.action === "owner_approve") {
    requireRole(session, "owner")
    patch.review_status = "approved"
    patch.review_notes = note || null
    patch.reviewed_at = now
    patch.reviewed_by = session.email
    patch.first_name_verified = true
  } else if (input.action === "reject") {
    requireRole(session, "owner")
    if (!note) {
      throw new Error("A note is required when rejecting a lead.")
    }
    patch.review_status = "rejected"
    patch.review_notes = note
    patch.reviewed_at = now
    patch.reviewed_by = session.email
    patch.first_name_verified = false
  } else if (input.action === "reopen") {
    requireRole(session, "owner")
    patch.review_status = "unreviewed"
    patch.review_notes = note || lead.review_notes || null
    patch.reviewed_at = null
    patch.reviewed_by = null
    patch.first_name_verified = false
  }

  const { error } = await supabase.from("leads").update(patch).eq("id", leadId)
  if (error) {
    throw new Error(error.message)
  }
  await insertReviewEvent(leadId, session, input.action, {
    first_name: firstName || null,
    note: note || null,
    previous_status: lead.review_status,
    next_status: (patch.review_status as ReviewStatus | undefined) || lead.review_status,
  })
}

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, "\"\"")}"`
  }
  return value
}

export async function exportApprovedLeads(leadIds: string[], session: SessionPayload) {
  requireRole(session, "owner")
  if (!leadIds.length) {
    throw new Error("Choose at least one lead to export.")
  }
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("leads")
    .select("id,first_name,full_name,email,instagram_handle,review_status,sent_to_smartlead,smartlead_sent_at")
    .in("id", leadIds)
    .eq("review_status", "approved")
    .neq("sent_to_smartlead", true)
    .not("email", "is", null)

  if (error) {
    throw new Error(error.message)
  }
  const rows = ((data as LeadRow[] | null) || []) as LeadRow[]
  if (!rows.length) {
    throw new Error("There are no approved unsent leads in this selection.")
  }

  const exportBatchId = randomUUID()
  const exportedAt = new Date().toISOString()
  for (const row of rows) {
    const { error: updateError } = await supabase
      .from("leads")
      .update({
        review_status: "exported_pending_confirmation",
        exported_at: exportedAt,
        export_batch_id: exportBatchId,
      })
      .eq("id", row.id)
    if (updateError) {
      throw new Error(updateError.message)
    }
    await insertReviewEvent(row.id, session, "export", {
      export_batch_id: exportBatchId,
      exported_at: exportedAt,
      email: row.email,
      instagram_handle: row.instagram_handle,
    })
  }

  const header = ["first_name", "email", "instagram_username"]
  const lines = [
    header.join(","),
    ...rows.map((row) =>
      [
        escapeCsv(fallbackFirstName(row, "")),
        escapeCsv(row.email || ""),
        escapeCsv((row.instagram_handle || "").replace(/^@/, "")),
      ].join(","),
    ),
  ]
  return {
    batchId: exportBatchId,
    filename: `finder_smartlead_export_${exportBatchId}.csv`,
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
  const { data: leadsToAutoApprove } = await supabase
    .from("leads")
    .select("id")
    .eq("review_status", "va_approved")
    .limit(500)
  if (!value && leadsToAutoApprove?.length) {
    const ids = leadsToAutoApprove.map((row) => row.id)
    await supabase.from("leads").update({ review_status: "approved" }).in("id", ids)
  }
}
