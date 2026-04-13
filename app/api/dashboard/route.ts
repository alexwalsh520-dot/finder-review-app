import { NextResponse } from "next/server"

import { requireApiSession } from "@/lib/auth"
import { getDashboardData } from "@/lib/data"
import { jsonError } from "@/lib/http"

export async function GET() {
  try {
    await requireApiSession()
    return NextResponse.json(await getDashboardData())
  } catch (error) {
    return jsonError(error, 401)
  }
}
