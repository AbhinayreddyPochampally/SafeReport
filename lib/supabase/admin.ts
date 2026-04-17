import "server-only"
import { createClient } from "@supabase/supabase-js"

/**
 * Service-role Supabase client. Bypasses RLS entirely.
 *
 * SAFETY:
 *  - `import "server-only"` at the top — Next.js errors the build if this
 *    module is ever imported from a client bundle.
 *  - Only for use in /app/api/* route handlers and server-side scripts.
 *  - NEVER import from a Client Component.
 */
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error(
      "Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY",
    )
  }

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
