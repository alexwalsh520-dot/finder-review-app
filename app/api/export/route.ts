import { NextResponse } from "next/server"

import { getSession } from "@/lib/auth"
import { jsonError } from "@/lib/http"
import { exportApprovedLeads } from "@/lib/review-actions"

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) {
      return jsonError(new Error("Authentication required."), 401)
    }
    const body = await request.json()
    const result = await exportApprovedLeads(
      {
        filters: body.filters || null,
        leadIds: body.leadIds || [],
        columns: body.columns || [],
      },
      session,
    )
    return new NextResponse(result.csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${result.filename}"`,
      },
    })
  } catch (error) {
    return jsonError(error, 400)
  }
}
