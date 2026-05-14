"""Generate SafeReport PWA icons — 'SR' monogram on indigo-700.

Produces four PNGs:
  public/icons/icon-192.png         (standard, 192x192)
  public/icons/icon-512.png         (standard, 512x512)
  public/icons/icon-maskable-512.png (Android adaptive, 512x512 with safe zone)
  public/apple-touch-icon.png       (iOS home-screen, 180x180)

Palette per CLAUDE.md: indigo-700 background (#4338CA), white glyph.
Font: DejaVu Sans Bold (system) — IBM Plex is the design system display
face, but Plex isn't available in the build env, and the launcher icon
isn't rendered with the app's runtime fonts anyway. DejaVu Sans Bold
reads cleanly at 48dp on Android.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# Resolve relative to the script location so this works regardless of CWD.
# Layout: <repo>/scripts/gen_icons.py → <repo>/public/icons/
PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = PROJECT_ROOT / "public"
ICONS_DIR = OUT_DIR / "icons"

INDIGO_700 = (67, 56, 202, 255)  # #4338CA
WHITE = (255, 255, 255, 255)

FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

TEXT = "SR"


def fit_text_size(draw: ImageDraw.ImageDraw, target_px: int) -> int:
    """Binary-search the largest font size whose 'SR' bounding box fits target_px wide."""
    lo, hi, best = 10, 2000, 10
    while lo <= hi:
        mid = (lo + hi) // 2
        font = ImageFont.truetype(FONT_PATH, mid)
        bbox = draw.textbbox((0, 0), TEXT, font=font)
        w = bbox[2] - bbox[0]
        h = bbox[3] - bbox[1]
        # Constrain by width AND height so the glyph stays vertically centered.
        if w <= target_px and h <= target_px:
            best = mid
            lo = mid + 1
        else:
            hi = mid - 1
    return best


def render_monogram(size: int, glyph_pct: float, out_path: Path) -> None:
    """Render a size×size indigo tile with 'SR' centered.

    glyph_pct: fraction of the canvas the text bounding box should span.
      - 0.58 for standard icons (uses most of the tile, looks confident)
      - 0.40 for maskable (inside the inner 62% Android safe zone)
    """
    img = Image.new("RGBA", (size, size), INDIGO_700)
    draw = ImageDraw.Draw(img)

    target_px = int(size * glyph_pct)
    font_size = fit_text_size(draw, target_px)
    font = ImageFont.truetype(FONT_PATH, font_size)

    bbox = draw.textbbox((0, 0), TEXT, font=font)
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]

    # PIL's textbbox top is the visual top of the glyph (which can be > 0
    # because of internal padding) — subtract bbox[0]/bbox[1] when placing
    # so the glyph is true-centered on the canvas, not centered with its
    # padding included.
    x = (size - w) // 2 - bbox[0]
    y = (size - h) // 2 - bbox[1]

    draw.text((x, y), TEXT, font=font, fill=WHITE)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path, format="PNG", optimize=True)
    print(f"wrote {out_path} ({size}x{size}, font_size={font_size})")


def main() -> None:
    # Standard PWA icons — glyph fills ~58% of canvas
    render_monogram(192, 0.58, ICONS_DIR / "icon-192.png")
    render_monogram(512, 0.58, ICONS_DIR / "icon-512.png")

    # Maskable variant — Android adaptive icons crop up to ~20% off each
    # edge for shape masking. The "safe zone" is the inner 80% circle, but
    # to allow some breathing room around the glyph after the mask we keep
    # the SR inside the inner 60% — i.e. glyph_pct ~= 0.40 of the full
    # 512×512 canvas.
    render_monogram(512, 0.40, ICONS_DIR / "icon-maskable-512.png")

    # iOS home-screen — 180×180 is the modern Apple touch icon size.
    # iOS doesn't apply a mask, so we use the same fill ratio as the
    # standard icons.
    render_monogram(180, 0.58, OUT_DIR / "apple-touch-icon.png")


if __name__ == "__main__":
    main()
