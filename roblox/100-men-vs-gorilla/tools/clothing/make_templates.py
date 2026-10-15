"""Draws classic Roblox Shirt/Pants templates (585x559) for the men's outfits.

Upload the PNGs in Studio (Asset Manager > Bulk Import), then paste the image IDs into
src/shared/Units.luau. Run: python3 tools/clothing/make_templates.py
"""

import os
import random

from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "assets", "men")
os.makedirs(OUT, exist_ok=True)

W, H = 585, 559

# Classic template regions: (x, y, w, h)
TORSO = {"up": (231, 8, 128, 64), "front": (231, 74, 128, 128), "right": (165, 74, 64, 128),
         "left": (361, 74, 64, 128), "back": (427, 74, 128, 128), "down": (231, 204, 128, 64)}
# On a shirt these are the arms; on pants the same boxes are the legs.
LIMB_A = {"up": (217, 289, 64, 64), "left": (19, 355, 64, 128), "back": (85, 355, 64, 128),
          "right": (151, 355, 64, 128), "front": (217, 355, 64, 128), "down": (217, 485, 64, 64)}
LIMB_B = {"up": (308, 289, 64, 64), "front": (308, 355, 64, 128), "left": (374, 355, 64, 128),
          "back": (440, 355, 64, 128), "right": (506, 355, 64, 128), "down": (308, 485, 64, 64)}


def fabric(w, h, color, grain=10, seed=0, vertical=False):
    """Solid color with fine fabric noise."""
    rnd = random.Random(seed)
    im = Image.new("RGBA", (w, h), color + (255,))
    px = im.load()
    for y in range(h):
        for x in range(w):
            n = rnd.randint(-grain, grain)
            if vertical and x % 3 == 0:
                n -= 6
            r, g, b, a = px[x, y]
            px[x, y] = (max(0, min(255, r + n)), max(0, min(255, g + n)), max(0, min(255, b + n)), a)
    return im


def shade(im, top=0.0, bottom=0.0):
    """Darkens toward the bottom (or top) edge to fake folds and depth."""
    w, h = im.size
    px = im.load()
    for y in range(h):
        k = 1 - (top * (1 - y / h) + bottom * (y / h))
        for x in range(w):
            r, g, b, a = px[x, y]
            px[x, y] = (int(r * k), int(g * k), int(b * k), a)
    return im


def tank_top():
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    white = (240, 240, 234)
    for face, (x, y, w, h) in TORSO.items():
        if face == "up":
            continue  # shoulders stay bare (transparent -> skin shows)
        cloth = shade(fabric(w, h, white, 7, seed=hash(face) & 0xFFFF), bottom=0.12)
        if face in ("front", "back"):
            d = ImageDraw.Draw(cloth)
            scoop = 34 if face == "front" else 22
            d.ellipse((w / 2 - 34, -scoop, w / 2 + 34, scoop), fill=(0, 0, 0, 0))   # neckline
            for sx in (0, w - 22):                                                 # armholes
                d.rectangle((sx, 0, sx + 21, 18), fill=(0, 0, 0, 0))
            d.arc((w / 2 - 36, -scoop - 2, w / 2 + 36, scoop + 2), 0, 180, fill=(200, 200, 192, 255), width=3)
            for k in range(5):  # rib lines
                yk = 46 + k * 16
                d.line((14, yk, w - 14, yk + 2), fill=(225, 225, 218, 255), width=1)
        if face in ("left", "right"):
            d = ImageDraw.Draw(cloth)
            d.rectangle((0, 0, w, 20), fill=(0, 0, 0, 0))                          # armhole from the side
        img.alpha_composite(cloth, (x, y))
    return img


def jeans():
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    denim = (46, 78, 132)
    # belt across the bottom of the torso
    for face in ("front", "back", "left", "right"):
        x, y, w, h = TORSO[face]
        belt = fabric(w, 18, (62, 40, 24), 6, seed=5)
        img.alpha_composite(belt, (x, y + h - 18))
        if face == "front":
            d = ImageDraw.Draw(img)
            d.rectangle((x + w / 2 - 9, y + h - 17, x + w / 2 + 9, y + h - 2), outline=(205, 175, 70, 255), width=3)
    for limb, seed in ((LIMB_A, 11), (LIMB_B, 23)):
        for face, (x, y, w, h) in limb.items():
            if face in ("up",):
                continue
            leg = fabric(w, h, denim, 12, seed=seed + len(face), vertical=True)
            d = ImageDraw.Draw(leg)
            if face != "down":
                d.line((w / 2, 0, w / 2, h), fill=(205, 165, 80, 255), width=1)        # seam stitch
                d.rectangle((0, h - 30, w, h), fill=(32, 30, 32, 255))                 # shoes
                d.line((0, h - 31, w, h - 31), fill=(60, 58, 60, 255), width=2)
                knee = Image.new("RGBA", (w, h), (0, 0, 0, 0))
                ImageDraw.Draw(knee).ellipse((w * 0.2, h * 0.36, w * 0.8, h * 0.54), fill=(150, 175, 215, 45))
                leg.alpha_composite(knee.filter(ImageFilter.GaussianBlur(4)))  # worn knee
            else:
                d.rectangle((0, 0, w, h), fill=(32, 30, 32, 255))                     # soles
            img.alpha_composite(shade(leg, top=0.08), (x, y))
    return img


tank_top().save(os.path.join(OUT, "Brawler_Shirt.png"))
jeans().save(os.path.join(OUT, "Brawler_Pants.png"))
print("wrote", OUT)
