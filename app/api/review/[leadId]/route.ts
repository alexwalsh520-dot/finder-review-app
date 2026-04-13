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
      note: body.note,
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return jsonError(error, 400)
  }
}
