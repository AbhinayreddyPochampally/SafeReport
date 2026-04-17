import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { cookies } from "next/headers"

/**
 * Server-side Supabase client for React Server Components and Route Handlers.
 *
 * Uses the anon key — RLS policies apply. Cookie-aware via next/headers, so
 * an authenticated HO session flows through naturally.
 *
 * Do NOT use this from the browser; it reads the cookie store.
 */
export function createSupabaseServerClient() {
  const cookieStore = cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch {
            // set() throws in Server Components; ignore, middleware handles it.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options })
          } catch {
            // same — ignore in Server Components.
          }
        },
      },
    },
  )
}
