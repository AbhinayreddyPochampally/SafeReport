import { DM_Sans, IBM_Plex_Sans } from "next/font/google"

// Body face — DM Sans 400/500/700.
export const dmSans = DM_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "700"],
  variable: "--font-sans",
  display: "swap",
})

// Display face — IBM Plex Sans 500/600/700.
export const plex = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
})
