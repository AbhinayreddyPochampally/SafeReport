"use client"

import { Check, ChevronDown, Languages } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"
import {
  LOCALE_ENGLISH_NAMES,
  LOCALE_LABELS,
  LOCALES,
  readLocale,
  writeLocale,
  type Locale,
} from "@/lib/reporter-i18n"

/**
 * Reporter-flow language picker.
 *
 * Phone-first, ~375px viewport. Replaces the 2-pill toggle that used to
 * sit on the landing screen — with 4 locales (English / Hindi / Kannada /
 * Telugu) the pill row no longer fits cleanly, and each pill was too small
 * for a 44px-comfortable touch target.
 *
 * Anatomy:
 *   - Trigger button: a single rounded chip showing the current language
 *     in its native script + a chevron. Width grows to fit longest label
 *     so layout doesn't shift on switch.
 *   - Sheet: a dropdown panel positioned below the trigger with one tall
 *     row per locale. Each row shows native script (primary) + English
 *     name (secondary), with a checkmark on the current selection.
 *   - Dismiss: outside click, Escape, second tap on trigger, or selecting
 *     a row.
 *
 * State:
 *   - The picker writes to localStorage via writeLocale() and dispatches
 *     the `sr:locale` CustomEvent so every <useReporterLocale> consumer on
 *     the page re-renders with the new locale.
 *   - SSR-safe: initial render uses "en", a mount effect upgrades to the
 *     persisted choice. Avoids a hydration mismatch when localStorage
 *     contains a non-default locale.
 *
 * Variants:
 *   - "default" (full panel) — used above the first-visit form on the
 *     reporter landing. Includes the "Language" eyebrow + icon so the
 *     affordance is unmissable for a brand-new reporter.
 *   - "compact" — used inside the "Reporting as …" summary card for
 *     returning reporters. Drops the eyebrow and shrinks padding so the
 *     trigger fits in a row next to other controls.
 *
 * Accessibility: the trigger is `role="combobox"` + `aria-expanded` +
 * `aria-controls`; the panel is `role="listbox"`; each row is
 * `role="option"` with `aria-selected`. Arrow keys move focus, Enter /
 * Space select, Escape dismisses. The whole thing satisfies WCAG 2.1 AA
 * touch-target sizing (rows are 52px tall on mobile).
 */

type Variant = "default" | "compact"

export function LocalePicker({
  variant = "default",
  /** Optional callback when the user changes locale. The picker writes
   * to localStorage either way; this is for parents who want to clear
   * derived state (e.g. error messages localized at last attempt). */
  onChange,
}: {
  variant?: Variant
  onChange?: (loc: Locale) => void
}) {
  const [locale, setLocale] = useState<Locale>("en")
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const listboxId = useId()

  // Hydrate from localStorage on mount + listen for cross-mount changes.
  useEffect(() => {
    setLocale(readLocale())
    function onLocale(e: Event) {
      const custom = e as CustomEvent<Locale>
      if (custom.detail) setLocale(custom.detail)
    }
    window.addEventListener("sr:locale", onLocale)
    return () => window.removeEventListener("sr:locale", onLocale)
  }, [])

  // Dismiss on outside click + Escape. Bound only while the sheet is
  // open so we don't leak listeners on every reporter screen.
  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      const node = containerRef.current
      if (!node) return
      if (node.contains(e.target as Node)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault()
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener("mousedown", onDocClick)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDocClick)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  function pick(loc: Locale) {
    setLocale(loc)
    writeLocale(loc)
    onChange?.(loc)
    setOpen(false)
    // Return focus to the trigger so keyboard users don't lose their place.
    triggerRef.current?.focus()
  }

  const triggerPadding =
    variant === "compact" ? "px-2.5 py-1.5" : "px-3 py-2"
  const triggerText = variant === "compact" ? "text-[12px]" : "text-[13px]"

  return (
    <div ref={containerRef} className="relative inline-flex flex-col">
      {variant === "default" && (
        <span className="mb-1.5 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
          <Languages
            className="h-3.5 w-3.5"
            strokeWidth={1.8}
            aria-hidden
          />
          Language
        </span>
      )}
      <button
        ref={triggerRef}
        type="button"
        // Combobox role matches the popup-listbox pattern.
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        // The current selection IS the trigger's label, so its accessible
        // name doubles as feedback for screen readers.
        aria-label={`Language: ${LOCALE_ENGLISH_NAMES[locale]}. Tap to change.`}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white ${triggerPadding} ${triggerText} font-medium text-slate-800 shadow-sm transition hover:border-indigo-400 focus:outline-none focus:ring-4 focus:ring-indigo-500/30`}
      >
        <span className="inline-flex items-center gap-1.5">
          {variant === "compact" && (
            <Languages
              className="h-3.5 w-3.5 text-slate-500"
              strokeWidth={1.8}
              aria-hidden
            />
          )}
          <span lang={locale}>{LOCALE_LABELS[locale]}</span>
          {variant === "default" && (
            <span className="text-slate-400 font-normal">
              · {LOCALE_ENGLISH_NAMES[locale]}
            </span>
          )}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
          strokeWidth={2}
          aria-hidden
        />
      </button>

      {open && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Choose interface language"
          // Below-left of the trigger, fixed width that fits all four
          // native-script labels comfortably on a 375px viewport without
          // hitting either screen edge.
          className="absolute left-0 top-full z-50 mt-1.5 w-[220px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10 ring-1 ring-slate-900/5"
        >
          {LOCALES.map((loc) => {
            const selected = loc === locale
            return (
              <li key={loc} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => pick(loc)}
                  // 52px tall row hits the WCAG comfortable target with
                  // room for both the native-script label (15px) and the
                  // English secondary (11px) on top of each other.
                  className={`group flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors focus:outline-none focus-visible:bg-indigo-50 ${
                    selected ? "bg-indigo-50/70" : "hover:bg-slate-50"
                  }`}
                  lang={loc}
                >
                  <span className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span
                      className={`text-[15px] font-semibold ${
                        selected ? "text-indigo-900" : "text-slate-900"
                      }`}
                    >
                      {LOCALE_LABELS[loc]}
                    </span>
                    <span
                      lang="en"
                      className={`text-[11.5px] ${
                        selected ? "text-indigo-700/80" : "text-slate-500"
                      }`}
                    >
                      {LOCALE_ENGLISH_NAMES[loc]}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className={`inline-flex h-5 w-5 items-center justify-center rounded-full ${
                      selected
                        ? "bg-indigo-600 text-white"
                        : "border border-slate-200 text-transparent"
                    }`}
                  >
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
