#!/usr/bin/env python3
"""
Generates the app icon set from the PRD §23 palette.

A heart drawn from the classic parametric curve, in warm white, on a deep-rose
to romantic-pink gradient. Rendered at 4x and downsampled so the curve stays
smooth at favicon sizes.

Run: python3 scripts/generate-icons.py
"""

import math
import os
from PIL import Image, ImageDraw

DEEP_ROSE = (139, 30, 63)      # #8B1E3F
ROMANTIC_PINK = (196, 69, 105)  # #C44569
WARM_WHITE = (255, 248, 245)    # #FFF8F5

SS = 4  # supersampling factor
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")


def heart_points(cx, cy, scale, steps=720):
    """
    Classic heart curve, optically centred on (cx, cy).

    The curve spans y ∈ [-17, +12], so its midpoint sits 2.5 units above the
    origin. Without correcting for that the heart renders noticeably low.
    """
    Y_OFFSET = 2.5

    points = []
    for i in range(steps):
        t = 2 * math.pi * i / steps
        x = 16 * math.sin(t) ** 3
        y = (
            13 * math.cos(t)
            - 5 * math.cos(2 * t)
            - 2 * math.cos(3 * t)
            - math.cos(4 * t)
        )
        points.append((cx + x * scale, cy - (y + Y_OFFSET) * scale))
    return points


def rounded_gradient(size, radius_ratio, full_bleed=False):
    """Rounded square with a diagonal deep-rose → pink gradient."""
    gradient = Image.new("RGB", (size, size))
    draw = ImageDraw.Draw(gradient)

    for y in range(size):
        ratio = y / max(1, size - 1)
        colour = tuple(
            int(DEEP_ROSE[c] + (ROMANTIC_PINK[c] - DEEP_ROSE[c]) * ratio)
            for c in range(3)
        )
        draw.line([(0, y), (size, y)], fill=colour)

    if full_bleed:
        # Maskable icons are cropped by the platform; no rounding of our own.
        result = gradient.convert("RGBA")
        return result

    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, size - 1, size - 1], radius=int(size * radius_ratio), fill=255
    )

    result = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    result.paste(gradient, (0, 0), mask)
    return result


def make_icon(size, heart_ratio=0.0185, radius_ratio=0.22, full_bleed=False):
    big = size * SS
    canvas = rounded_gradient(big, radius_ratio, full_bleed=full_bleed)

    draw = ImageDraw.Draw(canvas)
    draw.polygon(
        heart_points(big / 2, big / 2, big * heart_ratio),
        fill=WARM_WHITE + (255,),
    )

    return canvas.resize((size, size), Image.LANCZOS)


def save(image, *path_parts):
    path = os.path.join(ROOT, *path_parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    image.save(path)
    print(f"  {os.path.relpath(path, ROOT)}  {image.size[0]}×{image.size[1]}")


def write_svg():
    """
    Crisp vector favicon, built from the same curve as the PNGs so the two
    can never drift apart.
    """
    size = 100
    points = heart_points(size / 2, size / 2, size * 0.0185, steps=180)
    path = "M " + " L ".join(f"{x:.2f} {y:.2f}" for x, y in points) + " Z"

    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#8B1E3F"/>
      <stop offset="1" stop-color="#C44569"/>
    </linearGradient>
  </defs>
  <rect width="{size}" height="{size}" rx="22" fill="url(#g)"/>
  <path d="{path}" fill="#FFF8F5"/>
</svg>
"""

    path_out = os.path.join(ROOT, "app", "icon.svg")
    with open(path_out, "w", encoding="utf8") as handle:
        handle.write(svg)
    print(f"  app/icon.svg  vector")


def main():
    print("Generating icons…")

    # PWA manifest icons.
    save(make_icon(192), "public", "icon-192.png")
    save(make_icon(512), "public", "icon-512.png")

    # Maskable: full bleed, heart shrunk into the 80% safe zone.
    save(
        make_icon(512, heart_ratio=0.0150, full_bleed=True),
        "public",
        "icon-maskable-512.png",
    )

    # Apple touch icon — iOS applies its own rounding, so no transparency.
    apple = make_icon(180, radius_ratio=0.0)
    save(apple.convert("RGB"), "app", "apple-icon.png")

    # Multi-resolution .ico for browsers that ignore SVG favicons.
    ico = make_icon(64, radius_ratio=0.16)
    ico.save(
        os.path.join(ROOT, "app", "favicon.ico"),
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64)],
    )
    print("  app/favicon.ico  16–64px")

    write_svg()

    print("Done.")


if __name__ == "__main__":
    main()
