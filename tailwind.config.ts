import type { Config } from "tailwindcss"

/**
 * SafeReport — Tailwind v6 palette.
 *
 * Colours are OVERRIDDEN (not extended) so Tailwind's default green / red /
 * rose / emerald / lime / crimson scales are not reachable by class name.
 * See docs/VISUAL_LANGUAGE.md for the full token map.
 */
const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    colors: {
      transparent: "transparent",
      current: "currentColor",
      inherit: "inherit",
      white: "#ffffff",
      black: "#000000",

      // Primary / brand
      indigo: {
        900: "#1E1B4B",
        700: "#4338CA",
        500: "#6366F1",
        100: "#E0E7FF",
      },

      // Neutrals
      slate: {
        900: "#0F172A",
        700: "#334155",
        600: "#475569",
        400: "#94A3B8",
        200: "#E2E8F0",
        100: "#F1F5F9",
        50: "#F8FAFC",
      },

      // Incidents — warm axis
      amber: {
        700: "#B45309",
        500: "#F59E0B",
        100: "#FEF3C7",
      },

      // Status — Closed (replaces green)
      teal: {
        700: "#0F766E",
        500: "#14B8A6",
        100: "#CCFBF1",
      },

      // Status — Awaiting HO
      sky: {
        700: "#0369A1",
        500: "#0EA5E9",
        100: "#E0F2FE",
      },

      // Status — Returned (replaces red)
      orange: {
        700: "#C2410C",
        100: "#FFEDD5",
      },

      // Warm neutrals
      stone: {
        100: "#F5F5F4",
        50: "#FAFAF9",
      },
    },
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
}

export default config
