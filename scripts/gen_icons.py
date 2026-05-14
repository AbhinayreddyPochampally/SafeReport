"""Generate SafeReport PWA icons from the master SVG.

Master art: public/icons/safereport-icon.svg (shield + speech bubble + alert
mark on navy gradient). Produces four PNGs:

  public/icons/icon-192.png          (standard, 192x192)
  public/icons/icon-512.png          (standard, 512x512)
  public/icons/icon-maskable-512.png (Android adaptive, 512x512 with safe zone)
  public/apple-touch-icon.png        (iOS home-screen, 180x180)

Maskable variant: Android adaptive icons crop up to ~20% off each edge for
shape masking (circle, squircle, teardrop, etc.). We wrap the master art in
a scale-0.78 transform centered on the canvas, with the navy gradient filling
the whole tile, so the shield sits well inside the safe zone regardless of
how aggressively the launcher's mask crops.

Standard variant: SVG rendered as-is (the rx=210 rounded corners are kept;
iOS uses them for its home-screen tile, modern Chromium ignores them).

Run from the project root: `python3 scripts/gen_icons.py`. Needs cairosvg.
"""

from __future__ import annotations

import re
from pathlib import Path

import cairosvg

PROJECT_ROOT = Path(__file__).resolve().parent.parent
ICONS_DIR = PROJECT_ROOT / "public" / "icons"
PUBLIC_DIR = PROJECT_ROOT / "public"
SOURCE_SVG = ICONS_DIR / "safereport-icon.svg"


def render(svg_text: str, size: int, out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    cairosvg.svg2png(
        bytestring=svg_text.encode("utf-8"),
        output_width=size,
        output_height=size,
        write_to=str(out_path),
    )
    print(f"wrote {out_path} ({size}x{size})")


def maskable_variant(svg_text: str) -> str:
    """Return a copy of the master SVG with the inner art scaled to 78% of
    the canvas, centred. Android adaptive icons crop up to 20% off each edge,
    so this gives the shield plenty of breathing room within the safe zone.
    The navy gradient background fills the full tile.

    Implementation: find every `<rect ... rx="210" ...>` (the background
    tiles) and remove the rounded corners — the OS mask handles the shape.
    Then wrap the rest of the body in a centred scale transform.
    """
    # Strip the rounded corners on background rects (mask will handle shape).
    svg_text = re.sub(r'(<rect[^/>]*?)\srx="210"', r"\1", svg_text)

    # Wrap the painted content (everything after the closing </defs>) in a
    # scale-0.78 group centred on (512, 512). The background rects stay
    # unscaled so the gradient fills the whole maskable canvas.
    defs_close = "</defs>"
    bg_rects_end = svg_text.find('fill="url(#glow)"/>')
    if bg_rects_end == -1:
        raise RuntimeError("Could not locate background rect marker")
    bg_rects_end = svg_text.find(">", bg_rects_end) + 1  # past the '/>'

    head = svg_text[:bg_rects_end]
    tail = svg_text[bg_rects_end:]
    # tail still has the </svg> closing tag at the end — split it off.
    svg_close = tail.rfind("</svg>")
    body = tail[:svg_close]
    closing = tail[svg_close:]

    wrapped = (
        head
        + '\n  <g transform="translate(512 512) scale(0.78) translate(-512 -512)">\n'
        + body
        + "\n  </g>\n"
        + closing
    )
    return wrapped


def main() -> None:
    if not SOURCE_SVG.exists():
        raise SystemExit(f"missing {SOURCE_SVG}")

    svg = SOURCE_SVG.read_text(encoding="utf-8")

    # Standard icons — render the master SVG as-is.
    render(svg, 192, ICONS_DIR / "icon-192.png")
    render(svg, 512, ICONS_DIR / "icon-512.png")

    # iOS home-screen — 180x180.
    render(svg, 180, PUBLIC_DIR / "apple-touch-icon.png")

    # Maskable — scaled-down variant so adaptive icon masks don't clip the
    # shield silhouette.
    maskable_svg = maskable_variant(svg)
    render(maskable_svg, 512, ICONS_DIR / "icon-maskable-512.png")


if __name__ == "__main__":
    main()
