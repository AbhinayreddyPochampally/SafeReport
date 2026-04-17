import type { Metadata, Viewport } from "next"
import { dmSans, plex } from "./fonts"
import "./globals.css"

export const metadata: Metadata = {
  title: "SafeReport",
  description:
    "Workplace safety incident reporting for Aditya Birla Fashion & Retail.",
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
