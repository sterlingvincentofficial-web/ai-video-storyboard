"""Paints one texture atlas per enemy variant (plain python3: needs Pillow).

Atlas layout (UV space, v up), 1024px:
  face    u 0.0-0.5, v 0.5-1.0   head front: fur with the printed face
  belly   u 0.5-1.0, v 0.5-1.0   torso front: fur with the belly / chest print
  back    u 0.5-1.0, v 0.0-0.5   torso back: fur (silverback saddle etc.)
  swatch  u 0.0-0.5, v 0.0-0.5   4x4 grid of flat colors (fur, cream, ink, extras)
Out: assets/enemies/<Variant>.png
"""

import os
import sys

from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from enemy_defs import INK, VARIANTS, swatch_color, swatches  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "assets", "enemies")
S = 1024
T = S // 2          # tile size
SS = 2              # supersampling
BLUSH = (250, 214, 222)
APPROVED_HEAD = (2.3, 1.9)  # the approved monkey's head front; features scale from it


class Tile:
    """A tile painted in head/torso-front studs (centered, y up)."""

    def __init__(self, size_studs, bg):
        self.w, self.h = size_studs
        self.N = T * SS
        self.img = Image.new("RGB", (self.N, self.N), bg)
        self.d = ImageDraw.Draw(self.img)
        # feature coordinates are authored for the approved head; scale them to this head
        self.kx = self.w / APPROVED_HEAD[0]
        self.ky = self.h / APPROVED_HEAD[1]

    def p(self, x, y):
        return ((x * self.kx / self.w + 0.5) * self.N, (0.5 - y * self.ky / self.h) * self.N)

    def r(self, rx, ry):
        return rx * self.kx / self.w * self.N, ry * self.ky / self.h * self.N

    def ell(self, cx, cy, rx, ry, fill, d=None):
        x, y = self.p(cx, cy)
        ax, ay = self.r(rx, ry)
        (d or self.d).ellipse((x - ax, y - ay, x + ax, y + ay), fill=fill)

    def box(self, x0, y0, x1, y1, radius=0.0, **kw):
        """Rectangle between two stud corners in any order (optionally rounded)."""
        a, b = self.p(x0, y0), self.p(x1, y1)
        xy = (min(a[0], b[0]), min(a[1], b[1]), max(a[0], b[0]), max(a[1], b[1]))
        if radius:
            self.d.rounded_rectangle(xy, radius=int(radius * self.N), **kw)
        else:
            self.d.rectangle(xy, **kw)

    def poly(self, pts, fill):
        self.d.polygon([self.p(x, y) for x, y in pts], fill=fill)

    def line(self, pts, fill, width):
        self.d.line([self.p(x, y) for x, y in pts], fill=fill, width=int(width * self.N), joint="curve")

    def arc(self, x0, y0, x1, y1, a0, a1, fill, width):
        p0, p1 = self.p(x0, y0), self.p(x1, y1)
        self.d.arc((min(p0[0], p1[0]), min(p0[1], p1[1]), max(p0[0], p1[0]), max(p0[1], p1[1])), a0, a1,
                   fill=fill, width=int(width * self.N))

    def blush(self, pts, r=0.23, color=BLUSH):
        layer = Image.new("RGBA", self.img.size, (0, 0, 0, 0))
        ld = ImageDraw.Draw(layer)
        for (x, y) in pts:
            self.ell(x, y, r, r * 0.92, color + (255,), d=ld)
        layer = layer.filter(ImageFilter.GaussianBlur(self.N * 0.006))
        self.img.paste(layer, (0, 0), layer)

    def done(self):
        return self.img.resize((T, T), Image.LANCZOS)

# ---------------------------------------------------------------- faces


def monkey_mask(t, cream):
    """The approved cream face shape: two eye lobes, a dip, a wide muzzle."""
    for sx in (-1, 1):
        t.ell(sx * 0.44, 0.2, 0.4, 0.4, cream)
    t.ell(0, -0.05, 0.84, 0.45, cream)
    t.ell(0, -0.45, 1.05, 0.47, cream)


def dot_eyes(t, r=0.075, y=0.17, spread=0.18):
    for sx in (-1, 1):
        t.ell(sx * spread, y, r, r * 1.13, INK)


def face_monkey(t, v, expr):
    cream = v["cream"]
    monkey_mask(t, cream)
    if expr == "happy":
        t.blush([(-0.68, -0.38), (0.68, -0.38)])
        dot_eyes(t)
        t.ell(0, -0.03, 0.07, 0.075, INK)
        t.arc(-0.6, -0.03, 0.6, -0.57, 18, 162, INK, 0.018)
    elif expr == "smirk":
        t.blush([(-0.68, -0.38), (0.68, -0.38)], r=0.18)
        for sx in (-1, 1):  # half-lidded cocky eyes
            t.ell(sx * 0.19, 0.15, 0.085, 0.095, INK)
            t.box(sx * 0.19 - 0.11, 0.3, sx * 0.19 + 0.11, 0.17, fill=cream)
            t.line([(sx * 0.07, 0.19), (sx * 0.31, 0.21 if sx < 0 else 0.3)], INK, 0.014)
        t.ell(0, -0.04, 0.07, 0.075, INK)
        t.arc(-0.15, -0.05, 0.62, -0.5, 10, 120, INK, 0.018)   # one-sided grin
    elif expr == "goofy":
        t.blush([(-0.7, -0.36), (0.7, -0.36)])
        t.ell(-0.2, 0.18, 0.11, 0.12, (250, 250, 250))
        t.ell(-0.18, 0.17, 0.06, 0.065, INK)
        t.ell(0.19, 0.16, 0.07, 0.075, INK)               # mismatched eyes
        t.ell(0, -0.02, 0.065, 0.07, INK)
        x0, y0 = t.p(-0.45, -0.12)
        x1, y1 = t.p(0.45, -0.72)
        t.d.chord((x0, y0, x1, y1), 0, 180, fill=(70, 26, 26))  # big open grin
        t.ell(0.08, -0.6, 0.18, 0.11, (236, 120, 130))            # tongue
    elif expr == "angry":
        for sx in (-1, 1):
            t.ell(sx * 0.2, 0.1, 0.075, 0.085, INK)
            t.line([(sx * 0.06, 0.2), (sx * 0.36, 0.34)], INK, 0.03)   # V brows
        t.ell(0, -0.08, 0.075, 0.075, INK)
        t.box(-0.38, -0.3, 0.38, -0.52, fill=(250, 250, 244))  # gritted teeth
        for k in range(-3, 4):
            t.line([(k * 0.1, -0.3), (k * 0.1, -0.52)], INK, 0.006)
        t.line([(-0.38, -0.41), (0.38, -0.41)], INK, 0.006)
        t.box(-0.38, -0.3, 0.38, -0.52, outline=INK, width=int(0.012 * t.N))
    elif expr == "cute":
        t.blush([(-0.7, -0.3), (0.7, -0.3)], r=0.27)
        for sx in (-1, 1):  # big shiny eyes
            t.ell(sx * 0.24, 0.13, 0.15, 0.17, INK)
            t.ell(sx * 0.24 + 0.05, 0.2, 0.05, 0.05, (255, 255, 255))
            t.ell(sx * 0.24 - 0.04, 0.07, 0.025, 0.025, (255, 255, 255))
        t.ell(0, -0.1, 0.05, 0.05, INK)
        t.arc(-0.16, -0.08, 0.0, -0.3, 0, 180, INK, 0.014)       # little "w" mouth
        t.arc(0.0, -0.08, 0.16, -0.3, 0, 180, INK, 0.014)
    elif expr == "ninja":
        fur = v["fur"]
        t.box(-1.4, 0.38, 1.4, -0.02, fill=v["colors"]["mask"])  # mask band
        for sx in (-1, 1):
            t.ell(sx * 0.22, 0.17, 0.13, 0.08, (250, 250, 250))
            t.ell(sx * 0.2, 0.17, 0.06, 0.07, INK)
            t.line([(sx * 0.06, 0.27), (sx * 0.36, 0.33)], (250, 250, 250), 0.016)
        t.ell(0, -0.12, 0.065, 0.07, INK)
        t.line([(-0.22, -0.42), (0.22, -0.42)], INK, 0.016)
        del fur


def gorilla_mask(t, skin):
    """Gorilla face: broad skin area, heavy brow ridge, wide muzzle."""
    t.ell(0, -0.02, 0.92, 0.66, skin)
    t.ell(0, -0.5, 0.86, 0.4, skin)
    dark = tuple(int(c * 0.62) for c in skin)
    t.box(-0.84, 0.36, 0.84, 0.22, radius=0.05, fill=dark)  # brow ridge
    return dark


def face_gorilla(t, v, expr):
    dark = gorilla_mask(t, v["cream"])
    eye = {"gorilla_rage": (255, 50, 40), "gorilla_titan": (255, 200, 40)}.get(expr, (250, 246, 230))
    glow = expr in ("gorilla_rage", "gorilla_titan")
    for sx in (-1, 1):
        t.ell(sx * 0.3, 0.1, 0.12, 0.08, eye)
        if not glow:
            t.ell(sx * 0.3, 0.09, 0.055, 0.06, INK)
    # big nostrils
    for sx in (-1, 1):
        t.ell(sx * 0.13, -0.15, 0.09, 0.06, dark)
    if expr in ("gorilla_roar", "gorilla_rage", "gorilla_titan"):
        x0, y0 = t.p(-0.48, -0.3)
        x1, y1 = t.p(0.48, -0.84)
        t.d.ellipse((x0, y0, x1, y1), fill=(60, 18, 18))                   # roaring mouth
        for sx in (-1, 1):                                                  # fangs
            t.poly([(sx * 0.3, -0.33), (sx * 0.16, -0.33), (sx * 0.23, -0.5)], (250, 250, 240))
            t.poly([(sx * 0.3, -0.81), (sx * 0.16, -0.81), (sx * 0.23, -0.66)], (250, 250, 240))
    elif expr == "gorilla_smug":
        t.arc(-0.45, -0.3, 0.45, -0.62, 200, 340, INK, 0.02)
        t.arc(-0.1, -0.35, 0.5, -0.6, 10, 90, INK, 0.016)
    else:  # angry frown
        t.arc(-0.42, -0.4, 0.42, -0.78, 200, 340, INK, 0.022)
    if expr == "gorilla_titan":  # scar across the left eye
        t.line([(-0.55, 0.42), (-0.1, -0.15)], (190, 70, 70), 0.02)


def face_tile(v):
    h = v["body"]["head"]
    t = Tile((h[0], h[2]), v["fur"])
    if v.get("gorilla"):
        face_gorilla(t, v, v["face"])
    else:
        face_monkey(t, v, v["face"])
    return t.done()


def belly_tile(v):
    tw, _, th = v["body"]["torso"]
    t = Tile((tw, th), v["fur"])
    t.kx, t.ky = tw / 2.0, th / 2.0  # belly is authored on a 2x2 torso front
    if v.get("gorilla"):
        skin = v["cream"]
        for sx in (-1, 1):  # pecs + belly
            t.box(sx * 0.06, 0.62, sx * 0.82, 0.04, radius=0.08, fill=skin)
        t.ell(0, -0.5, 0.62, 0.5, skin)
    else:
        cream = v["cream"]
        t.ell(0.03, -0.62, 0.84, 0.9, cream)
        t.ell(0.0, -0.15, 0.7, 0.55, cream)
        t.ell(-0.28, 0.2, 0.42, 0.34, cream)
        t.ell(0.34, 0.16, 0.42, 0.33, cream)
    return t.done()


def back_tile(v):
    tw, _, th = v["body"]["torso"]
    t = Tile((tw, th), v["fur"])
    t.kx, t.ky = tw / 2.0, th / 2.0
    if v.get("back") == "silver":
        silver = v["colors"]["silver"]
        t.ell(0, 0.05, 0.95, 0.75, silver)
        for k in range(6):  # streaks
            t.line([(-0.7 + k * 0.28, 0.6), (-0.6 + k * 0.26, -0.5)], tuple(int(c * 0.85) for c in silver), 0.01)
    return t.done()


def swatch_tile(name):
    img = Image.new("RGB", (T, T))
    d = ImageDraw.Draw(img)
    q = T // 4
    for i, sw in enumerate(swatches(name)):
        col, row = i % 4, i // 4
        y0 = T - (row + 1) * q  # rows count up from the bottom (v up)
        d.rectangle((col * q, y0, col * q + q - 1, y0 + q - 1), fill=swatch_color(name, sw))
    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, v in VARIANTS.items():
        atlas = Image.new("RGB", (S, S), v["fur"])
        atlas.paste(face_tile(v), (0, 0))
        atlas.paste(belly_tile(v), (T, 0))
        atlas.paste(back_tile(v), (T, T))
        atlas.paste(swatch_tile(name), (0, T))
        atlas.save(os.path.join(OUT, f"{name}.png"))
    print("wrote", len(VARIANTS), "atlases to", OUT)


if __name__ == "__main__":
    main()
