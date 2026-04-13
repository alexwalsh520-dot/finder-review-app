import { NextResponse } from "next/server"

import { requireApiSession } from "@/lib/auth"
import { getReadyForSmartlead } from "@/lib/data"
import { jsonError } from "@/lib/http"

export async function GET() {
  try {
    await requireApiSession(["owner"])
    return NextResponse.json(await getReadyForSmartlead())
  } catch (error) {
    return jsonError(error, 401)
  }
}
