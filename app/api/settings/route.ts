import { NextResponse } from "next/server"

import { requireApiSession } from "@/lib/auth"
import { getRequireOwnerApproval } from "@/lib/data"
import { jsonError } from "@/lib/http"

export async function GET() {
  try {
    await requireApiSession()
    return NextResponse.json({
      requireOwnerApproval: await getRequireOwnerApproval(),
    })
  } catch (error) {
    return jsonError(error, 401)
  }
}
