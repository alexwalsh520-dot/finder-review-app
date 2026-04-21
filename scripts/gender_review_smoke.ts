import { randomUUID } from "crypto"

import { getReviewQueue } from "@/lib/data"
import { applyReviewAction } from "@/lib/review-actions"
import { createAdminClient } from "@/lib/supabase-admin"
import type { SessionPayload } from "@/lib/types"

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

async function insertLead(handle: string, email: string) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("leads")
    .insert({
      instagram_handle: handle,
      instagram_url: `https://instagram.com/${handle}`,
      full_name: `${handle} Test`,
      email,
      status: "email_ready",
      review_status: "unreviewed",
      source: "finder_v1",
      source_detail: "gender smoke",
      batch_date: todayBusinessDate(),
      follower_count: 12345,
    })
    .select("id")
    .single()
  if (error || !data) {
    throw new Error(error?.message || "Could not create smoke-test lead")
  }
  return data.id as string
}

async function deleteLead(leadId: string) {
  const supabase = createAdminClient()
  await supabase.from("lead_review_events").delete().eq("lead_id", leadId)
  await supabase.from("leads").delete().eq("id", leadId)
}

async function main() {
  const reviewerSession: SessionPayload = {
    email: "reviewer-smoke@test.local",
    role: "reviewer",
    exp: Math.floor(Date.now() / 1000) + 60 * 60,
  }
  const marker = `gender-smoke-${Date.now()}-${randomUUID().slice(0, 8)}`
  const saveLeadId = await insertLead(`${marker}-save`, `${marker}-save@example.com`)
  const qualifyLeadId = await insertLead(`${marker}-qualify`, `${marker}-qualify@example.com`)

  try {
    await applyReviewAction(saveLeadId, reviewerSession, {
      action: "save",
      firstName: "Avery",
      note: "Saved with gender",
      emailType: "management",
      gender: "female",
    })

    const queue = await getReviewQueue({ q: marker })
    const saved = queue.items.find((row) => row.id === saveLeadId)
    if (!saved) {
      throw new Error("Saved lead did not show up in the review queue")
    }
    if (
      saved.first_name !== "Avery" ||
      saved.review_snapshot?.va_note !== "Saved with gender" ||
      saved.review_snapshot?.email_type !== "management" ||
      saved.review_snapshot?.gender !== "female"
    ) {
      throw new Error(`Saved lead did not persist expected review data: ${JSON.stringify(saved.review_snapshot)}`)
    }

    let missingGenderBlocked = false
    try {
      await applyReviewAction(qualifyLeadId, reviewerSession, {
        action: "qualified",
        firstName: "Jordan",
        note: "Should fail without gender",
        emailType: "personal",
        checklist: { authority: "pass", personality: "pass", engagement: "pass" },
      })
    } catch (error) {
      missingGenderBlocked = error instanceof Error && error.message.includes("Male or Female")
    }
    if (!missingGenderBlocked) {
      throw new Error("Qualified did not block when gender was missing")
    }

    await applyReviewAction(qualifyLeadId, reviewerSession, {
      action: "qualified",
      firstName: "Jordan",
      note: "Qualified with gender",
      emailType: "personal",
      gender: "male",
      checklist: { authority: "pass", personality: "pass", engagement: "pass" },
    })

    const supabase = createAdminClient()
    const { data: leadRow, error: leadError } = await supabase
      .from("leads")
      .select("review_status,first_name,review_notes")
      .eq("id", qualifyLeadId)
      .single()
    if (leadError || !leadRow) {
      throw new Error(leadError?.message || "Could not reload qualified lead")
    }
    if (!["va_approved", "approved"].includes(String(leadRow.review_status))) {
      throw new Error(`Qualified lead landed in the wrong state: ${JSON.stringify(leadRow)}`)
    }

    const { data: eventRow, error: eventError } = await supabase
      .from("lead_review_events")
      .select("payload")
      .eq("lead_id", qualifyLeadId)
      .eq("action", "qualified")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (eventError || !eventRow) {
      throw new Error(eventError?.message || "Could not reload qualified event")
    }
    const payload = (eventRow.payload || {}) as Record<string, unknown>
    if (payload.gender !== "male") {
      throw new Error(`Qualified event did not persist gender: ${JSON.stringify(payload)}`)
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          savePersistence: true,
          qualifiedRequiresGender: true,
          qualifiedGenderPersisted: true,
          qualifiedReviewStatus: leadRow.review_status,
        },
        null,
        2,
      ),
    )
  } finally {
    await deleteLead(saveLeadId)
    await deleteLead(qualifyLeadId)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
