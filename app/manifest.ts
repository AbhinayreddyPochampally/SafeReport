import type { MetadataRoute } from "next"

// Root web app manifest (served at /manifest.webmanifest).
//
// This is the FALLBACK manifest. The reporter landing at /r/[sap_code]
// overrides it via generateMetadata to point at a per-store manifest
// (see app/(reporter)/r/[sap_code]/manifest.webmanifest/route.ts).
//
// In practice this root manifest only kicks in if someone hits the root
// page directly -- internal testing, QA, deep links to /m or /ho. The
// pilot's real entry point is the QR poster, which always lands on
// /r/[sap_code] where the per-store manifest takes over.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SafeReport",
    short_name: "SafeReport",
    description:
      "Workplace safety incident reporting for ABF retail stores.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F8FAFC",
    theme_color: "#4338CA",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  }
}
