"""Paints one texture atlas per army variant (plain python3: needs Pillow).

Same layout as the monkeys' atlases (enemy_textures.py), 1024px:
  face    u 0.0-0.5, v 0.5-1.0   head front: skin with the printed face
  chest   u 0.5-1.0, v 0.5-1.0   chest front: the shirt print (+ rank mark)
  back    u 0.5-1.0, v 0.0-0.5   chest back
  swatch  u 0.0-0.5, v 0.0-0.5   4x4 grid of flat colors
Out: assets/men/<Unit>_L<n>.png
"""

import os
import sys

from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from men_defs import GOLD, INK, MAN_BODY, STEEL, UNITS, colors, swatches, variants  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "assets", "men")
S = 1024
T = S // 2
SS = 2
BLUSH = (246, 160, 150)
WHITE = (250, 250, 250)


def shade(c, k):
    return tuple(max(0, min(255, int(x * k))) for x in c)


class Tile:
    """A tile painted on a w x h front face (centered, y up). Features are authored in studs on an
    `authored` face size and scale with the real one."""

    def __init__(self, size_studs, bg, authored=None):
        self.w, self.h = size_studs
        aw, ah = authored or size_studs
        self.kx, self.ky = self.w / aw, self.h / ah
        self.N = T * SS
        self.img = Image.new("RGB", (self.N, self.N), bg)
        self.d = ImageDraw.Draw(self.img)

    def p(self, x, y):
        return ((x * self.kx / self.w + 0.5) * self.N, (0.5 - y * self.ky / self.h) * self.N)

    def r(self, rx, ry):
        return rx * self.kx / self.w * self.N, ry * self.ky / self.h * self.N

    def ell(self, cx, cy, rx, ry, fill, d=None, outline=None, width=0):
        x, y = self.p(cx, cy)
        ax, ay = self.r(rx, ry)
        (d or self.d).ellipse((x - ax, y - ay, x + ax, y + ay), fill=fill, outline=outline,
                              width=int(width * self.N) if width else 0)

    def box(self, x0, y0, x1, y1, radius=0.0, **kw):
        a, b = self.p(x0, y0), self.p(x1, y1)
        xy = (min(a[0], b[0]), min(a[1], b[1]), max(a[0], b[0]), max(a[1], b[1]))
        if "width" in kw:
            kw["width"] = int(kw["width"] * self.N)
        if radius:
            self.d.rounded_rectangle(xy, radius=int(radius * self.kx / self.w * self.N), **kw)
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

    def chord(self, x0, y0, x1, y1, a0, a1, fill):
        p0, p1 = self.p(x0, y0), self.p(x1, y1)
        self.d.chord((min(p0[0], p1[0]), min(p0[1], p1[1]), max(p0[0], p1[0]), max(p0[1], p1[1])), a0, a1, fill=fill)

    def soft(self, pts, r, color, blur=0.006):
        layer = Image.new("RGBA", self.img.size, (0, 0, 0, 0))
        ld = ImageDraw.Draw(layer)
        for (x, y) in pts:
            self.ell(x, y, r, r * 0.8, color + (150,), d=ld)
        layer = layer.filter(ImageFilter.GaussianBlur(self.N * blur))
        self.img.paste(layer, (0, 0), layer)

    def done(self):
        return self.img.resize((T, T), Image.LANCZOS)

# ---------------------------------------------------------------- faces
# Authored on the head front (2.2 x 1.95 studs). Eyes sit at y ~0.12, the mouth at y ~-0.45.


def eyes(t, r=0.11, y=0.12, spread=0.36, shine=True):
    for sx in (-1, 1):
        t.ell(sx * spread, y, r, r * 1.22, INK)
        if shine:
            t.ell(sx * spread + r * 0.35, y + r * 0.5, r * 0.3, r * 0.3, WHITE)


def brows(t, c, y=0.42, spread=0.36, tilt=0.0, thick=0.07, length=0.42):
    for sx in (-1, 1):
        x0, x1 = sx * (spread - length / 2), sx * (spread + length / 2)
        t.line([(x0, y - tilt), (x1, y + tilt)], c, thick)


def smile(t, w=0.55, y=-0.32, depth=0.28, width=0.035):
    t.arc(-w, y + depth, w, y - depth, 20, 160, INK, width)


def face(t, u, expr):
    skin, hair = u["skin"], u["hair"]
    nose = shade(skin, 0.82)
    t.ell(0, -0.1, 0.13, 0.1, nose)                                   # little round nose
    if expr == "tough":
        eyes(t, r=0.1)
        brows(t, hair, y=0.36, tilt=-0.09, thick=0.09)                 # angry V
        t.box(-0.4, -0.36, 0.3, -0.58, radius=0.08, fill=WHITE, outline=INK, width=0.014)   # gritted grin
        for k in range(-2, 3):
            t.line([(k * 0.14 - 0.05, -0.36), (k * 0.14 - 0.05, -0.58)], INK, 0.008)
        t.box(0.52, -0.02, 0.82, -0.14, radius=0.03, fill=(250, 236, 214))  # plaster on the cheek
        t.line([(0.62, -0.08), (0.72, -0.08)], (210, 190, 170), 0.01)
    elif expr == "kid":
        eyes(t, r=0.14, y=0.13)
        brows(t, hair, y=0.46, tilt=0.03, thick=0.05, length=0.34)
        t.chord(-0.42, -0.2, 0.42, -0.72, 0, 180, (90, 30, 34))          # big open grin
        t.box(-0.12, -0.2, 0.12, -0.33, fill=WHITE)                       # front teeth
        t.line([(0, -0.2), (0, -0.33)], INK, 0.01)
        for (x, y) in ((-0.62, -0.18), (-0.52, -0.26), (-0.7, -0.28), (0.62, -0.18), (0.52, -0.26), (0.7, -0.28)):
            t.ell(x, y, 0.025, 0.025, shade(skin, 0.7))                   # freckles
        t.soft([(-0.66, -0.3), (0.66, -0.3)], 0.17, BLUSH)
    elif expr == "jolly":
        for sx in (-1, 1):                                                # happy squint eyes
            t.arc(sx * 0.36 - 0.13, 0.22, sx * 0.36 + 0.13, 0.0, 200, 340, INK, 0.035)
        brows(t, hair, y=0.42, tilt=0.04, thick=0.1, length=0.46)
        t.soft([(-0.62, -0.12), (0.62, -0.12)], 0.17, BLUSH)
        beard = hair
        t.ell(0, -0.62, 0.95, 0.5, beard)                                 # big beard
        for sx in (-1, 1):
            t.box(sx * 0.98, -0.1, sx * 0.72, -0.6, fill=beard)
        t.ell(0, -0.28, 0.42, 0.13, beard)                                # moustache
        t.chord(-0.24, -0.34, 0.24, -0.6, 0, 180, (90, 30, 34))           # laughing mouth
    elif expr == "squint":
        t.ell(-0.36, 0.12, 0.1, 0.12, INK)                                # one eye open...
        t.ell(-0.33, 0.17, 0.03, 0.03, WHITE)
        t.line([(0.24, 0.12), (0.5, 0.1)], INK, 0.035)                    # ...one eye shut (aiming)
        brows(t, hair, y=0.36, tilt=-0.04, thick=0.08)
        t.arc(-0.2, -0.28, 0.5, -0.56, 15, 120, INK, 0.03)                # half smirk
        for k in range(26):                                              # stubble
            x, y = -0.6 + (k % 9) * 0.15, -0.5 - (k // 9) * 0.1
            t.ell(x, y, 0.014, 0.014, shade(skin, 0.6))
    elif expr == "kind":
        eyes(t, r=0.09)
        for sx in (-1, 1):                                                # round glasses
            t.ell(sx * 0.36, 0.12, 0.24, 0.22, None, outline=INK, width=0.025)
        t.line([(-0.12, 0.14), (0.12, 0.14)], INK, 0.025)
        brows(t, hair, y=0.46, tilt=0.04, thick=0.05, length=0.36)
        smile(t, w=0.4, y=-0.36, depth=0.2)
        t.soft([(-0.66, -0.22), (0.66, -0.22)], 0.15, BLUSH)
    elif expr == "goofy":
        eyes(t, r=0.13, y=0.14)
        brows(t, hair, y=0.47, tilt=0.06, thick=0.05, length=0.3)
        t.chord(-0.55, -0.12, 0.55, -0.74, 0, 180, (90, 30, 34))         # huge grin
        t.box(-0.4, -0.12, 0.4, -0.24, fill=WHITE)
        t.ell(0.12, -0.6, 0.2, 0.1, (236, 120, 130))                     # tongue
        t.soft([(-0.72, -0.22), (0.72, -0.22)], 0.2, BLUSH)
    elif expr == "crazy":
        for sx in (-1, 1):                                                # wild wide eyes
            t.ell(sx * 0.36, 0.12, 0.2, 0.22, WHITE, outline=INK, width=0.02)
            t.ell(sx * 0.36 + sx * 0.05, 0.1, 0.07, 0.08, INK)
        brows(t, hair, y=0.46, tilt=0.08, thick=0.06, length=0.38)
        t.box(-0.5, -0.3, 0.5, -0.58, radius=0.1, fill=WHITE, outline=INK, width=0.016)
        for k in range(-3, 4):
            t.line([(k * 0.13, -0.3), (k * 0.13, -0.58)], INK, 0.008)
        t.line([(-0.5, -0.44), (0.5, -0.44)], INK, 0.008)
    elif expr == "focused":
        eyes(t, r=0.1)
        brows(t, hair, y=0.38, tilt=-0.05, thick=0.07)
        t.arc(-0.1, -0.26, 0.45, -0.5, 20, 130, INK, 0.03)                # confident half smile
        for (x, y) in ((-0.6, -0.2), (-0.5, -0.27), (0.6, -0.2), (0.5, -0.27)):
            t.ell(x, y, 0.022, 0.022, shade(skin, 0.72))
    elif expr == "stern":
        eyes(t, r=0.09, shine=False)
        brows(t, hair, y=0.36, tilt=-0.06, thick=0.1, length=0.48)
        t.arc(-0.26, -0.5, 0.26, -0.66, 200, 340, INK, 0.03)              # frown under the moustache
        # the moustache itself is geometry (build_men.py)
    elif expr == "noob":
        for sx in (-1, 1):                                                # the classic Roblox smile
            t.ell(sx * 0.3, 0.16, 0.09, 0.17, INK)
        t.arc(-0.6, 0.1, 0.6, -0.62, 25, 155, INK, 0.04)


def face_tile(u):
    hw, _, hh = MAN_BODY["head"]
    t = Tile((hw, hh), u["skin"], authored=(2.2, 1.95))
    # hair line peeking out under hats / on top of bare heads
    if u["hat"] in ("headband", "cap_back", "medic_cap", "ranger", "safari", "officer"):
        t.box(-1.2, 1.0, 1.2, 0.72, fill=u["hair"])
        for k in range(7):  # little fringe tufts
            x = -0.9 + k * 0.3
            t.poly([(x - 0.14, 0.73), (x + 0.14, 0.73), (x + 0.02, 0.6)], u["hair"])
    face(t, u, u["face"])
    return t.done()

# ---------------------------------------------------------------- chest prints (2.1 x 1.55 front)


def rank_mark(t, level):
    if level == 2:
        for k in range(2):  # steel double chevron on the left chest
            y = 0.38 - k * 0.15
            t.line([(-0.78, y), (-0.6, y - 0.1), (-0.42, y)], STEEL, 0.05)
    elif level == 3:
        import math
        pts = []
        for k in range(10):
            a = math.pi / 2 + k * math.pi / 5
            r = 0.2 if k % 2 == 0 else 0.085
            pts.append((-0.6 + math.cos(a) * r, 0.28 + math.sin(a) * r))
        t.poly(pts, GOLD)


def chest_tile(u, level, back=False):
    cw, _, ch = MAN_BODY["chest"]
    shirt, skin = u["shirt"], u["skin"]
    t = Tile((cw, ch), shirt, authored=(2.1, 1.55))
    pr = u["print"]
    dark = shade(shirt, 0.78)
    if pr == "tank":
        t.ell(0, 0.85, 0.42, 0.32, skin)                       # scoop neck
        for sx in (-1, 1):                                      # arm holes
            t.ell(sx * 1.1, 0.6, 0.32, 0.42, skin)
        t.box(-1.1, -0.55, 1.1, -0.78, fill=(214, 36, 36))     # red waistband stripe
    elif pr == "stripe":
        t.box(-1.1, 0.12, 1.1, -0.12, fill=WHITE)
        t.box(-1.1, -0.3, 1.1, -0.4, fill=WHITE)
        if not back:
            t.ell(0, 0.82, 0.32, 0.18, shade(shirt, 0.85))
    elif pr == "plaid":
        for k in range(-5, 6):                                  # flannel checks
            t.box(k * 0.22 - 0.04, 0.8, k * 0.22 + 0.04, -0.8, fill=dark)
            t.box(-1.1, k * 0.2 - 0.035, 1.1, k * 0.2 + 0.035, fill=dark)
        for sx in (-1, 1):                                      # suspenders
            t.box(sx * 0.62 - 0.09, 0.8, sx * 0.62 + 0.09, -0.8, fill=(40, 50, 80))
        if not back:
            t.ell(0, 0.82, 0.3, 0.18, skin)
    elif pr == "pockets":
        if not back:
            t.box(-0.06, 0.8, 0.06, -0.8, fill=dark)           # button placket
            for k in range(3):
                t.ell(0, 0.45 - k * 0.38, 0.05, 0.05, shade(shirt, 0.55))
            for sx in (-1, 1):
                t.box(sx * 0.25, 0.4, sx * 0.75, -0.05, radius=0.05, fill=dark)
                t.box(sx * 0.22, 0.45, sx * 0.78, 0.3, radius=0.04, fill=shade(shirt, 0.66))
            t.poly([(-0.36, 0.8), (0.36, 0.8), (0, 0.45)], skin)
    elif pr == "cross":
        if not back:
            t.box(-0.08, 0.8, 0.08, -0.8, fill=shade(shirt, 0.88))
            t.poly([(-0.42, 0.8), (0.42, 0.8), (0, 0.32)], (150, 200, 230))   # scrubs under the coat
            t.box(0.32, 0.28, 0.72, -0.08, fill=(220, 40, 40))
            t.box(0.44, 0.4, 0.6, -0.2, fill=(220, 40, 40))
            t.box(-0.78, -0.2, -0.36, -0.6, radius=0.04, fill=shade(shirt, 0.9))
            t.box(-0.7, -0.08, -0.66, -0.3, fill=(40, 90, 200))              # pens
            t.box(-0.58, -0.1, -0.54, -0.3, fill=(220, 40, 40))
        else:
            t.box(-0.35, 0.3, 0.35, -0.3, fill=(220, 40, 40))
            t.box(-0.12, 0.52, 0.12, -0.52, fill=(220, 40, 40))
    elif pr == "banana":
        for k in range(3):                                      # banana costume ridges + brown flecks
            t.arc(-1.6 + k * 0.6, 1.4, 0.4 + k * 0.6, -1.4, 100, 260, shade(shirt, 0.86), 0.03)
        for (x, y) in ((-0.5, 0.3), (0.6, -0.2), (0.1, -0.5), (-0.7, -0.45), (0.5, 0.5)):
            t.ell(x, y, 0.06, 0.05, (150, 104, 40))
    elif pr == "bandolier":
        strap = (90, 66, 40)
        t.poly([(-1.1, 0.85), (-0.7, 0.85), (1.1, -0.65), (1.1, -0.95), (0.8, -0.95)], strap)
        if not back:
            for k in range(4):
                x, y = -0.62 + k * 0.42, 0.42 - k * 0.36
                t.ell(x, y, 0.13, 0.15, (70, 90, 50))
                t.box(x - 0.05, y + 0.22, x + 0.05, y + 0.12, fill=(190, 190, 196))
    elif pr == "patch":
        if not back:
            t.ell(-0.55, 0.25, 0.28, 0.28, (240, 220, 160), outline=dark, width=0.02)
            t.ell(-0.55, 0.2, 0.09, 0.08, (90, 64, 40))                      # paw print
            for (dx, dy) in ((-0.13, 0.12), (-0.04, 0.17), (0.05, 0.17), (0.14, 0.12)):
                t.ell(-0.55 + dx, 0.2 + dy, 0.04, 0.04, (90, 64, 40))
            t.box(0.25, 0.35, 0.75, -0.05, radius=0.05, fill=dark)
            t.poly([(-0.32, 0.8), (0.32, 0.8), (0, 0.5)], u["skin"])
        else:
            t.ell(0, 0.1, 0.45, 0.45, (240, 220, 160))
            t.ell(0, 0.05, 0.15, 0.13, (90, 64, 40))
    elif pr == "uniform":
        if not back:
            for sx in (-1, 1):
                for k in range(3):
                    t.ell(sx * 0.3, 0.45 - k * 0.38, 0.065, 0.065, GOLD)
            t.poly([(-0.34, 0.8), (0.34, 0.8), (0, 0.42)], (240, 240, 236))    # shirt + tie
            t.poly([(-0.06, 0.62), (0.06, 0.62), (0.08, 0.3), (0, 0.24), (-0.08, 0.3)], (190, 30, 40))
            for k, c in enumerate(((220, 40, 40), (40, 120, 220), (250, 196, 40))):   # medal ribbons
                t.box(0.48 + k * 0.17, 0.42, 0.62 + k * 0.17, 0.3, fill=c)
                t.ell(0.55 + k * 0.17, 0.2, 0.06, 0.06, GOLD)
    if not back:
        rank_mark(t, level)
    return t.done()


def swatch_tile(unit, level):
    img = Image.new("RGB", (T, T))
    d = ImageDraw.Draw(img)
    q = T // 4
    c = colors(unit, level)
    for i, sw in enumerate(swatches(unit, level)):
        col, row = i % 4, i // 4
        y0 = T - (row + 1) * q
        d.rectangle((col * q, y0, col * q + q - 1, y0 + q - 1), fill=c[sw])
    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    for vname, unit, level in variants():
        u = UNITS[unit]
        atlas = Image.new("RGB", (S, S), u["shirt"])
        atlas.paste(face_tile(u), (0, 0))
        atlas.paste(chest_tile(u, level), (T, 0))
        atlas.paste(chest_tile(u, level, back=True), (T, T))
        atlas.paste(swatch_tile(unit, level), (0, T))
        atlas.save(os.path.join(OUT, f"{vname}.png"))
    print("wrote", len(variants()), "atlases to", OUT)


if __name__ == "__main__":
    main()
