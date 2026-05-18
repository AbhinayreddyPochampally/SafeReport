import { redirect } from "next/navigation"

/**
 * Legacy route — superseded by mig 007 (AI classification). The reporter
 * sub-category grid no longer exists; any stale link bounces to the wheel
 * picker, which is the new first step of the flow.
 */
export default function CategoryKindRedirect({
  params,
}: {
  params: { sap_code: string; kind: string }
}) {
  redirect(`/r/${params.sap_code}/photo`)
}
