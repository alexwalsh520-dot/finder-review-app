import { NextResponse } from "next/server"

import { requireApiSession } from "@/lib/auth"
import { jsonError } from "@/lib/http"
import { requestDailyTopUp } from "@/lib/review-actions"

export async function POST() {
  try {
    const session = await requireApiSession()
    const result = await requestDailyTopUp(session)
    return NextResponse.json({ ok: true, request: result })
  } catch (error) {
    return jsonError(error, 400)
  }
}
