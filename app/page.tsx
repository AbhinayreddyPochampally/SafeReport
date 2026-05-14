import { redirect } from "next/navigation"

// Bare URL is not a real entry point for any user.
//
// Reporters arrive via QR posters at /r/[sap_code]. Managers go to
// /m/[sap_code] from their training link. HO goes to /ho.
//
// Anyone who lands on / either typed the domain by hand (very rare in
// the pilot) or is hitting an installed PWA that was set up before the
// per-store manifest landed (in which case start_url is still "/").
//
// In both cases, the right behavior is the same as the per-store install
// icon: drop them on the demo store's reporter landing. From there a
// reporter can either submit a report against the demo store (fine for
// internal testing) or scan their real QR to land on their actual store.
export default function RootPage() {
  redirect("/r/PNT-MUM-047")
}
