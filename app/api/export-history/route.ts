import { NextResponse } from "next/server"

import { requireApiSession } from "@/lib/auth"
import { getExportHistory } from "@/lib/data"
import { jsonError } from "@/lib/http"

export async function GET(request: Request) {
  try {
    await requireApiSession(["owner"])
    const { searchParams } = new URL(request.url)
    return NextResponse.json(await getExportHistory(searchParams.get("page") || "1"))
  } catch (error) {
    return jsonError(error, 401)
  }
}
