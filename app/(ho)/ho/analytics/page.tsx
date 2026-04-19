import { requireHoSession } from "@/lib/ho-auth"
import { AnalyticsClient } from "./analytics-client"

export const dynamic = "force-dynamic"

/**
 * HO analytics — /ho/analytics.
 *
 * Thin server shell: guards the session, hands off to the client component
 * which does all the data fetching against /api/ho-analytics. We keep it
 * client-side because the filter chips (brand / city / category toggles)
 * drive immediate re-fetches without a full route reload.
 */
export default async function HoAnalyticsPage() {
  await requireHoSession("/ho/analytics")
  return <AnalyticsClient />
}
