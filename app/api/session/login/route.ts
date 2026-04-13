import { NextResponse } from "next/server"

import { authenticateUser, setSessionCookie } from "@/lib/auth"
import { jsonError } from "@/lib/http"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const session = await authenticateUser(body.email || "", body.password || "")
    if (!session) {
      return jsonError(new Error("Invalid email or password."), 401)
    }
    await setSessionCookie(session)
    return NextResponse.json({ ok: true, role: session.role, email: session.email })
  } catch (error) {
    return jsonError(error)
  }
}
