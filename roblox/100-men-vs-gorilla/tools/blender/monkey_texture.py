"""Paints the Monkey texture atlas (run with plain python3: needs Pillow + numpy).

Matches the reference monkeys: streaky wood-grain brown fur, pale yellow hand/foot caps,
pale ears, and a flat printed monkey face (dot eyes, worried brows, frown) for the head front.

Atlas layout (UV space, v up):
  fur   u 0.0-0.5, v 0.0-1.0   grain runs along v (limb length)
  face  u 0.5-1.0, v 0.5-1.0   head front: fur background with the face drawn on it
  tip   u 0.5-0.75, v 0.25-0.5
  ear   u 0.75-1.0, v 0.25-0.5
  dark  u 0.5-0.75, v 0.0-0.25 (tail tip / spare)
Out: assets/monkey/MonkeyAtlas.png
"""

import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "assets", "monkey", "MonkeyAtlas.png")
S = 1024

FUR = np.array((96, 60, 34), dtype=np.float32)
FACE = (226, 216, 148)
FACE_EDGE = (176, 160, 104)
TIP = (240, 228, 138)
INK = (34, 22, 16)

# head geometry the face is projected onto (studs, matches build_monkey.py)
HEAD_HALF_W = 0.62
HEAD_BOTTOM, HEAD_TOP = 4.0, 5.25

rng = np.random.default_rng(11)


def grain(h, w):
    """Wood-grain-like fur: long vertical streaks with a little wobble and speckle."""
    cols = rng.normal(0, 1, (1, w)).astype(np.float32)
    cols = np.convolve(cols[0], np.ones(5) / 5, mode="same")[None, :]
    wobble = np.sin(np.linspace(0, 9, h)[:, None] + rng.uniform(0, 6, (1, w))) * 0.25
    streak = np.repeat(cols, h, axis=0) + wobble * 0.4
    fine = rng.normal(0, 1, (h, w)).astype(np.float32)
    fine = np.array(Image.fromarray(((fine * 30) + 128).clip(0, 255).astype(np.uint8)).filter(
        ImageFilter.BoxBlur(1)).resize((w, h)), dtype=np.float32) / 128 - 1
    shade = 1 + 0.16 * streak + 0.07 * fine
    return (FUR[None, None, :] * shade[:, :, None]).clip(0, 255)


def px(u, v):
    """Atlas UV -> pixel (x, y)."""
    return int(u * S), int((1 - v) * S)


def paint_face(tile_px):
    """Draws the monkey face onto a fur tile (tile_px x tile_px), 2x supersampled."""
    T = tile_px * 2
    img = Image.fromarray(grain(T, T).astype(np.uint8)).convert("RGBA")
    d = ImageDraw.Draw(img)

    def p(x, z):  # head-front studs -> tile pixels
        return ((x + HEAD_HALF_W) / (2 * HEAD_HALF_W) * T, (1 - (z - HEAD_BOTTOM) / (HEAD_TOP - HEAD_BOTTOM)) * T)

    def r(studs):
        return studs / (2 * HEAD_HALF_W) * T

    def ellipse(cx, cz, rx, rz, fill):
        x, y = p(cx, cz)
        d.ellipse((x - r(rx), y - r(rz), x + r(rx), y + r(rz)), fill=fill)

    # face mask: two eye lobes + a wide muzzle, with a darker rim drawn first
    for grow, color in ((0.03, FACE_EDGE), (0.0, FACE)):
        for sx in (-1, 1):
            ellipse(sx * 0.2, 4.74, 0.25 + grow, 0.25 + grow, color)
        ellipse(0, 4.38, 0.44 + grow, 0.27 + grow, color)
        ellipse(0, 4.58, 0.3 + grow, 0.2 + grow, color)
    # eyes + glints
    for sx in (-1, 1):
        ellipse(sx * 0.18, 4.74, 0.065, 0.075, INK)
        ellipse(sx * 0.18 + 0.02, 4.765, 0.02, 0.02, (255, 255, 255))
        # worried brows: inner end raised
        a, b = p(sx * 0.33, 4.9), p(sx * 0.08, 4.96)
        d.line((a, b), fill=INK, width=int(r(0.035)))
    # nostrils + frown
    for sx in (-1, 1):
        ellipse(sx * 0.055, 4.47, 0.025, 0.02, INK)
    x0, y0 = p(-0.16, 4.3)
    x1, y1 = p(0.16, 4.18)
    d.arc((x0, y0, x1, y1 + (y1 - y0)), 200, 340, fill=INK, width=int(r(0.03)))
    return img.resize((tile_px, tile_px), Image.LANCZOS).convert("RGB")


def main():
    atlas = Image.new("RGB", (S, S))
    # fur (left half)
    x0, y0 = px(0, 1)
    atlas.paste(Image.fromarray(grain(S, S // 2).astype(np.uint8)), (x0, y0))
    # face tile
    atlas.paste(paint_face(S // 2), px(0.5, 1.0))
    # tip + ear + dark tiles
    q = S // 4
    tip = Image.new("RGB", (q, q), TIP)
    atlas.paste(tip, px(0.5, 0.5))
    ear = Image.new("RGB", (q, q), FACE)
    ImageDraw.Draw(ear).ellipse((q * 0.1, q * 0.1, q * 0.9, q * 0.9), fill=FACE_EDGE)
    ImageDraw.Draw(ear).ellipse((q * 0.22, q * 0.22, q * 0.78, q * 0.78), fill=FACE)
    atlas.paste(ear, px(0.75, 0.5))
    atlas.paste(Image.fromarray(grain(q, q).astype(np.uint8)), px(0.5, 0.25))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    atlas.save(OUT)
    print("wrote", OUT)


if __name__ == "__main__":
    main()
