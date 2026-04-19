import { redirect } from "next/navigation"

/**
 * Legacy placeholder. In an earlier revision of the reporter flow the voice
 * recorder lived at /voice. The team later collapsed voice + photo + text
 * into a single Evidence screen (see docs/DESIGN.md update 2026-04-18) and
 * renamed the wheel-picker route to /when. Anyone who lands on /voice —
 * most likely from an old bookmark — gets silently redirected forward.
 *
 * Safe to delete once no one is linking here.
 */
export default function VoiceRedirectPage({
  params,
}: {
  params: { sap_code: string }
}) {
  redirect(`/r/${params.sap_code}/when`)
}
