"use client"

import { createBrowserClient } from "@supabase/ssr"

/**
 * Browser-side Supabase client for use inside Client Components.
 * Uses the anon key — RLS applies.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
