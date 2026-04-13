import { NextResponse } from "next/server"

import { requireApiSession } from "@/lib/auth"
import { getOptionalEnv } from "@/lib/env"
import { jsonError } from "@/lib/http"
import { createAdminClient } from "@/lib/supabase-admin"

export async function GET(request: Request) {
  try {
    await requireApiSession()
    const { searchParams } = new URL(request.url)
    const path = searchParams.get("path") || ""
    if (!path) {
      return jsonError(new Error("Missing path."), 400)
    }
    const bucket = getOptionalEnv("FINDER_OUTPUT_BUCKET") || "finder-outputs"
    const supabase = createAdminClient()
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60)
    if (error || !data?.signedUrl) {
      throw new Error(error?.message || "Could not sign file URL.")
    }
    return NextResponse.redirect(data.signedUrl)
  } catch (error) {
    return jsonError(error, 401)
  }
}
