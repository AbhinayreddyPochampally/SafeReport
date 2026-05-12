import type { MetadataRoute } from "next"

// Web app manifest. Next 14 picks this up at /manifest.webmanifest. We don't
// ship custom icons yet (favicon only) — the install banner uses the
// default Next.js favicon, which is good enough for the pilot. Add proper
// 192/512 PNGs to /public/icons/ later and reference them in `icons` below.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SafeReport",
    short_name: "SafeReport",
    description:
      "Workplace safety incident reporting for ABFRL retail stores.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F8FAFC",
    theme_color: "#4338CA",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  }
}
