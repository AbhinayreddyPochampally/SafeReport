"""Measure overlay coordinates from public/poster-template.png.

Prints the seven PDF-space constants that lib/poster.ts uses to overlay the
QR code and the Store Code text on the baked template.

Run after any template swap (e.g. the v4 "See Something? Say Something."
redesign in May 2026) to get exact numbers, then drop them into the
constants block at the top of lib/poster.ts.

Detection strategy is structural — fit-for-purpose for the ABF template
family, not a general OCR pass:

  - The QR placeholder is the only large hollow white rectangle in the
    central column. Label white connected components, find the one
    containing the probe point (centre column, ~30% down the page), take
    its bounding box. That bbox is the placeholder INTERIOR; poster.ts
    applies its own small inset on top.
  - The Store Code underline is the only long horizontal black line in
    the bottom-right corner. Label dark components there, pick the one
    whose aspect ratio is most line-like.

Dependencies: numpy, Pillow, scipy. Install with:
  pip install scipy --break-system-packages

Usage:  python3 scripts/measure-template.py [path/to/template.png]
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

PAGE_W = 595.28
PAGE_H = 841.89

QR_PROBE_X = 0.50
QR_PROBE_Y = 0.30

CODE_SEARCH_X = (0.65, 0.99)
CODE_SEARCH_Y = (0.92, 0.99)

DARK_THRESHOLD = 80
LIGHT_THRESHOLD = 220


def measure(path):
    im = Image.open(path).convert("L")
    arr = np.asarray(im)
    h, w = arr.shape

    qr = _find_qr_placeholder(arr, w, h)
    code = _find_code_underline(arr, w, h)

    def x_to_pt(px):
        return px / w * PAGE_W

    def y_to_pt(py):
        return (1 - py / h) * PAGE_H

    return {
        "QR_LEFT": x_to_pt(qr["left"]),
        "QR_RIGHT": x_to_pt(qr["right"]),
        "QR_TOP": y_to_pt(qr["top"]),
        "QR_BOTTOM": y_to_pt(qr["bottom"]),
        "CODE_UNDERLINE_X_START": x_to_pt(code["left"]),
        "CODE_UNDERLINE_X_END": x_to_pt(code["right"]),
        "CODE_UNDERLINE_Y": y_to_pt(code["y"]),
    }


def _find_qr_placeholder(arr, w, h):
    """Label white components; sweep probe Y values to find the placeholder.

    The placeholder's vertical position drifts between template versions
    (v3 was at image y=395..894, v4 at y=486..885). We sweep probe Ys
    down the central column, label white connected components for each,
    and pick the smallest "page-scale" component — that's the placeholder
    interior. The page background is one giant component (~70% of pixels);
    icons / margins are tiny components. The placeholder sits in between.
    """
    light = arr >= LIGHT_THRESHOLD
    labeled, _ = ndimage.label(light)

    page_pixels = w * h
    candidates = []
    px = int(QR_PROBE_X * w)
    for frac in (0.30, 0.35, 0.40, 0.45, 0.50, 0.55):
        py = int(frac * h)
        lbl = labeled[py, px]
        if lbl == 0:
            continue
        size = int((labeled == lbl).sum())
        # Reject the page-background component (huge) and tiny icon regions.
        if size > page_pixels * 0.5:
            continue
        if size < page_pixels * 0.02:
            continue
        candidates.append((size, lbl, py))

    if not candidates:
        raise SystemExit(
            "No placeholder-sized white region found at any sweep probe. "
            "Check QR_PROBE_X or the template layout."
        )

    # Multiple sweep Ys may land on the same placeholder — dedupe by label.
    chosen_label = candidates[0][1]
    ys, xs = np.where(labeled == chosen_label)
    return {
        "left": int(xs.min()),
        "right": int(xs.max()),
        "top": int(ys.min()),
        "bottom": int(ys.max()),
    }


def _find_code_underline(arr, w, h):
    x0, x1 = int(CODE_SEARCH_X[0] * w), int(CODE_SEARCH_X[1] * w)
    y0, y1 = int(CODE_SEARCH_Y[0] * h), int(CODE_SEARCH_Y[1] * h)

    sub = arr[y0:y1, x0:x1]
    dark = sub < DARK_THRESHOLD
    labeled, n = ndimage.label(dark)
    if n == 0:
        raise SystemExit("No dark pixels found in the Store Code search region.")

    best_score = -1.0
    best_comp = -1
    best_box = (0, 0, 0, 0)
    for lbl in range(1, n + 1):
        ys, xs = np.where(labeled == lbl)
        if xs.size < 30:
            continue
        width = xs.max() - xs.min() + 1
        height = ys.max() - ys.min() + 1
        if height == 0 or width < 50:
            continue
        aspect = width / height
        if aspect < 8:
            continue
        score = width * aspect
        if score > best_score:
            best_score = score
            best_comp = lbl
            best_box = (int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max()))

    if best_comp < 0:
        raise SystemExit(
            "No line-shaped dark component found in the Store Code region."
        )

    xmin, xmax, ymin, ymax = best_box
    y_centre = (ymin + ymax) // 2
    return {"left": x0 + xmin, "right": x0 + xmax, "y": y0 + y_centre}


def main(argv):
    if len(argv) > 1:
        path = Path(argv[1])
    else:
        path = Path(__file__).resolve().parent.parent / "public" / "poster-template.png"
    if not path.exists():
        print("Template not found: %s" % path, file=sys.stderr)
        return 1

    coords = measure(path)
    im = Image.open(path)
    print("# Measured from %s (%dx%d)" % (path.name, im.size[0], im.size[1]))
    print("# Paste into lib/poster.ts:")
    print()
    for k, v in coords.items():
        print("const %-26s = %.0f" % (k, v))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
