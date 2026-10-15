"""Paints the Monkey texture atlas (plain python3: needs Pillow).

Look (from the brown monkey concept art): flat toy-plastic brown and cream, a printed face
(two eye lobes + wide muzzle, three dots for eyes and nose, smile, pink cheeks) and a
printed cream belly.

Atlas layout (UV space, v up):
  brown  u 0.00-0.25, v 0.00-0.25   flat
  cream  u 0.25-0.50, v 0.00-0.25   flat
  face   u 0.00-0.50, v 0.50-1.00   head front: brown with the face printed on it
  belly  u 0.50-1.00, v 0.50-1.00   torso front: brown with the belly printed on it
Out: assets/monkey/MonkeyAtlas.png
"""

import os

from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "assets", "monkey", "MonkeyAtlas.png")
S = 1024

BROWN = (116, 80, 58)
CREAM = (250, 246, 182)
INK = (32, 30, 24)
BLUSH = (250, 214, 222)

# front faces the prints are projected onto (studs; must match build_monkey.py)
HEAD_FRONT = (2.3, 1.9)   # width, height
TORSO_FRONT = (2.0, 2.0)

SS = 2  # supersample


def canvas(size_studs, tile_px):
    """Returns (image, d, p, r): p maps studs (centered, y up) -> px, r maps stud radii per axis."""
    w, h = size_studs
    T = tile_px * SS
    img = Image.new("RGB", (T, T), BROWN)
    d = ImageDraw.Draw(img)

    def p(x, y):
        return ((x / w + 0.5) * T, (0.5 - y / h) * T)

    def ell(cx, cy, rx, ry, fill):
        x, y = p(cx, cy)
        d.ellipse((x - rx / w * T, y - ry / h * T, x + rx / w * T, y + ry / h * T), fill=fill)

    return img, d, p, ell


def face_tile(tile_px):
    img, d, p, ell = canvas(HEAD_FRONT, tile_px)
    # cream face: two eye lobes on top, a dip between them, wide muzzle almost to the bottom edge
    for sx in (-1, 1):
        ell(sx * 0.44, 0.2, 0.4, 0.4, CREAM)
    ell(0, -0.05, 0.84, 0.45, CREAM)
    ell(0, -0.45, 1.05, 0.47, CREAM)
    # pink cheeks, soft edged
    blush = Image.new("RGBA", img.size, (0, 0, 0, 0))
    bd = ImageDraw.Draw(blush)
    for sx in (-1, 1):
        x, y = p(sx * 0.68, -0.38)
        rx, ry = 0.23 / HEAD_FRONT[0] * img.size[0], 0.21 / HEAD_FRONT[1] * img.size[1]
        bd.ellipse((x - rx, y - ry, x + rx, y + ry), fill=BLUSH + (255,))
    blush = blush.filter(ImageFilter.GaussianBlur(img.size[0] * 0.006))
    img.paste(blush, (0, 0), blush)
    # eyes + nose: three dots
    for sx in (-1, 1):
        ell(sx * 0.18, 0.17, 0.075, 0.085, INK)
    ell(0, -0.03, 0.07, 0.075, INK)
    # wide smile
    x0, y0 = p(-0.6, -0.03)
    x1, y1 = p(0.6, -0.57)
    d.arc((x0, y0, x1, y1), 18, 162, fill=INK, width=int(img.size[0] * 0.018))
    return img.resize((tile_px, tile_px), Image.LANCZOS)


def belly_tile(tile_px):
    img, d, p, ell = canvas(TORSO_FRONT, tile_px)
    # pear-shaped belly, widest low down, running off the bottom edge
    ell(0.03, -0.62, 0.84, 0.9, CREAM)
    ell(0.0, -0.15, 0.7, 0.55, CREAM)
    ell(-0.28, 0.2, 0.42, 0.34, CREAM)   # wavy top edge
    ell(0.34, 0.16, 0.42, 0.33, CREAM)
    return img.resize((tile_px, tile_px), Image.LANCZOS)


def main():
    atlas = Image.new("RGB", (S, S), BROWN)
    d = ImageDraw.Draw(atlas)
    q = S // 4
    d.rectangle((0, S - q, q, S), fill=BROWN)          # brown tile (u 0-.25, v 0-.25)
    d.rectangle((q, S - q, 2 * q, S), fill=CREAM)      # cream tile (u .25-.5, v 0-.25)
    atlas.paste(face_tile(S // 2), (0, 0))             # u 0-.5, v .5-1
    atlas.paste(belly_tile(S // 2), (S // 2, 0))       # u .5-1, v .5-1
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    atlas.save(OUT)
    print("wrote", OUT)


if __name__ == "__main__":
    main()
