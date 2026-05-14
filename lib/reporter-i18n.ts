"use client"

/**
 * Reporter-flow localisation (English + Kannada).
 *
 * Originally landing-only — the rest of the reporter flow rode on the icon
 * grammar plus Whisper-translated voice notes. Pilot stakeholders pushed back
 * after the first store walkthrough: Kannada on the landing screen and
 * English on every screen after it reads as a broken promise to the
 * reporter. This file is now the source of every reporter-facing string,
 * landing through confirm + the shared evidence components.
 *
 * To add another locale later: drop another entry into LOCALES + STRINGS,
 * and the toggle in reporter-form.tsx will pick it up automatically. Order
 * in LOCALES = display order in the toggle.
 */

import { useEffect, useState } from "react"

export const LOCALES = ["en", "kn"] as const
export type Locale = (typeof LOCALES)[number]

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  kn: "ಕನ್ನಡ",
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
    "common.step.1of4": "Step 1 of 4",
    "common.step.2of4": "Step 2 of 4",
    "common.step.3of4": "Step 3 of 4",
    "common.step.4of4": "Step 4 of 4",
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

    "category.near_miss.label": "Near Miss",
    "category.near_miss.blurb":
      "An event with potential for harm, but no injury occurred.",
    "category.unsafe_act.label": "Unsafe Act",
    "category.unsafe_act.blurb":
      "A deviation from safety procedures by an individual.",
    "category.unsafe_condition.label": "Unsafe Condition",
    "category.unsafe_condition.blurb":
      "An environmental hazard that could cause harm.",
    "category.first_aid_case.label": "First Aid Case",
    "category.first_aid_case.blurb": "Minor injury, treated on-site.",
    "category.medical_treatment_case.label": "Medical Treatment",
    "category.medical_treatment_case.blurb":
      "Requires professional medical care.",
    "category.restricted_work_case.label": "Restricted Work",
    "category.restricted_work_case.blurb": "Injury limits work duties.",
    "category.lost_time_injury.label": "Lost Time Injury",
    "category.lost_time_injury.blurb":
      "Results in days away from work.",
    "category.fatality.label": "Fatality",
    "category.fatality.blurb": "Resulting in death.",
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
    "common.step.1of4": "4 ರಲ್ಲಿ 1ನೇ ಹಂತ",
    "common.step.2of4": "4 ರಲ್ಲಿ 2ನೇ ಹಂತ",
    "common.step.3of4": "4 ರಲ್ಲಿ 3ನೇ ಹಂತ",
    "common.step.4of4": "4 ರಲ್ಲಿ 4ನೇ ಹಂತ",
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
}

const LOCALE_STORAGE_KEY = "sr_locale"

/** Read the chosen locale from localStorage, falling back to "en". */
export function readLocale(): Locale {
  if (typeof window === "undefined") return "en"
  try {
    const v = window.localStorage.getItem(LOCALE_STORAGE_KEY)
    if (v === "en" || v === "kn") return v
  } catch {
    /* localStorage unavailable — fall back to default */
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
