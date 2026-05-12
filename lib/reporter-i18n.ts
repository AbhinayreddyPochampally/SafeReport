/**
 * Tiny localization map for the reporter landing experience.
 *
 * Scope is deliberately small — only the name+phone form copy and a couple
 * of header/footer microstrings. The rest of the reporter flow (voice
 * recorder, wheel picker, evidence) stays in English for the pilot since
 * Whisper handles spoken Kannada/Hindi/Tamil/Telugu and the icons carry
 * the meaning visually.
 *
 * Why landing-only: the user wants the *first* thing a reporter sees —
 * before they enter PII — to be available in their local language. Past
 * that screen, the visual UI takes over and language matters less.
 *
 * To add another locale later: drop another entry into LOCALES + STRINGS,
 * extend the language toggle pill list. Order in LOCALES is the display
 * order in the toggle.
 */

export const LOCALES = ["en", "kn"] as const
export type Locale = (typeof LOCALES)[number]

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  kn: "ಕನ್ನಡ",
}

/** Field/copy keys used across the landing screen. */
export type StringKey =
  | "page.title"
  | "page.lede"
  | "page.privacy_note"
  | "form.name_label"
  | "form.name_placeholder"
  | "form.phone_label"
  | "form.phone_placeholder"
  | "form.continue"
  | "form.anonymous_note"
  | "form.reporting_as"
  | "form.switch"
  | "validate.name_required"
  | "validate.phone_invalid"
  | "header.brand_tagline"

export const STRINGS: Record<Locale, Record<StringKey, string>> = {
  en: {
    "page.title": "Report a safety issue",
    "page.lede":
      "Saw something unsafe, or had a close call? Tell us in your own voice, in your own language. It takes under a minute.",
    "page.privacy_note":
      "Your name is visible only to Head Office, never to the store manager.",
    "form.name_label": "Your name",
    "form.name_placeholder": "Full name",
    "form.phone_label": "Phone number",
    "form.phone_placeholder": "+91 98xxx xxxxx",
    "form.continue": "Continue",
    "form.anonymous_note": "Anonymous to store manager",
    "form.reporting_as": "Reporting as",
    "form.switch": "Not you? Switch",
    "validate.name_required": "Please enter your full name.",
    "validate.phone_invalid": "Please enter a valid phone number.",
    "header.brand_tagline": "Workplace safety reporting",
  },
  kn: {
    "page.title": "ಸುರಕ್ಷತೆ ಸಮಸ್ಯೆಯನ್ನು ವರದಿ ಮಾಡಿ",
    "page.lede":
      "ಅಸುರಕ್ಷಿತವಾದದ್ದನ್ನು ನೋಡಿದಿರಾ ಅಥವಾ ಸಮೀಪದ ಅಪಘಾತ ಆಯಿತೆ? ನಿಮ್ಮ ಸ್ವಂತ ಧ್ವನಿಯಲ್ಲಿ, ನಿಮ್ಮ ಸ್ವಂತ ಭಾಷೆಯಲ್ಲಿ ತಿಳಿಸಿ. ಒಂದು ನಿಮಿಷಕ್ಕಿಂತ ಕಡಿಮೆ ಸಮಯ ತೆಗೆದುಕೊಳ್ಳುತ್ತದೆ.",
    "page.privacy_note":
      "ನಿಮ್ಮ ಹೆಸರು ಕೇವಲ ಮುಖ್ಯ ಕಚೇರಿಗೆ ಮಾತ್ರ ಗೋಚರಿಸುತ್ತದೆ, ಅಂಗಡಿ ವ್ಯವಸ್ಥಾಪಕರಿಗೆ ಎಂದಿಗೂ ಇಲ್ಲ.",
    "form.name_label": "ನಿಮ್ಮ ಹೆಸರು",
    "form.name_placeholder": "ಪೂರ್ಣ ಹೆಸರು",
    "form.phone_label": "ಫೋನ್ ಸಂಖ್ಯೆ",
    "form.phone_placeholder": "+91 98xxx xxxxx",
    "form.continue": "ಮುಂದುವರಿಸಿ",
    "form.anonymous_note": "ಅಂಗಡಿ ವ್ಯವಸ್ಥಾಪಕರಿಗೆ ಅಜ್ಞಾತ",
    "form.reporting_as": "ಇವರಾಗಿ ವರದಿ ಮಾಡುತ್ತಿದ್ದಾರೆ",
    "form.switch": "ನೀವು ಅಲ್ಲವೇ? ಬದಲಾಯಿಸಿ",
    "validate.name_required": "ದಯವಿಟ್ಟು ನಿಮ್ಮ ಪೂರ್ಣ ಹೆಸರನ್ನು ನಮೂದಿಸಿ.",
    "validate.phone_invalid": "ದಯವಿಟ್ಟು ಮಾನ್ಯ ಫೋನ್ ಸಂಖ್ಯೆಯನ್ನು ನಮೂದಿಸಿ.",
    "header.brand_tagline": "ಕೆಲಸದ ಸ್ಥಳದ ಸುರಕ್ಷತಾ ವರದಿ",
  },
}

const LOCALE_STORAGE_KEY = "sr_locale"

/** Read the chosen locale from localStorage, falling back to "en". */
export function readLocale(): Locale {
  if (typeof window === "undefined") return "en"
  try {
    const v = window.localStorage.getItem(LOCALE_STORAGE_KEY)
    if (v && (LOCALES as readonly string[]).includes(v)) return v as Locale
  } catch {
    /* localStorage unavailable */
  }
  return "en"
}

/** Persist the chosen locale and dispatch a window event so other mounts
 * on the same page can react. */
export function writeLocale(loc: Locale): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, loc)
    window.dispatchEvent(new CustomEvent("sr:locale", { detail: loc }))
  } catch {
    /* localStorage unavailable — the toggle still works for the current
     * mount, just won't persist. */
  }
}

/** Look up a localised string. Falls back to the English copy if a key
 * is missing in a non-English locale (so we never render a blank label). */
export function t(loc: Locale, key: StringKey): string {
  return STRINGS[loc]?.[key] ?? STRINGS.en[key]
}
