import { NextResponse } from "next/server"

import { getSession } from "@/lib/auth"
import { jsonError } from "@/lib/http"
import { updateRequireOwnerApproval } from "@/lib/review-actions"

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) {
      return jsonError(new Error("Authentication required."), 401)
    }
    const body = await request.json()
    await updateRequireOwnerApproval(Boolean(body.value), session)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return jsonError(error, 400)
  }
}
