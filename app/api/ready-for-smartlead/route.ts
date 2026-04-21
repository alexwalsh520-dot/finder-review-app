import { NextResponse } from "next/server"

import { requireApiSession } from "@/lib/auth"
import { getReadyForSmartlead } from "@/lib/data"
import { jsonError } from "@/lib/http"

export async function GET(request: Request) {
  try {
    await requireApiSession(["owner"])
    const { searchParams } = new URL(request.url)
    return NextResponse.json(
      await getReadyForSmartlead({
        page: searchParams.get("page") || "1",
        gender: searchParams.get("gender") || undefined,
        coaching: searchParams.get("coaching") || undefined,
      }),
    )
  } catch (error) {
    return jsonError(error, 401)
  }
}
