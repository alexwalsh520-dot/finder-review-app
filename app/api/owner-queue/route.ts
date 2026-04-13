import { NextResponse } from "next/server"

import { requireApiSession } from "@/lib/auth"
import { getOwnerQueue } from "@/lib/data"
import { jsonError } from "@/lib/http"

export async function GET() {
  try {
    await requireApiSession(["owner"])
    return NextResponse.json(await getOwnerQueue())
  } catch (error) {
    return jsonError(error, 401)
  }
}
