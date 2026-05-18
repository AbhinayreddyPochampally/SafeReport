/**
 * SafeReport designed app icon — inline SVG.
 *
 * Source of truth: public/icons/safereport-icon.svg. That file is the
 * single authored asset (also baked into icon-192/512.png + maskable-512
 * via scripts/gen_icons.py for the PWA manifest + apple-touch-icon).
 * This React component carries the same vector inline so the brand
 * mark renders on the first paint without an HTTP request and can be
 * styled / sized fluidly across surfaces.
 *
 * The icon is the brand identity: navy rounded-square tile, white shield
 * with the navy interior, a white report card with three navy text-line
 * pills, and a warm orange (#EA580C) alert mark. CLAUDE.md was written
 * before this was authored and still describes the brand mark as a
 * "rounded indigo-700 tile with white ShieldCheck" — that earlier
 * placeholder is superseded by this component. Indigo-700 remains the
 * primary CTA colour per the hard rules; only the brand mark changes.
 *
 * Pass `size` in CSS pixels (renders as both width and height). Default
 * 40 matches the brand-bar tile used across the reporter + manager
 * surfaces. The `aria-label` defaults to "SafeReport" so a screen reader
 * announces the brand without the parent needing to set it; pass
 * `aria-hidden` for decorative renders (e.g. inside the cinematic intro
 * overlay where the brand is already announced by the dialog label).
 */

type Props = {
  size?: number
  className?: string
  "aria-hidden"?: boolean
  "aria-label"?: string
  title?: string
}

export function AppIcon({
  size = 40,
  className,
  "aria-hidden": ariaHidden,
  "aria-label": ariaLabel,
  title,
}: Props) {
  const isDecorative = ariaHidden === true
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role={isDecorative ? undefined : "img"}
      aria-label={isDecorative ? undefined : (ariaLabel ?? "SafeReport")}
      aria-hidden={isDecorative ? true : undefined}
      className={className}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        {/* Navy gradient on the tile — top-left lighter, bottom-right
            deeper. Matches the authored SVG exactly. */}
        <linearGradient id="srAppIconBg" x1="160" y1="80" x2="880" y2="940" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0A1F46" />
          <stop offset="1" stopColor="#03142F" />
        </linearGradient>
        <radialGradient
          id="srAppIconGlow"
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(520 410) rotate(90) scale(520)"
        >
          <stop offset="0" stopColor="#12366D" stopOpacity="0.65" />
          <stop offset="1" stopColor="#0A1F46" stopOpacity="0" />
        </radialGradient>
        <filter id="srAppIconShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="18" stdDeviation="22" floodColor="#000000" floodOpacity="0.22" />
        </filter>
      </defs>
      {/* App icon background */}
      <rect width="1024" height="1024" rx="210" fill="url(#srAppIconBg)" />
      <rect width="1024" height="1024" rx="210" fill="url(#srAppIconGlow)" />
      {/* Outer shield (white) */}
      <path
        d="M512 113C430 203 318 247 209 257V512C209 681 333 796 512 880C691 796 815 681 815 512V257C706 247 594 203 512 113Z"
        fill="#FFFFFF"
        filter="url(#srAppIconShadow)"
      />
      {/* Inner shield cutout (navy) */}
      <path
        d="M512 176C438 239 347 274 271 282V511C271 640 361 734 512 808C663 734 753 640 753 511V282C677 274 586 239 512 176Z"
        fill="#0A1F46"
      />
      {/* Report / speech card */}
      <path
        d="M333 333H692C711 333 726 348 726 367V593C726 625 700 651 668 651H515C504 651 493 655 485 663L402 736C390 746 371 738 371 722V674C371 661 361 651 348 651H333C314 651 299 636 299 617V367C299 348 314 333 333 333Z"
        fill="#FFFFFF"
        filter="url(#srAppIconShadow)"
      />
      {/* Three navy text-line pills */}
      <rect x="374" y="419" width="164" height="26" rx="13" fill="#0A1F46" />
      <rect x="374" y="489" width="164" height="26" rx="13" fill="#0A1F46" />
      <rect x="374" y="559" width="164" height="26" rx="13" fill="#0A1F46" />
      {/* Warm-orange alert mark — body + dot */}
      <path
        d="M594 389C594 376 605 365 618 365H642C655 365 666 376 665 389L653 526C652 541 640 553 625 553C610 553 598 541 597 526L594 389Z"
        fill="#EA580C"
      />
      <circle cx="625" cy="611" r="32" fill="#EA580C" />
    </svg>
  )
}
