import "server-only"

import { createClient } from "@supabase/supabase-js"

import { getEnv } from "@/lib/env"

export function createAdminClient() {
  return createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
