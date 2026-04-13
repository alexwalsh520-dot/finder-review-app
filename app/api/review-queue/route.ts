import { NextResponse } from "next/server"

import { requireApiSession } from "@/lib/auth"
import { getReviewQueue } from "@/lib/data"
import { jsonError } from "@/lib/http"

export async function GET(request: Request) {
  try {
    await requireApiSession()
    const { searchParams } = new URL(request.url)
    const data = await getReviewQueue({
      q: searchParams.get("q") || "",
      batchDate: searchParams.get("batchDate") || "",
      emailType: searchParams.get("emailType") || "",
      source: searchParams.get("source") || "",
    })
    return NextResponse.json(data)
  } catch (error) {
    return jsonError(error, 401)
  }
}
