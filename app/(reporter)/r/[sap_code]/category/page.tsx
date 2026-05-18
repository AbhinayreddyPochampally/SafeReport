import { redirect } from "next/navigation"

/**
 * Legacy route — superseded by mig 007 (AI classification). The reporter
 * triage screen no longer exists; any stale link or back-button stomp
 * bounces to the wheel picker, which is the new first step of the flow.
 *
 * Keeping this file as a redirect rather than deleting the route lets us
 * land the change without breaking any cached service-worker entries or
 * tab-history entries that pilot reporters' phones may still hold.
 */
export default function CategoryRedirect({
  params,
}: {
  params: { sap_code: string }
}) {
  redirect(`/r/${params.sap_code}/photo`)
}
