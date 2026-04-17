# SafeReport — Visual Language v6

Design tokens, typography, iconography.
Single source of truth for Tailwind config and component styling.

---

## Palette philosophy

**v6 removes green and red from the palette.** Field testing showed users interpret green
as "all good — you don't need to report this" and red as "this is an emergency — call, don't
use the app." Both interpretations suppress the reports we want to elicit.

The v6 palette uses a **cool-warm axis** instead of a traffic-light system:

- **Cool** (Slate 600) → Observations (calm, neutral, observational)
- **Warm** (Amber 700) → Incidents (attention without alarm)

Status colours use Teal (completion, not green), Sky (in-progress), Orange (rework, not red),
and Indigo for all primary chrome.

---

## Colour tokens

Tailwind config — paste into `tailwind.config.ts` under `theme.extend.colors`.

```ts
colors: {
  // Primary / brand
  indigo: {
    900: '#1E1B4B', // deep headers, nav bars
    700: '#4338CA', // buttons, links, selected states, picker bracket border
    500: '#6366F1', // accents, focus rings
    100: '#E0E7FF', // hover states, picker centre-row fill
  },

  // Neutrals — slate scale
  slate: {
    900: '#0F172A', // body text
    700: '#334155', // strong secondary
    600: '#475569', // observations category, muted text, picker distance-1 rows
    400: '#94A3B8', // disabled, placeholder, picker distance-2 rows
    200: '#E2E8F0', // borders
    100: '#F1F5F9', // subtle backgrounds
    50:  '#F8FAFC', // page background
  },

  // Incidents — warm axis
  amber: {
    700: '#B45309', // incidents category (primary attention colour)
    500: '#F59E0B',
    100: '#FEF3C7',
  },

  // Status — Closed (replaces green)
  teal: {
    700: '#0F766E',
    500: '#14B8A6',
    100: '#CCFBF1',
  },

  // Status — Awaiting HO
  sky: {
    700: '#0369A1',
    500: '#0EA5E9',
    100: '#E0F2FE',
  },

  // Status — Returned (replaces red)
  orange: {
    700: '#C2410C',
    100: '#FFEDD5',
  },

  // Warm neutrals
  stone: {
    100: '#F5F5F4',
    50:  '#FAFAF9',
  },
}
```

---

## Semantic colour map

Use these aliases in components — never hard-code hex values.

| Semantic token        | Hex      | Tailwind class      | Used for                                    |
| --------------------- | -------- | ------------------- | ------------------------------------------- |
| `text-primary`        | #0F172A  | `text-slate-900`    | All body copy, headings, form labels        |
| `text-muted`          | #475569  | `text-slate-600`    | Helper text, captions, secondary labels     |
| `text-disabled`       | #94A3B8  | `text-slate-400`    | Disabled inputs, placeholders               |
| `bg-page`             | #F8FAFC  | `bg-slate-50`       | Page background                             |
| `bg-warm`             | #F5F5F4  | `bg-stone-100`      | Warm neutral plates (voice screen)          |
| `border-default`      | #E2E8F0  | `border-slate-200`  | All card/input borders                      |
| `brand-deep`          | #1E1B4B  | `bg-indigo-900`     | Top nav, primary header backgrounds         |
| `brand-primary`       | #4338CA  | `bg-indigo-700`     | Primary buttons, picker bracket border      |
| `brand-accent`        | #6366F1  | `text-indigo-500`   | Focus rings, section number markers         |
| `cat-observation`     | #475569  | `text-slate-600`    | Observation category icons/labels/badges    |
| `cat-incident`        | #B45309  | `text-amber-700`    | Incident category icons/labels/badges       |
| `status-new`          | #475569  | Slate 600           | Status badge: New                           |
| `status-acknowledged` | #4338CA  | Indigo 700          | Status badge: Acknowledged                  |
| `status-awaiting`     | #0369A1  | Sky 700             | Status badge: Awaiting HO                   |
| `status-closed`       | #0F766E  | Teal 700            | Status badge: Closed                        |
| `status-returned`     | #C2410C  | Orange 700          | Status badge: Returned                      |

**Rule:** Status and category are never communicated by colour alone. Every badge and tile
carries a text label and an icon in addition to the colour.

---

## Typography

Two Google-hosted faces via `next/font` — self-hosted, no layout shift, privacy-compliant.

```ts
// app/fonts.ts
import { DM_Sans, IBM_Plex_Sans } from 'next/font/google'

export const dmSans = DM_Sans({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '700'],
  variable: '--font-sans',
})

export const plex = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
})
```

### Type scale

| Token        | Size           | Line-height    | Use                                       |
| ------------ | -------------- | -------------- | ----------------------------------------- |
| `display-xl` | 48px / 3rem    | 56px / 3.5rem  | Cover pages, HO landing hero              |
| `display-l`  | 36px / 2.25rem | 44px / 2.75rem | Section heroes                            |
| `h1`         | 28px / 1.75rem | 36px / 2.25rem | Page titles                               |
| `h2`         | 20px / 1.25rem | 28px / 1.75rem | Section headers                           |
| `h3`         | 16px / 1rem    | 24px / 1.5rem  | Subsections, card titles                  |
| `body`       | 15px           | 24px           | Default paragraph text                    |
| `small`      | 13px           | 20px           | Captions, helper text                     |
| `tag`        | 11px           | 14px           | Status badges, pills                      |

Display sizes use IBM Plex Sans. Everything else uses DM Sans.

---

## Iconography

All icons from **Lucide** (`lucide-react`). No custom iconography in the pilot.

### Category icons

| Category                  | Icon name         | Category colour    |
| ------------------------- | ----------------- | ------------------ |
| `near_miss`               | `alert-triangle`  | Slate 600          |
| `unsafe_act`              | `user-x`          | Slate 600          |
| `unsafe_condition`        | `construction`    | Slate 600          |
| `first_aid_case`          | `bandage`         | Amber 700          |
| `medical_treatment_case`  | `stethoscope`     | Amber 700          |
| `restricted_work_case`    | `user-minus`      | Amber 700          |
| `lost_time_injury`        | `clock-alert`     | Amber 700          |
| `fatality`                | `shield-alert`    | Amber 700          |

### Icon sizing

- Category tiles (screen 2): 64×64 px
- Inline icons (inbox cards, status badges): 20×20 px
- Button icons: 16×16 px, stroke-width 1.8
- Header glyphs: 24×24 px, stroke-width 2

---

## Component patterns

### Cards
```
border: 1px solid slate-200
radius: 8px
padding: 16px
shadow: none (except on modals — sm)
hover: border → slate-400 (desktop only)
```

### Buttons
```
primary:    bg-indigo-700  text-white  radius-12  min-h-44  font-medium
secondary:  bg-white  border-slate-200  text-slate-900  radius-12  min-h-44
ghost:      text-indigo-700  underline-on-hover
danger-ish: bg-orange-700  text-white   (ONLY for destructive HO actions like void)
```

No green "success" button. Confirmations use `bg-teal-700`.

### Inputs
```
border: 1px solid slate-200
radius: 8px
padding: 12px
min-height: 44px
focus: ring-3 ring-indigo-500 ring-opacity-40 outline-none
```

### Status badges
```html
<span class="
  inline-flex items-center gap-1
  px-2 py-0.5 rounded-full
  text-[11px] font-bold uppercase tracking-wide
  text-white
  bg-{status-colour}
">
  <Icon size={12} />
  Closed
</span>
```

### Apple-style wheel picker

See [DESIGN.md §Screen 4](./DESIGN.md#screen-4--apple-style-wheel-picker) for interaction spec.

Visual tokens:
- Wheel background: `bg-white`
- Wheel container radius: `6px`
- Column gap: `0`
- Row height: `40px`
- Selected row: `bg-indigo-100`, `border-1 border-indigo-500`, `radius-3px`
- Selected text: `text-indigo-900 font-bold text-[14pt]`
- Distance-1 rows: `text-slate-600 text-[11pt]`
- Distance-2 rows: `text-slate-400 text-[9.5pt]`
- Snap animation: `180ms cubic-bezier(0.2, 0.9, 0.3, 1)`
- No bounce, no overshoot

---

## Accessibility floor

- Minimum tap target: 44×44 CSS px everywhere; 140×140 for category tiles on screen 2
- Contrast: 4.5:1 for body, 3:1 for large text (verified with axe-core in CI)
- All interactive elements have visible focus states
- All icon-only buttons carry `aria-label`
- Status changes use `aria-live="polite"` announcements
- Respects `prefers-reduced-motion` — picker snap animation reduces to 0ms
- Layout holds at 200% text zoom with no horizontal scroll

---

## What this palette deliberately excludes

- **No green.** Teal 700 replaces it for completion states. "Healthy" is not a colour we signal.
- **No red.** Orange 700 replaces it for rework/attention. Emergencies route through SMS, not UI chrome.
- **No coral, crimson, rose.** All warm reds are off the palette.
- **No dark mode.** Pilot scope. Revisit post-launch.
- **No gradients.** Flat fills only.
