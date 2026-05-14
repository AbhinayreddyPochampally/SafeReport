import type { Metadata, Viewport } from "next"
import { dmSans, plex } from "./fonts"
import "./globals.css"

export const metadata: Metadata = {
  title: "SafeReport",
  description:
    "Workplace safety incident reporting for Aditya Birla Fashion & Retail.",
  // iOS standalone PWA opt-in.
  //
  // Without these, an iPhone that runs Share → Add to Home Screen still
  // creates an icon, but tapping it opens the page inside Safari chrome
  // (URL bar visible). The home-screen install never reaches "real PWA"
  // state, and `window.navigator.standalone === true` never resolves, so
  // our install-prompt's standalone detection treats the install as
  // pending forever. Setting capable:true flips iOS into proper
  // standalone mode and unblocks both the user experience and our state
  // machine. Chromium ignores these tags (it uses the web manifest).
  appleWebApp: {
    capable: true,
    title: "SafeReport",
    statusBarStyle: "default",
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1E1B4B",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${dmSans.variable} ${plex.variable}`}>
      <body>{children}</body>
    </html>
  )
}
