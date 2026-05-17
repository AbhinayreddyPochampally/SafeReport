"use client"

/**
 * Reporter-flow localisation (English + Kannada + Hindi + Telugu).
 *
 * Originally landing-only — the rest of the reporter flow rode on the icon
 * grammar plus Whisper-translated voice notes. Pilot stakeholders pushed back
 * after the first store walkthrough: Kannada on the landing screen and
 * English on every screen after it reads as a broken promise to the
 * reporter. This file is now the source of every reporter-facing string,
 * landing through confirm + the shared evidence components.
 *
 * Hindi + Telugu were added in May 2026 to cover the four-language footprint
 * the pilot manager wanted (English, Kannada, Hindi, Telugu). The footprint
 * intentionally stops at four — adding Marathi/Tamil etc. is straightforward
 * (drop entries into LOCALES + STRINGS) but each additional locale crowds the
 * landing-screen picker and the strings need a careful native-speaker review.
 *
 * To add another locale later: drop another entry into LOCALES + STRINGS,
 * and the LocalePicker will pick it up automatically. Order in LOCALES =
 * display order in the picker.
 */

import { useEffect, useState } from "react"

export const LOCALES = ["en", "hi", "kn", "te"] as const
export type Locale = (typeof LOCALES)[number]

/** Short label for the LocalePicker — native script when available so the
 * reporter recognises their own language without reading English first. */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  hi: "हिन्दी",
  kn: "ಕನ್ನಡ",
  te: "తెలుగు",
}

/** English-script name used as a secondary label inside the picker (so a
 * reporter who can't read their native script still finds their language). */
export const LOCALE_ENGLISH_NAMES: Record<Locale, string> = {
  en: "English",
  hi: "Hindi",
  kn: "Kannada",
  te: "Telugu",
}

/** BCP-47 tag for Date.toLocaleString — used by the wheel picker preview
 * and the review-screen timestamp so weekday/month render in native script
 * where the browser ships the locale data. */
export const LOCALE_BCP47: Record<Locale, string> = {
  en: "en-IN",
  hi: "hi-IN",
  kn: "kn-IN",
  te: "te-IN",
}

/** Every reporter-facing copy key. Grouped by screen / component. */
export type StringKey =
  // Landing intro + name/phone form (existing)
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
  | "landing.language"
  // Store-not-found landing fallback
  | "unavailable.eyebrow"
  | "unavailable.title"
  | "unavailable.body"
  | "unavailable.tip"
  // Common chrome shared across screens
  | "common.back"
  | "common.continue"
  | "common.optional"
  | "common.edit"
  | "common.anonymous_footer"
  | "common.step.1of4"
  | "common.step.2of4"
  | "common.step.3of4"
  | "common.step.4of4"
  | "common.step.review"
  // Triage (Screen 2)
  | "triage.title"
  | "triage.lede"
  | "triage.observation.title"
  | "triage.observation.subtitle"
  | "triage.incident.title"
  | "triage.incident.subtitle"
  // Sub-category (Screen 3)
  | "subcat.observation.kind"
  | "subcat.incident.kind"
  | "subcat.observation.heading"
  | "subcat.incident.heading"
  | "subcat.lede"
  // When (Screen 4)
  | "when.title"
  | "when.lede"
  | "when.selected"
  // Evidence (Screen 5)
  | "evidence.title"
  | "evidence.lede"
  | "evidence.photo_label"
  | "evidence.voice_label"
  | "evidence.text_label"
  | "evidence.text_placeholder"
  | "evidence.text_min"
  | "evidence.text_helper"
  | "evidence.missing.both"
  | "evidence.missing.photo"
  | "evidence.missing.voicetext"
  // Review (Screen 6)
  | "review.title"
  | "review.lede"
  | "review.row.category"
  | "review.row.when"
  | "review.row.added"
  | "review.row.you"
  | "review.row.voicenote"
  | "review.privacy"
  | "review.submit"
  | "review.submitting"
  // Confirm (Screen 7)
  | "confirm.eyebrow"
  | "confirm.title.noid"
  | "confirm.body"
  | "confirm.body.withid"
  | "confirm.privacy"
  | "confirm.close"
  | "confirm.again"
  // Photo capture component
  | "photo.take"
  | "photo.from_gallery"
  | "photo.use_camera"
  | "photo.pick_existing"
  | "photo.gallery_btn"
  | "photo.retake"
  | "photo.processing"
  | "photo.required_hint"
  | "photo.error_compress"
  // Voice recorder component
  | "voice.tap_record"
  | "voice.requesting"
  | "voice.optional_hint"
  | "voice.get_ready"
  | "voice.starts_soon"
  | "voice.error_mic"
  | "voice.stop_aria"
  | "voice.keep_recording"
  | "voice.play"
  | "voice.pause"
  | "voice.discard"
  | "voice.min_label"
  // PWA install prompt component
  | "pwa.eyebrow"
  | "pwa.title"
  | "pwa.dismiss_aria"
  | "pwa.notif.allowed"
  | "pwa.notif.blocked"
  | "pwa.notif.blocked_ios_sub"
  | "pwa.notif.blocked_android_sub"
  | "pwa.notif.allow"
  | "pwa.notif.allowed_sub"
  | "pwa.notif.blocked_sub"
  | "pwa.notif.allow_sub"
  | "pwa.notif.pending_install"
  | "pwa.notif.pending_install_sub"
  | "pwa.cta.allow"
  | "pwa.install.installed"
  | "pwa.install.installable"
  | "pwa.install.installed_sub"
  | "pwa.install.installable_sub"
  | "pwa.install.followup"
  | "pwa.cta.install"
  // Category labels + blurbs
  | "category.near_miss.label"
  | "category.near_miss.blurb"
  | "category.unsafe_act.label"
  | "category.unsafe_act.blurb"
  | "category.unsafe_condition.label"
  | "category.unsafe_condition.blurb"
  | "category.first_aid_case.label"
  | "category.first_aid_case.blurb"
  | "category.medical_treatment_case.label"
  | "category.medical_treatment_case.blurb"
  | "category.restricted_work_case.label"
  | "category.restricted_work_case.blurb"
  | "category.lost_time_injury.label"
  | "category.lost_time_injury.blurb"
  | "category.fatality.label"
  | "category.fatality.blurb"

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
    "landing.language": "Language",

    "unavailable.eyebrow": "Store not found",
    "unavailable.title": "We couldn't find that store.",
    "unavailable.body":
      "This code is not in the SafeReport registry, or the store is currently inactive. If you believe this is wrong, please show this screen to your manager.",
    "unavailable.tip":
      "Tip: the QR poster on your back-of-house notice board has the correct link for your store.",

    "common.back": "Back",
    "common.continue": "Continue",
    "common.optional": "optional",
    "common.edit": "Edit",
    "common.anonymous_footer": "Anonymous to store manager",
    // Phase 3+4 facelift: total steps grew from 4 (single-evidence) to 6
    // (photo, describe, identity now each their own screen). Keys retain
    // their original names for back-compat — only the visible string and
    // total count change. /photo, /describe, /identity hardcode their own
    // step text locally so they don't need new keys here.
    "common.step.1of4": "Step 1 of 6",
    "common.step.2of4": "Step 2 of 6",
    "common.step.3of4": "Step 3 of 6",
    "common.step.4of4": "Step 4 of 6",
    "common.step.review": "Review",

    "triage.title": "What happened?",
    "triage.lede": "Pick the one that best describes it.",
    "triage.observation.title": "Observation",
    "triage.observation.subtitle":
      "I noticed something unsafe — no one was hurt.",
    "triage.incident.title": "Incident",
    "triage.incident.subtitle":
      "Someone was hurt, or there was a serious event.",

    "subcat.observation.kind": "Observation",
    "subcat.incident.kind": "Incident",
    "subcat.observation.heading": "What did you notice?",
    "subcat.incident.heading": "What kind of incident?",
    "subcat.lede": "Tap the one that best matches.",

    "when.title": "When did this happen?",
    "when.lede": "Scroll each column to adjust.",
    "when.selected": "Selected",

    "evidence.title": "Show us what happened.",
    "evidence.lede":
      "A photo plus either a voice note or a short description.",
    "evidence.photo_label": "Photo",
    "evidence.voice_label": "Voice note",
    "evidence.text_label": "Or type a short description",
    "evidence.text_placeholder": "What did you see or what happened?",
    "evidence.text_min": "At least 20 characters",
    "evidence.text_helper": "Use this if you can't record audio",
    "evidence.missing.both":
      "Take a photo and add either a voice note or a short description.",
    "evidence.missing.photo": "A photo is required.",
    "evidence.missing.voicetext":
      "Add a voice note or type at least 20 characters.",

    "review.title": "One last check.",
    "review.lede": "If anything's off, tap the edit link next to it.",
    "review.row.category": "Category",
    "review.row.when": "When",
    "review.row.added": "What you added",
    "review.row.you": "You",
    "review.row.voicenote": "Voice note",
    "review.privacy": "Your name & number go only to Head Office",
    "review.submit": "Submit report",
    "review.submitting": "Submitting…",

    "confirm.eyebrow": "Report received",
    "confirm.title.noid": "Thank you — your report was submitted.",
    "confirm.body":
      "The store manager has been notified and will acknowledge this shortly.",
    "confirm.body.withid":
      "Thank you. The store manager has been notified and will acknowledge this shortly.",
    "confirm.privacy":
      "Your name and phone number are visible only to Head Office, never to the store manager.",
    "confirm.close": "Close",
    "confirm.again": "Report something else",

    "photo.take": "Take photo",
    "photo.from_gallery": "From gallery",
    "photo.use_camera": "Use camera",
    "photo.pick_existing": "Pick existing photo",
    "photo.gallery_btn": "Gallery",
    "photo.retake": "Retake",
    "photo.processing": "Processing…",
    "photo.required_hint": "Photo required · JPEG or PNG · up to 10 MB",
    "photo.error_compress":
      "Couldn't process that photo — please try again.",

    "voice.tap_record": "Tap to start recording",
    "voice.requesting": "Requesting microphone…",
    "voice.optional_hint":
      "Optional · up to 120s · 1-second pause before recording starts",
    "voice.get_ready": "Get ready…",
    "voice.starts_soon": "Recording starts in a moment.",
    "voice.error_mic":
      "Couldn't access the microphone. Check your browser permissions and try again.",
    "voice.stop_aria": "Stop recording",
    "voice.keep_recording": "Keep recording (min 3s)",
    "voice.play": "Play",
    "voice.pause": "Pause",
    "voice.discard": "Discard & re-record",
    "voice.min_label": "min 3s",

    "pwa.eyebrow": "Set up SafeReport",
    "pwa.title": "Two quick steps so you can report faster next time",
    "pwa.dismiss_aria": "Hide for this session",
    "pwa.notif.allowed": "Notifications on",
    "pwa.notif.blocked": "Notifications blocked",
    "pwa.notif.blocked_sub":
      "Tap the lock icon in the address bar and allow notifications.",
    "pwa.notif.blocked_ios_sub":
      "Open Settings on your iPhone → Notifications → SafeReport, and turn on Allow Notifications.",
    "pwa.notif.blocked_android_sub":
      "Open Settings on your phone → Apps → SafeReport → Notifications, and turn them on.",
    "pwa.notif.allow": "Allow notifications",
    "pwa.notif.allowed_sub":
      "We'll alert you when Head Office responds to your report.",
    "pwa.notif.allow_sub":
      "Hear back when Head Office responds to your report.",
    "pwa.notif.pending_install": "Allow notifications",
    "pwa.notif.pending_install_sub":
      "Available after installing — finish step 1 first.",
    "pwa.cta.allow": "Allow",
    "pwa.install.installed": "Installed on home screen",
    "pwa.install.installable": "Install SafeReport",
    "pwa.install.installed_sub":
      "Tap the SafeReport icon next time — no need to scan the QR again.",
    "pwa.install.installable_sub":
      "Adds a home-screen shortcut — one tap next time, no scanning.",
    "pwa.install.followup":
      "Now open SafeReport from your home screen icon to finish — that's where notifications get switched on.",
    "pwa.cta.install": "Install",

    // PLAIN-LANGUAGE CATEGORY LABELS (May 2026 facelift).
    // The internal codes (near_miss / unsafe_act / etc.) stay unchanged in
    // lib/categories.ts so HO analytics aren't affected — only the reporter-
    // facing label + blurb change here. Manager and HO surfaces continue to
    // read cat.label (the formal English term) directly.
    "category.near_miss.label": "Near miss",
    "category.near_miss.blurb": "Something almost happened",
    "category.unsafe_act.label": "Working unsafely",
    "category.unsafe_act.blurb":
      "Someone skipped a rule or worked unsafely",
    "category.unsafe_condition.label": "Unsafe condition",
    "category.unsafe_condition.blurb":
      "A hazard like wet floor or broken equipment",
    "category.first_aid_case.label": "Minor injury",
    "category.first_aid_case.blurb": "First aid given on the spot",
    "category.medical_treatment_case.label": "Needed a doctor",
    "category.medical_treatment_case.blurb":
      "Hospital or doctor visit needed",
    "category.restricted_work_case.label": "Working with restrictions",
    "category.restricted_work_case.blurb":
      "Came back but couldn't do usual duties",
    "category.lost_time_injury.label": "Couldn't come to work",
    "category.lost_time_injury.blurb":
      "Missed days because of the injury",
    "category.fatality.label": "Someone died",
    "category.fatality.blurb": "",
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
    "landing.language": "ಭಾಷೆ",

    "unavailable.eyebrow": "ಅಂಗಡಿ ಸಿಗಲಿಲ್ಲ",
    "unavailable.title": "ಆ ಅಂಗಡಿಯನ್ನು ನಮಗೆ ಹುಡುಕಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.",
    "unavailable.body":
      "ಈ ಸಂಕೇತ SafeReport ನೋಂದಣಿಯಲ್ಲಿ ಇಲ್ಲ, ಅಥವಾ ಅಂಗಡಿ ಪ್ರಸ್ತುತ ಸಕ್ರಿಯವಾಗಿಲ್ಲ. ಇದು ತಪ್ಪು ಎಂದು ನಿಮಗೆ ಅನಿಸಿದರೆ, ದಯವಿಟ್ಟು ಈ ಪರದೆಯನ್ನು ನಿಮ್ಮ ವ್ಯವಸ್ಥಾಪಕರಿಗೆ ತೋರಿಸಿ.",
    "unavailable.tip":
      "ಸೂಚನೆ: ನಿಮ್ಮ ಅಂಗಡಿಯ ಹಿಂಭಾಗದ ಸೂಚನಾ ಫಲಕದಲ್ಲಿರುವ QR ಪೋಸ್ಟರ್‌ನಲ್ಲಿ ಸರಿಯಾದ ಲಿಂಕ್ ಇದೆ.",

    "common.back": "ಹಿಂದೆ",
    "common.continue": "ಮುಂದುವರಿಸಿ",
    "common.optional": "ಐಚ್ಛಿಕ",
    "common.edit": "ಬದಲಾಯಿಸಿ",
    "common.anonymous_footer": "ಅಂಗಡಿ ವ್ಯವಸ್ಥಾಪಕರಿಗೆ ಅನಾಮಧೇಯ",
    "common.step.1of4": "6 ರಲ್ಲಿ 1ನೇ ಹಂತ",
    "common.step.2of4": "6 ರಲ್ಲಿ 2ನೇ ಹಂತ",
    "common.step.3of4": "6 ರಲ್ಲಿ 3ನೇ ಹಂತ",
    "common.step.4of4": "6 ರಲ್ಲಿ 4ನೇ ಹಂತ",
    "common.step.review": "ಪರಿಶೀಲನೆ",

    "triage.title": "ಏನಾಯಿತು?",
    "triage.lede": "ಅದನ್ನು ಚೆನ್ನಾಗಿ ವಿವರಿಸುವ ಒಂದನ್ನು ಆಯ್ಕೆ ಮಾಡಿ.",
    "triage.observation.title": "ಗಮನಿಸಿದ್ದು",
    "triage.observation.subtitle":
      "ಅಸುರಕ್ಷಿತವಾದದ್ದನ್ನು ನಾನು ಗಮನಿಸಿದೆ – ಯಾರಿಗೂ ಗಾಯವಾಗಲಿಲ್ಲ.",
    "triage.incident.title": "ಘಟನೆ",
    "triage.incident.subtitle":
      "ಯಾರಿಗಾದರೂ ಗಾಯವಾಯಿತು, ಅಥವಾ ಗಂಭೀರವಾದ ಸಂಗತಿ ನಡೆಯಿತು.",

    "subcat.observation.kind": "ಗಮನಿಸಿದ್ದು",
    "subcat.incident.kind": "ಘಟನೆ",
    "subcat.observation.heading": "ನೀವು ಏನು ಗಮನಿಸಿದಿರಿ?",
    "subcat.incident.heading": "ಯಾವ ಬಗೆಯ ಘಟನೆ?",
    "subcat.lede": "ಸರಿಯಾಗಿ ಹೊಂದುವ ಒಂದನ್ನು ಒತ್ತಿ.",

    "when.title": "ಇದು ಯಾವಾಗ ನಡೆಯಿತು?",
    "when.lede": "ಪ್ರತಿ ಸಾಲನ್ನು ಸ್ಕ್ರಾಲ್ ಮಾಡಿ ಹೊಂದಿಸಿ.",
    "when.selected": "ಆಯ್ಕೆಯಾಗಿದೆ",

    "evidence.title": "ಏನಾಯಿತು ಎಂಬುದನ್ನು ತೋರಿಸಿ.",
    "evidence.lede":
      "ಒಂದು ಫೋಟೋ ಜೊತೆಗೆ ಧ್ವನಿ ಸಂದೇಶ ಅಥವಾ ಚಿಕ್ಕ ವಿವರಣೆ.",
    "evidence.photo_label": "ಫೋಟೋ",
    "evidence.voice_label": "ಧ್ವನಿ ಸಂದೇಶ",
    "evidence.text_label": "ಅಥವಾ ಚಿಕ್ಕ ವಿವರಣೆ ಬರೆಯಿರಿ",
    "evidence.text_placeholder": "ನೀವು ಏನು ನೋಡಿದಿರಿ ಅಥವಾ ಏನಾಯಿತು?",
    "evidence.text_min": "ಕನಿಷ್ಠ 20 ಅಕ್ಷರಗಳು",
    "evidence.text_helper":
      "ಧ್ವನಿ ರೆಕಾರ್ಡ್ ಮಾಡಲು ಸಾಧ್ಯವಾಗದಿದ್ದರೆ ಇದನ್ನು ಬಳಸಿ",
    "evidence.missing.both":
      "ಫೋಟೋ ತೆಗೆದು, ಧ್ವನಿ ಸಂದೇಶ ಅಥವಾ ಚಿಕ್ಕ ವಿವರಣೆ ಸೇರಿಸಿ.",
    "evidence.missing.photo": "ಫೋಟೋ ಅಗತ್ಯವಾಗಿದೆ.",
    "evidence.missing.voicetext":
      "ಧ್ವನಿ ಸಂದೇಶ ಸೇರಿಸಿ ಅಥವಾ ಕನಿಷ್ಠ 20 ಅಕ್ಷರಗಳನ್ನು ಬರೆಯಿರಿ.",

    "review.title": "ಕೊನೆಯ ಬಾರಿ ಪರಿಶೀಲಿಸಿ.",
    "review.lede": "ಏನಾದರೂ ತಪ್ಪಿದ್ದರೆ, ಪಕ್ಕದಲ್ಲಿರುವ ಬದಲಾಯಿಸಿ ಲಿಂಕ್ ಒತ್ತಿ.",
    "review.row.category": "ವರ್ಗ",
    "review.row.when": "ಯಾವಾಗ",
    "review.row.added": "ನೀವು ಸೇರಿಸಿದ್ದು",
    "review.row.you": "ನೀವು",
    "review.row.voicenote": "ಧ್ವನಿ ಸಂದೇಶ",
    "review.privacy":
      "ನಿಮ್ಮ ಹೆಸರು ಮತ್ತು ಸಂಖ್ಯೆ ಕೇವಲ ಮುಖ್ಯ ಕಚೇರಿಗೆ ಮಾತ್ರ ತಲುಪುತ್ತದೆ",
    "review.submit": "ವರದಿ ಸಲ್ಲಿಸಿ",
    "review.submitting": "ಸಲ್ಲಿಸಲಾಗುತ್ತಿದೆ…",

    "confirm.eyebrow": "ವರದಿ ಸ್ವೀಕರಿಸಲಾಗಿದೆ",
    "confirm.title.noid": "ಧನ್ಯವಾದಗಳು – ನಿಮ್ಮ ವರದಿ ಸಲ್ಲಿಸಲಾಗಿದೆ.",
    "confirm.body":
      "ಅಂಗಡಿ ವ್ಯವಸ್ಥಾಪಕರಿಗೆ ಸೂಚನೆ ನೀಡಲಾಗಿದೆ, ಶೀಘ್ರದಲ್ಲೇ ಪ್ರತಿಕ್ರಿಯಿಸುತ್ತಾರೆ.",
    "confirm.body.withid":
      "ಧನ್ಯವಾದಗಳು. ಅಂಗಡಿ ವ್ಯವಸ್ಥಾಪಕರಿಗೆ ಸೂಚನೆ ನೀಡಲಾಗಿದೆ, ಶೀಘ್ರದಲ್ಲೇ ಪ್ರತಿಕ್ರಿಯಿಸುತ್ತಾರೆ.",
    "confirm.privacy":
      "ನಿಮ್ಮ ಹೆಸರು ಮತ್ತು ಫೋನ್ ಸಂಖ್ಯೆ ಕೇವಲ ಮುಖ್ಯ ಕಚೇರಿಗೆ ಮಾತ್ರ ಗೋಚರಿಸುತ್ತದೆ, ಅಂಗಡಿ ವ್ಯವಸ್ಥಾಪಕರಿಗೆ ಎಂದಿಗೂ ತಿಳಿಯುವುದಿಲ್ಲ.",
    "confirm.close": "ಮುಚ್ಚಿ",
    "confirm.again": "ಇನ್ನೊಂದನ್ನು ವರದಿ ಮಾಡಿ",

    "photo.take": "ಫೋಟೋ ತೆಗೆಯಿರಿ",
    "photo.from_gallery": "ಗ್ಯಾಲರಿಯಿಂದ",
    "photo.use_camera": "ಕ್ಯಾಮೆರಾ ಬಳಸಿ",
    "photo.pick_existing": "ಇರುವ ಫೋಟೋ ಆಯ್ಕೆ ಮಾಡಿ",
    "photo.gallery_btn": "ಗ್ಯಾಲರಿ",
    "photo.retake": "ಮತ್ತೆ ತೆಗೆಯಿರಿ",
    "photo.processing": "ಪ್ರಕ್ರಿಯೆಗೊಳಿಸಲಾಗುತ್ತಿದೆ…",
    "photo.required_hint": "ಫೋಟೋ ಅಗತ್ಯ · JPEG ಅಥವಾ PNG · 10 MB ವರೆಗೆ",
    "photo.error_compress":
      "ಆ ಫೋಟೋವನ್ನು ಪ್ರಕ್ರಿಯೆಗೊಳಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ – ದಯವಿಟ್ಟು ಮತ್ತೊಮ್ಮೆ ಪ್ರಯತ್ನಿಸಿ.",

    "voice.tap_record": "ರೆಕಾರ್ಡಿಂಗ್ ಆರಂಭಿಸಲು ಒತ್ತಿ",
    "voice.requesting": "ಮೈಕ್ರೋಫೋನ್ ಕೇಳಲಾಗುತ್ತಿದೆ…",
    "voice.optional_hint":
      "ಐಚ್ಛಿಕ · 120 ಸೆ. ವರೆಗೆ · ರೆಕಾರ್ಡಿಂಗ್ ಆರಂಭಕ್ಕೆ ಮುಂಚೆ 1 ಸೆಕೆಂಡ್ ವಿರಾಮ",
    "voice.get_ready": "ಸಿದ್ಧವಾಗಿ…",
    "voice.starts_soon": "ರೆಕಾರ್ಡಿಂಗ್ ಕ್ಷಣದಲ್ಲೇ ಆರಂಭವಾಗುತ್ತದೆ.",
    "voice.error_mic":
      "ಮೈಕ್ರೋಫೋನ್ ಬಳಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ನಿಮ್ಮ ಬ್ರೌಸರ್ ಅನುಮತಿಗಳನ್ನು ಪರಿಶೀಲಿಸಿ ಮತ್ತೊಮ್ಮೆ ಪ್ರಯತ್ನಿಸಿ.",
    "voice.stop_aria": "ರೆಕಾರ್ಡಿಂಗ್ ನಿಲ್ಲಿಸಿ",
    "voice.keep_recording": "ರೆಕಾರ್ಡಿಂಗ್ ಮುಂದುವರಿಸಿ (ಕನಿಷ್ಠ 3 ಸೆ.)",
    "voice.play": "ಪ್ಲೇ ಮಾಡಿ",
    "voice.pause": "ವಿರಾಮ",
    "voice.discard": "ತೆಗೆದುಹಾಕಿ ಮತ್ತು ಮತ್ತೆ ರೆಕಾರ್ಡ್ ಮಾಡಿ",
    "voice.min_label": "ಕನಿಷ್ಠ 3 ಸೆ.",

    "pwa.eyebrow": "SafeReport ಸಿದ್ಧಪಡಿಸಿ",
    "pwa.title":
      "ಮುಂದಿನ ಬಾರಿ ವೇಗವಾಗಿ ವರದಿ ಮಾಡಲು ಎರಡು ಚಿಕ್ಕ ಹಂತಗಳು",
    "pwa.dismiss_aria": "ಈ ಬಾರಿಗೆ ಮರೆಮಾಡಿ",
    "pwa.notif.allowed": "ಸೂಚನೆಗಳು ಸಕ್ರಿಯ",
    "pwa.notif.blocked": "ಸೂಚನೆಗಳನ್ನು ತಡೆಯಲಾಗಿದೆ",
    "pwa.notif.blocked_sub":
      "ಮತ್ತೆ ಸಕ್ರಿಯಗೊಳಿಸಲು ವಿಳಾಸ ಪಟ್ಟಿಯಲ್ಲಿರುವ ಬೀಗದ ಚಿಹ್ನೆಯನ್ನು ಒತ್ತಿ ಮತ್ತು ಅನುಮತಿಸಿ.",
    "pwa.notif.blocked_ios_sub":
      "ನಿಮ್ಮ iPhone-ನ Settings → Notifications → SafeReport ತೆರೆದು Allow Notifications ಆನ್ ಮಾಡಿ.",
    "pwa.notif.blocked_android_sub":
      "ನಿಮ್ಮ ಫೋನ್‌ನ Settings → Apps → SafeReport → Notifications ತೆರೆದು ಅವುಗಳನ್ನು ಆನ್ ಮಾಡಿ.",
    "pwa.notif.allow": "ಸೂಚನೆಗಳಿಗೆ ಅನುಮತಿ ನೀಡಿ",
    "pwa.notif.allowed_sub":
      "ಮುಖ್ಯ ಕಚೇರಿ ನಿಮ್ಮ ವರದಿಗೆ ಪ್ರತಿಕ್ರಿಯಿಸಿದಾಗ ನಿಮಗೆ ತಿಳಿಸುತ್ತೇವೆ.",
    "pwa.notif.allow_sub":
      "ಮುಖ್ಯ ಕಚೇರಿ ನಿಮ್ಮ ವರದಿಗೆ ಪ್ರತಿಕ್ರಿಯಿಸಿದಾಗ ಮಾಹಿತಿ ಪಡೆಯಿರಿ.",
    "pwa.notif.pending_install": "ಸೂಚನೆಗಳಿಗೆ ಅನುಮತಿ ನೀಡಿ",
    "pwa.notif.pending_install_sub":
      "ಅಪ್ಲಿಕೇಶನ್ ಇನ್‌ಸ್ಟಾಲ್ ಆದ ಬಳಿಕ ಲಭ್ಯ – ಮೊದಲು ಹಂತ 1 ಮುಗಿಸಿ.",
    "pwa.cta.allow": "ಅನುಮತಿಸಿ",
    "pwa.install.installed": "ಮುಖಪುಟದಲ್ಲಿ ಇನ್‌ಸ್ಟಾಲ್ ಆಗಿದೆ",
    "pwa.install.installable": "SafeReport ಇನ್‌ಸ್ಟಾಲ್ ಮಾಡಿ",
    "pwa.install.installed_sub":
      "ಮುಂದಿನ ಬಾರಿ SafeReport ಚಿಹ್ನೆಯನ್ನು ಒತ್ತಿ – QR ಮತ್ತೊಮ್ಮೆ ಸ್ಕ್ಯಾನ್ ಮಾಡುವ ಅಗತ್ಯವಿಲ್ಲ.",
    "pwa.install.installable_sub":
      "ಮುಖಪುಟ ಶಾರ್ಟ್‌ಕಟ್ ಸೇರಿಸುತ್ತದೆ – ಮುಂದಿನ ಬಾರಿ ಸ್ಕ್ಯಾನ್ ಬೇಡ, ಒಂದೇ ಒತ್ತುಗೆ.",
    "pwa.install.followup":
      "ಮುಗಿಸಲು ಈಗ ನಿಮ್ಮ ಮುಖಪುಟದ SafeReport ಚಿಹ್ನೆಯಿಂದ ತೆರೆಯಿರಿ – ಸೂಚನೆಗಳನ್ನು ಅಲ್ಲಿಂದಲೇ ಆನ್ ಮಾಡಬಹುದು.",
    "pwa.cta.install": "ಇನ್‌ಸ್ಟಾಲ್",

    "category.near_miss.label": "ಸಮೀಪದ ತಪ್ಪಿಸಿಕೊಳ್ಳುವಿಕೆ",
    "category.near_miss.blurb":
      "ಹಾನಿಯಾಗುವ ಸಾಧ್ಯತೆಯಿದ್ದ ಸಂಗತಿ, ಆದರೆ ಯಾವುದೇ ಗಾಯವಾಗಲಿಲ್ಲ.",
    "category.unsafe_act.label": "ಅಸುರಕ್ಷಿತ ಕ್ರಿಯೆ",
    "category.unsafe_act.blurb":
      "ಒಬ್ಬ ವ್ಯಕ್ತಿಯಿಂದ ಸುರಕ್ಷತಾ ನಿಯಮಗಳ ಉಲ್ಲಂಘನೆ.",
    "category.unsafe_condition.label": "ಅಸುರಕ್ಷಿತ ಸ್ಥಿತಿ",
    "category.unsafe_condition.blurb":
      "ಹಾನಿಯುಂಟುಮಾಡಬಹುದಾದ ಪರಿಸರದ ಅಪಾಯ.",
    "category.first_aid_case.label": "ಪ್ರಥಮ ಚಿಕಿತ್ಸೆ ಪ್ರಕರಣ",
    "category.first_aid_case.blurb":
      "ಸಣ್ಣ ಗಾಯ, ಸ್ಥಳದಲ್ಲೇ ಚಿಕಿತ್ಸೆ ನೀಡಲಾಗಿದೆ.",
    "category.medical_treatment_case.label": "ವೈದ್ಯಕೀಯ ಚಿಕಿತ್ಸೆ",
    "category.medical_treatment_case.blurb":
      "ವೃತ್ತಿಪರ ವೈದ್ಯಕೀಯ ಆರೈಕೆ ಅಗತ್ಯ.",
    "category.restricted_work_case.label": "ನಿರ್ಬಂಧಿತ ಕೆಲಸ",
    "category.restricted_work_case.blurb":
      "ಗಾಯವು ಕೆಲಸದ ಕರ್ತವ್ಯಗಳನ್ನು ಸೀಮಿತಗೊಳಿಸುತ್ತದೆ.",
    "category.lost_time_injury.label": "ಕೆಲಸದ ಸಮಯ ನಷ್ಟದ ಗಾಯ",
    "category.lost_time_injury.blurb":
      "ಕೆಲಸದಿಂದ ದೂರವಿರುವ ದಿನಗಳಿಗೆ ಕಾರಣವಾಗುತ್ತದೆ.",
    "category.fatality.label": "ಮರಣ",
    "category.fatality.blurb": "ಮರಣಕ್ಕೆ ಕಾರಣವಾಗುತ್ತದೆ.",
  },
  hi: {
    "page.title": "सुरक्षा समस्या की रिपोर्ट करें",
    "page.lede":
      "कुछ असुरक्षित देखा या कोई करीबी हादसा हुआ? अपनी आवाज़ में, अपनी भाषा में बताइए। एक मिनट से भी कम समय लगेगा।",
    "page.privacy_note":
      "आपका नाम केवल हेड ऑफिस को दिखेगा, स्टोर मैनेजर को कभी नहीं।",
    "form.name_label": "आपका नाम",
    "form.name_placeholder": "पूरा नाम",
    "form.phone_label": "फ़ोन नंबर",
    "form.phone_placeholder": "+91 98xxx xxxxx",
    "form.continue": "आगे बढ़ें",
    "form.anonymous_note": "स्टोर मैनेजर के लिए गुमनाम",
    "form.reporting_as": "रिपोर्ट इस रूप में",
    "form.switch": "आप नहीं? बदलें",
    "validate.name_required": "कृपया अपना पूरा नाम दर्ज करें।",
    "validate.phone_invalid": "कृपया एक मान्य फ़ोन नंबर दर्ज करें।",
    "header.brand_tagline": "कार्यस्थल सुरक्षा रिपोर्टिंग",
    "landing.language": "भाषा",

    "unavailable.eyebrow": "स्टोर नहीं मिला",
    "unavailable.title": "हमें वह स्टोर नहीं मिला।",
    "unavailable.body":
      "यह कोड SafeReport रजिस्ट्री में नहीं है, या स्टोर इस समय निष्क्रिय है। अगर आपको लगता है कि यह ग़लत है, तो कृपया यह स्क्रीन अपने मैनेजर को दिखाएँ।",
    "unavailable.tip":
      "सुझाव: आपके बैक-ऑफ़ हाउस नोटिस बोर्ड पर लगे QR पोस्टर में आपके स्टोर का सही लिंक है।",

    "common.back": "वापस",
    "common.continue": "आगे बढ़ें",
    "common.optional": "वैकल्पिक",
    "common.edit": "बदलें",
    "common.anonymous_footer": "स्टोर मैनेजर के लिए गुमनाम",
    "common.step.1of4": "6 में से 1",
    "common.step.2of4": "6 में से 2",
    "common.step.3of4": "6 में से 3",
    "common.step.4of4": "6 में से 4",
    "common.step.review": "समीक्षा",

    "triage.title": "क्या हुआ?",
    "triage.lede": "इसे सबसे अच्छे तरीके से बताने वाला विकल्प चुनें।",
    "triage.observation.title": "अवलोकन",
    "triage.observation.subtitle":
      "मैंने कुछ असुरक्षित देखा — किसी को चोट नहीं लगी।",
    "triage.incident.title": "घटना",
    "triage.incident.subtitle":
      "किसी को चोट लगी, या कोई गंभीर घटना हुई।",

    "subcat.observation.kind": "अवलोकन",
    "subcat.incident.kind": "घटना",
    "subcat.observation.heading": "आपने क्या देखा?",
    "subcat.incident.heading": "किस तरह की घटना?",
    "subcat.lede": "सबसे उपयुक्त विकल्प पर टैप करें।",

    "when.title": "यह कब हुआ?",
    "when.lede": "हर कॉलम को स्क्रॉल करके समय चुनें।",
    "when.selected": "चयनित",

    "evidence.title": "हमें दिखाइए कि क्या हुआ।",
    "evidence.lede":
      "एक फ़ोटो के साथ या तो वॉइस नोट या छोटा विवरण जोड़ें।",
    "evidence.photo_label": "फ़ोटो",
    "evidence.voice_label": "वॉइस नोट",
    "evidence.text_label": "या छोटा विवरण लिखें",
    "evidence.text_placeholder": "आपने क्या देखा या क्या हुआ?",
    "evidence.text_min": "कम से कम 20 अक्षर",
    "evidence.text_helper":
      "अगर ऑडियो रिकॉर्ड नहीं कर सकते तो इसका इस्तेमाल करें",
    "evidence.missing.both":
      "एक फ़ोटो लीजिए और वॉइस नोट या छोटा विवरण जोड़िए।",
    "evidence.missing.photo": "फ़ोटो ज़रूरी है।",
    "evidence.missing.voicetext":
      "वॉइस नोट जोड़ें या कम से कम 20 अक्षर लिखें।",

    "review.title": "एक आख़िरी जाँच।",
    "review.lede": "अगर कुछ ग़लत है, उसके बगल में दिए बदलें लिंक पर टैप करें।",
    "review.row.category": "श्रेणी",
    "review.row.when": "कब",
    "review.row.added": "आपने जोड़ा",
    "review.row.you": "आप",
    "review.row.voicenote": "वॉइस नोट",
    "review.privacy":
      "आपका नाम और नंबर केवल हेड ऑफिस तक जाते हैं",
    "review.submit": "रिपोर्ट जमा करें",
    "review.submitting": "जमा हो रही है…",

    "confirm.eyebrow": "रिपोर्ट मिल गई",
    "confirm.title.noid": "धन्यवाद — आपकी रिपोर्ट जमा हो गई है।",
    "confirm.body":
      "स्टोर मैनेजर को सूचना दे दी गई है, वे जल्द ही जवाब देंगे।",
    "confirm.body.withid":
      "धन्यवाद। स्टोर मैनेजर को सूचना दे दी गई है, वे जल्द ही जवाब देंगे।",
    "confirm.privacy":
      "आपका नाम और फ़ोन नंबर केवल हेड ऑफिस को दिखेगा, स्टोर मैनेजर को कभी नहीं।",
    "confirm.close": "बंद करें",
    "confirm.again": "कुछ और रिपोर्ट करें",

    "photo.take": "फ़ोटो लें",
    "photo.from_gallery": "गैलरी से",
    "photo.use_camera": "कैमरा इस्तेमाल करें",
    "photo.pick_existing": "मौजूदा फ़ोटो चुनें",
    "photo.gallery_btn": "गैलरी",
    "photo.retake": "फिर से लें",
    "photo.processing": "प्रोसेस हो रहा है…",
    "photo.required_hint": "फ़ोटो ज़रूरी · JPEG या PNG · 10 MB तक",
    "photo.error_compress":
      "वह फ़ोटो प्रोसेस नहीं हो सकी — कृपया दोबारा कोशिश करें।",

    "voice.tap_record": "रिकॉर्डिंग शुरू करने के लिए टैप करें",
    "voice.requesting": "माइक्रोफ़ोन माँगा जा रहा है…",
    "voice.optional_hint":
      "वैकल्पिक · 120 सेकंड तक · रिकॉर्डिंग शुरू होने से पहले 1 सेकंड का विराम",
    "voice.get_ready": "तैयार हो जाइए…",
    "voice.starts_soon": "रिकॉर्डिंग पल भर में शुरू होगी।",
    "voice.error_mic":
      "माइक्रोफ़ोन इस्तेमाल नहीं हो सका। अपनी ब्राउज़र अनुमतियाँ जाँचें और दोबारा कोशिश करें।",
    "voice.stop_aria": "रिकॉर्डिंग रोकें",
    "voice.keep_recording": "रिकॉर्डिंग जारी रखें (कम से कम 3 सेकंड)",
    "voice.play": "चलाएँ",
    "voice.pause": "रोकें",
    "voice.discard": "हटाएँ और दोबारा रिकॉर्ड करें",
    "voice.min_label": "कम से कम 3 सेकंड",

    "pwa.eyebrow": "SafeReport सेट करें",
    "pwa.title": "अगली बार जल्दी रिपोर्ट करने के लिए दो छोटे क़दम",
    "pwa.dismiss_aria": "इस सेशन के लिए छुपाएँ",
    "pwa.notif.allowed": "सूचनाएँ चालू हैं",
    "pwa.notif.blocked": "सूचनाएँ ब्लॉक हैं",
    "pwa.notif.blocked_sub":
      "एड्रेस बार में ताले के आइकन पर टैप करें और सूचनाओं की अनुमति दें।",
    "pwa.notif.blocked_ios_sub":
      "अपने iPhone में Settings → Notifications → SafeReport खोलें और Allow Notifications चालू करें।",
    "pwa.notif.blocked_android_sub":
      "अपने फ़ोन में Settings → Apps → SafeReport → Notifications खोलें और उन्हें चालू करें।",
    "pwa.notif.allow": "सूचनाओं की अनुमति दें",
    "pwa.notif.allowed_sub":
      "जब हेड ऑफिस आपकी रिपोर्ट का जवाब देगा, हम आपको सूचित करेंगे।",
    "pwa.notif.allow_sub":
      "हेड ऑफिस के जवाब की सूचना तुरंत पाइए।",
    "pwa.notif.pending_install": "सूचनाओं की अनुमति दें",
    "pwa.notif.pending_install_sub":
      "इंस्टॉल होने के बाद उपलब्ध — पहले स्टेप 1 पूरा करें।",
    "pwa.cta.allow": "अनुमति दें",
    "pwa.install.installed": "होम स्क्रीन पर इंस्टॉल है",
    "pwa.install.installable": "SafeReport इंस्टॉल करें",
    "pwa.install.installed_sub":
      "अगली बार SafeReport आइकन पर टैप करें — QR दोबारा स्कैन करने की ज़रूरत नहीं।",
    "pwa.install.installable_sub":
      "होम-स्क्रीन शॉर्टकट जुड़ जाएगा — अगली बार एक टैप, स्कैन नहीं।",
    "pwa.install.followup":
      "अब अपने होम स्क्रीन के SafeReport आइकन से खोलें — सूचनाएँ वहीं से चालू होती हैं।",
    "pwa.cta.install": "इंस्टॉल",

    "category.near_miss.label": "करीबी बचाव",
    "category.near_miss.blurb":
      "नुकसान की संभावना थी, पर कोई चोट नहीं लगी।",
    "category.unsafe_act.label": "असुरक्षित कार्य",
    "category.unsafe_act.blurb":
      "किसी व्यक्ति द्वारा सुरक्षा नियमों का उल्लंघन।",
    "category.unsafe_condition.label": "असुरक्षित स्थिति",
    "category.unsafe_condition.blurb":
      "ऐसी स्थिति जिससे चोट लग सकती है।",
    "category.first_aid_case.label": "प्राथमिक चिकित्सा",
    "category.first_aid_case.blurb": "छोटी चोट, मौके पर इलाज किया गया।",
    "category.medical_treatment_case.label": "चिकित्सकीय इलाज",
    "category.medical_treatment_case.blurb":
      "पेशेवर चिकित्सकीय देखभाल चाहिए।",
    "category.restricted_work_case.label": "सीमित काम",
    "category.restricted_work_case.blurb": "चोट के कारण काम सीमित है।",
    "category.lost_time_injury.label": "काम-गँवाने वाली चोट",
    "category.lost_time_injury.blurb":
      "काम से कई दिनों की छुट्टी हुई।",
    "category.fatality.label": "मृत्यु",
    "category.fatality.blurb": "मृत्यु होने का मामला।",
  },
  te: {
    "page.title": "భద్రతా సమస్యను నివేదించండి",
    "page.lede":
      "ఏదైనా అసురక్షితంగా చూశారా లేక దగ్గర నుండి తప్పించుకున్నారా? మీ సొంత గొంతుతో, మీ సొంత భాషలో చెప్పండి. ఒక నిమిషం కంటే తక్కువ సమయం పడుతుంది.",
    "page.privacy_note":
      "మీ పేరు హెడ్ ఆఫీసుకు మాత్రమే కనిపిస్తుంది, స్టోర్ మేనేజర్‌కు ఎప్పటికీ కాదు.",
    "form.name_label": "మీ పేరు",
    "form.name_placeholder": "పూర్తి పేరు",
    "form.phone_label": "ఫోన్ నంబర్",
    "form.phone_placeholder": "+91 98xxx xxxxx",
    "form.continue": "కొనసాగించండి",
    "form.anonymous_note": "స్టోర్ మేనేజర్‌కు అజ్ఞాతం",
    "form.reporting_as": "ఇలా నివేదిస్తున్నారు",
    "form.switch": "మీరు కాదా? మార్చండి",
    "validate.name_required": "దయచేసి మీ పూర్తి పేరును ఇవ్వండి.",
    "validate.phone_invalid": "దయచేసి సరైన ఫోన్ నంబర్‌ను ఇవ్వండి.",
    "header.brand_tagline": "కార్యస్థల భద్రతా నివేదిక",
    "landing.language": "భాష",

    "unavailable.eyebrow": "స్టోర్ దొరకలేదు",
    "unavailable.title": "ఆ స్టోర్‌ను మేము కనుగొనలేకపోయాము.",
    "unavailable.body":
      "ఈ కోడ్ SafeReport రిజిస్ట్రీలో లేదు, లేదా స్టోర్ ప్రస్తుతం పనిచేయడం లేదు. ఇది తప్పు అనుకుంటే, దయచేసి ఈ స్క్రీన్‌ను మీ మేనేజర్‌కు చూపించండి.",
    "unavailable.tip":
      "సూచన: మీ స్టోర్ నోటీసు బోర్డుపై ఉన్న QR పోస్టర్‌లో సరైన లింక్ ఉంది.",

    "common.back": "వెనుకకు",
    "common.continue": "కొనసాగించండి",
    "common.optional": "ఐచ్ఛికం",
    "common.edit": "మార్చండి",
    "common.anonymous_footer": "స్టోర్ మేనేజర్‌కు అజ్ఞాతం",
    "common.step.1of4": "6లో 1వ దశ",
    "common.step.2of4": "6లో 2వ దశ",
    "common.step.3of4": "6లో 3వ దశ",
    "common.step.4of4": "6లో 4వ దశ",
    "common.step.review": "సమీక్ష",

    "triage.title": "ఏం జరిగింది?",
    "triage.lede": "ఏది బాగా వివరిస్తుందో దానిని ఎంచుకోండి.",
    "triage.observation.title": "గమనింపు",
    "triage.observation.subtitle":
      "నేను అసురక్షితంగా ఏదో చూశాను — ఎవరికీ గాయం కాలేదు.",
    "triage.incident.title": "ఘటన",
    "triage.incident.subtitle":
      "ఎవరికైనా గాయమైంది, లేదా తీవ్రమైన సంఘటన జరిగింది.",

    "subcat.observation.kind": "గమనింపు",
    "subcat.incident.kind": "ఘటన",
    "subcat.observation.heading": "మీరు ఏం గమనించారు?",
    "subcat.incident.heading": "ఏ రకమైన ఘటన?",
    "subcat.lede": "బాగా సరిపోయే దానిపై ట్యాప్ చేయండి.",

    "when.title": "ఇది ఎప్పుడు జరిగింది?",
    "when.lede": "ప్రతి కాలమ్‌ను స్క్రోల్ చేసి సర్దుబాటు చేయండి.",
    "when.selected": "ఎంచుకున్నది",

    "evidence.title": "ఏం జరిగిందో మాకు చూపించండి.",
    "evidence.lede":
      "ఒక ఫోటో మరియు వాయిస్ నోట్ లేదా చిన్న వివరణ జోడించండి.",
    "evidence.photo_label": "ఫోటో",
    "evidence.voice_label": "వాయిస్ నోట్",
    "evidence.text_label": "లేదా చిన్న వివరణ టైప్ చేయండి",
    "evidence.text_placeholder": "మీరు ఏం చూశారు లేదా ఏం జరిగింది?",
    "evidence.text_min": "కనీసం 20 అక్షరాలు",
    "evidence.text_helper":
      "ఆడియో రికార్డ్ చేయలేకపోతే దీన్ని ఉపయోగించండి",
    "evidence.missing.both":
      "ఒక ఫోటో తీయండి మరియు వాయిస్ నోట్ లేదా చిన్న వివరణ జోడించండి.",
    "evidence.missing.photo": "ఫోటో అవసరం.",
    "evidence.missing.voicetext":
      "వాయిస్ నోట్ జోడించండి లేదా కనీసం 20 అక్షరాలు టైప్ చేయండి.",

    "review.title": "ఆఖరి తనిఖీ.",
    "review.lede": "ఏదైనా తప్పు ఉంటే, దాని పక్కన ఉన్న మార్చండి లింక్‌పై ట్యాప్ చేయండి.",
    "review.row.category": "వర్గం",
    "review.row.when": "ఎప్పుడు",
    "review.row.added": "మీరు జోడించినవి",
    "review.row.you": "మీరు",
    "review.row.voicenote": "వాయిస్ నోట్",
    "review.privacy":
      "మీ పేరు మరియు నంబర్ హెడ్ ఆఫీసుకు మాత్రమే వెళతాయి",
    "review.submit": "నివేదిక సమర్పించండి",
    "review.submitting": "సమర్పిస్తున్నాం…",

    "confirm.eyebrow": "నివేదిక అందింది",
    "confirm.title.noid": "ధన్యవాదాలు — మీ నివేదిక సమర్పించబడింది.",
    "confirm.body":
      "స్టోర్ మేనేజర్‌కు తెలియజేయబడింది, వారు త్వరలో స్పందిస్తారు.",
    "confirm.body.withid":
      "ధన్యవాదాలు. స్టోర్ మేనేజర్‌కు తెలియజేయబడింది, వారు త్వరలో స్పందిస్తారు.",
    "confirm.privacy":
      "మీ పేరు మరియు ఫోన్ నంబర్ హెడ్ ఆఫీసుకు మాత్రమే కనిపిస్తాయి, స్టోర్ మేనేజర్‌కు ఎప్పటికీ కాదు.",
    "confirm.close": "మూసివేయండి",
    "confirm.again": "మరొకటి నివేదించండి",

    "photo.take": "ఫోటో తీయండి",
    "photo.from_gallery": "గ్యాలరీ నుండి",
    "photo.use_camera": "కెమెరా ఉపయోగించండి",
    "photo.pick_existing": "ఉన్న ఫోటోను ఎంచుకోండి",
    "photo.gallery_btn": "గ్యాలరీ",
    "photo.retake": "మళ్ళీ తీయండి",
    "photo.processing": "ప్రాసెస్ చేస్తున్నాం…",
    "photo.required_hint": "ఫోటో అవసరం · JPEG లేదా PNG · 10 MB వరకు",
    "photo.error_compress":
      "ఆ ఫోటో ప్రాసెస్ చేయలేకపోయాం — దయచేసి మళ్ళీ ప్రయత్నించండి.",

    "voice.tap_record": "రికార్డింగ్ ప్రారంభించడానికి ట్యాప్ చేయండి",
    "voice.requesting": "మైక్రోఫోన్‌ను అడుగుతున్నాం…",
    "voice.optional_hint":
      "ఐచ్ఛికం · 120 సెకన్ల వరకు · రికార్డింగ్ ప్రారంభమయ్యే ముందు 1 సెకన్ విరామం",
    "voice.get_ready": "సిద్ధంగా ఉండండి…",
    "voice.starts_soon": "రికార్డింగ్ క్షణంలోనే ప్రారంభమవుతుంది.",
    "voice.error_mic":
      "మైక్రోఫోన్ ఉపయోగించలేకపోయాం. మీ బ్రౌజర్ అనుమతులను తనిఖీ చేసి మళ్ళీ ప్రయత్నించండి.",
    "voice.stop_aria": "రికార్డింగ్ ఆపండి",
    "voice.keep_recording": "రికార్డింగ్ కొనసాగించండి (కనీసం 3 సె.)",
    "voice.play": "ప్లే చేయండి",
    "voice.pause": "విరామం",
    "voice.discard": "తీసేసి మళ్ళీ రికార్డ్ చేయండి",
    "voice.min_label": "కనీసం 3 సె.",

    "pwa.eyebrow": "SafeReport సెటప్ చేయండి",
    "pwa.title": "తదుపరిసారి వేగంగా నివేదించడానికి రెండు చిన్న దశలు",
    "pwa.dismiss_aria": "ఈ సెషన్‌కు దాచండి",
    "pwa.notif.allowed": "నోటిఫికేషన్‌లు ఆన్‌లో ఉన్నాయి",
    "pwa.notif.blocked": "నోటిఫికేషన్‌లు బ్లాక్ చేయబడ్డాయి",
    "pwa.notif.blocked_sub":
      "అడ్రెస్ బార్‌లో లాక్ ఐకాన్‌పై ట్యాప్ చేసి నోటిఫికేషన్‌లకు అనుమతి ఇవ్వండి.",
    "pwa.notif.blocked_ios_sub":
      "మీ iPhoneలో Settings → Notifications → SafeReport తెరిచి Allow Notifications ఆన్ చేయండి.",
    "pwa.notif.blocked_android_sub":
      "మీ ఫోన్‌లో Settings → Apps → SafeReport → Notifications తెరిచి వాటిని ఆన్ చేయండి.",
    "pwa.notif.allow": "నోటిఫికేషన్‌లకు అనుమతి ఇవ్వండి",
    "pwa.notif.allowed_sub":
      "హెడ్ ఆఫీస్ మీ నివేదికకు స్పందించినప్పుడు మేము మీకు తెలియజేస్తాం.",
    "pwa.notif.allow_sub":
      "హెడ్ ఆఫీస్ స్పందనను వెంటనే తెలుసుకోండి.",
    "pwa.notif.pending_install": "నోటిఫికేషన్‌లకు అనుమతి ఇవ్వండి",
    "pwa.notif.pending_install_sub":
      "ఇన్‌స్టాల్ చేసిన తర్వాత అందుబాటులో ఉంటుంది — ముందు దశ 1 పూర్తి చేయండి.",
    "pwa.cta.allow": "అనుమతించండి",
    "pwa.install.installed": "హోమ్ స్క్రీన్‌లో ఇన్‌స్టాల్ చేయబడింది",
    "pwa.install.installable": "SafeReport ఇన్‌స్టాల్ చేయండి",
    "pwa.install.installed_sub":
      "తదుపరిసారి SafeReport ఐకాన్‌పై ట్యాప్ చేయండి — QRను మళ్ళీ స్కాన్ చేయాల్సిన అవసరం లేదు.",
    "pwa.install.installable_sub":
      "హోమ్-స్క్రీన్ షార్ట్‌కట్ జోడిస్తుంది — తదుపరిసారి ఒక్క ట్యాప్, స్కాన్ అక్కర్లేదు.",
    "pwa.install.followup":
      "ఇప్పుడు మీ హోమ్ స్క్రీన్ SafeReport ఐకాన్ నుండి తెరవండి — నోటిఫికేషన్‌లు అక్కడే ఆన్ చేయబడతాయి.",
    "pwa.cta.install": "ఇన్‌స్టాల్",

    "category.near_miss.label": "దగ్గరి తప్పించుకోత",
    "category.near_miss.blurb":
      "హాని జరిగే అవకాశం ఉండింది, కానీ ఎవరికీ గాయం కాలేదు.",
    "category.unsafe_act.label": "అసురక్షిత చర్య",
    "category.unsafe_act.blurb":
      "ఒక వ్యక్తి భద్రతా నియమాలను ఉల్లంఘించడం.",
    "category.unsafe_condition.label": "అసురక్షిత పరిస్థితి",
    "category.unsafe_condition.blurb":
      "హాని కలిగించగల పర్యావరణ ప్రమాదం.",
    "category.first_aid_case.label": "ప్రథమ చికిత్స కేసు",
    "category.first_aid_case.blurb":
      "చిన్న గాయం, స్థలంలోనే చికిత్స చేశారు.",
    "category.medical_treatment_case.label": "వైద్య చికిత్స",
    "category.medical_treatment_case.blurb":
      "వృత్తిపరమైన వైద్య సంరక్షణ అవసరం.",
    "category.restricted_work_case.label": "పరిమిత పని",
    "category.restricted_work_case.blurb":
      "గాయం వల్ల పని కర్తవ్యాలు పరిమితం.",
    "category.lost_time_injury.label": "పని-రోజులు పోగొట్టే గాయం",
    "category.lost_time_injury.blurb":
      "పనికి దూరం ఉండే రోజులకు దారితీస్తుంది.",
    "category.fatality.label": "మరణం",
    "category.fatality.blurb": "మరణానికి దారితీస్తుంది.",
  },
}

const LOCALE_STORAGE_KEY = "sr_locale"

// Compiled membership check — kept in sync with LOCALES automatically.
// Saves us from listing valid codes by hand inside readLocale.
const LOCALE_SET: ReadonlySet<string> = new Set(LOCALES)

/** Read the chosen locale from localStorage, falling back to "en". */
export function readLocale(): Locale {
  if (typeof window === "undefined") return "en"
  try {
    const v = window.localStorage.getItem(LOCALE_STORAGE_KEY)
    if (v && LOCALE_SET.has(v)) return v as Locale
  } catch {
    /* localStorage unavailable — fall back to default */
  }
  return "en"
}

/** BCP-47 tag for the given locale (used by Intl APIs / toLocaleString).
 * Centralised so the wheel-picker, review timestamp, and anywhere else
 * formats dates consistently per locale. */
export function bcp47(loc: Locale): string {
  return LOCALE_BCP47[loc] ?? "en-IN"
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

/**
 * React hook: read the current reporter locale and re-render when it
 * changes anywhere on the page (the language pill on the landing
 * dispatches a `sr:locale` CustomEvent on every toggle).
 *
 * SSR-safe: returns "en" before hydration, then upgrades to the persisted
 * locale on mount. Components that import this hook must be `"use client"`.
 */
export function useReporterLocale(): Locale {
  const [locale, setLocale] = useState<Locale>("en")
  useEffect(() => {
    setLocale(readLocale())
    function onLocale(e: Event) {
      const custom = e as CustomEvent<Locale>
      if (custom.detail) setLocale(custom.detail)
    }
    window.addEventListener("sr:locale", onLocale)
    return () => window.removeEventListener("sr:locale", onLocale)
  }, [])
  return locale
}
