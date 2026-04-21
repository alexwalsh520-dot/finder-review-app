import { NextResponse } from "next/server"

import { getSession } from "@/lib/auth"
import { jsonError } from "@/lib/http"
import { applyReviewAction } from "@/lib/review-actions"

export async function POST(request: Request, { params }: { params: { leadId: string } }) {
  try {
    const session = await getSession()
    if (!session) {
      return jsonError(new Error("Authentication required."), 401)
    }
    const body = await request.json()
    await applyReviewAction(params.leadId, session, {
      action: body.action,
      firstName: body.firstName,
      email: body.email,
      note: body.note,
      checklist: body.checklist,
      emailType: body.emailType,
      gender: body.gender,
      hasCoaching: body.hasCoaching,
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return jsonError(error, 400)
  }
}
