"""Generates the Rojo .model.json files for the style-test scene.

Every model is described in local coordinates (feet at y=0, facing -Z, which is
Roblox's "forward"), then placed into the world. All colors and materials come
from PALETTE so the whole look can be re-skinned in one spot once we lock the
reference style.

Run:  python3 tools/build_models.py
Out:  src/workspace/*.model.json  +  tools/preview/scene.json (for the preview render)
"""

import json
import math
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "src", "workspace")
PREVIEW_DIR = os.path.join(ROOT, "tools", "preview")

# ---------------------------------------------------------------- style palette
PALETTE = {
    # monkey
    "fur": (0.42, 0.25, 0.13),
    "fur_dark": (0.30, 0.17, 0.09),
    "skin_monkey": (0.93, 0.76, 0.56),
    "eye_white": (1.0, 1.0, 1.0),
    "pupil": (0.08, 0.06, 0.06),
    "mouth": (0.35, 0.12, 0.10),
    # brawler
    "skin_man": (0.96, 0.78, 0.62),
    "hair": (0.22, 0.14, 0.09),
    "tank_top": (0.95, 0.95, 0.92),
    "jeans": (0.20, 0.36, 0.62),
    "belt": (0.33, 0.20, 0.11),
    "shoes": (0.18, 0.16, 0.16),
    "wraps": (0.92, 0.90, 0.84),
    "bandana": (0.86, 0.16, 0.16),
    # map
    "grass": (0.36, 0.72, 0.25),
    "grass_light": (0.50, 0.82, 0.32),
    "dirt": (0.55, 0.38, 0.22),
    "dirt_dark": (0.40, 0.27, 0.16),
    "path": (0.80, 0.64, 0.42),
    "wood": (0.55, 0.36, 0.19),
    "wood_dark": (0.40, 0.25, 0.13),
    "leaf": (0.20, 0.62, 0.20),
    "leaf_dark": (0.13, 0.48, 0.16),
    "palm_leaf": (0.30, 0.70, 0.22),
    "trunk": (0.50, 0.36, 0.22),
    "rock": (0.55, 0.56, 0.58),
    "rock_dark": (0.42, 0.43, 0.46),
    "banana": (1.0, 0.86, 0.20),
    "fire": (1.0, 0.55, 0.10),
    "fire_core": (1.0, 0.85, 0.30),
    "flag": (0.86, 0.16, 0.16),
}

# ---------------------------------------------------------------- math helpers


def rot_matrix(rx=0.0, ry=0.0, rz=0.0):
    """Same as Roblox CFrame.Angles(rx, ry, rz) (degrees): R = Rx * Ry * Rz."""
    rx, ry, rz = (math.radians(a) for a in (rx, ry, rz))
    cx, sx = math.cos(rx), math.sin(rx)
    cy, sy = math.cos(ry), math.sin(ry)
    cz, sz = math.cos(rz), math.sin(rz)
    Rx = [[1, 0, 0], [0, cx, -sx], [0, sx, cx]]
    Ry = [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]]
    Rz = [[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]]
    return matmul(matmul(Rx, Ry), Rz)


def matmul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)] for i in range(3)]


def matvec(m, v):
    return [sum(m[i][k] * v[k] for k in range(3)) for i in range(3)]



class Builder:
    """Collects parts for one model in local space."""

    def __init__(self, name):
        self.name = name
        self.parts = []

    def add(self, name, size, pos, color, material="SmoothPlastic", shape="Block",
            rot=(0, 0, 0), transparency=0.0, cast_shadow=True, neon=False):
        if shape == "Ball":
            d = min(size)
            size = (d, d, d)
        self.parts.append({
            "name": name,
            "size": list(size),
            "pos": list(pos),
            "rot": rot_matrix(*rot),
            "color": PALETTE[color] if isinstance(color, str) else color,
            "material": "Neon" if neon else material,
            "shape": shape,
            "transparency": transparency,
            "cast_shadow": cast_shadow,
        })

    def mirror_x(self, name, size, pos, color, rot=(0, 0, 0), **kw):
        """Adds a left/right pair, mirrored across the X axis."""
        x, y, z = pos
        rx, ry, rz = rot
        self.add("Left" + name, size, (-x, y, z), color, rot=(rx, -ry, -rz), **kw)
        self.add("Right" + name, size, (x, y, z), color, rot=(rx, ry, rz), **kw)

    def placed(self, origin=(0, 0, 0), yaw=0.0):
        """Returns the parts moved into world space."""
        R = rot_matrix(0, yaw, 0)
        out = []
        for p in self.parts:
            q = dict(p)
            wp = matvec(R, p["pos"])
            q["pos"] = [wp[i] + origin[i] for i in range(3)]
            q["rot"] = matmul(R, p["rot"])
            out.append(q)
        return out

# ---------------------------------------------------------------- monkey


def build_monkey():
    b = Builder("Monkey")
    # body
    b.add("Body", (2.3, 2.3, 2.3), (0, 1.85, 0), "fur", shape="Ball")
    b.add("Belly", (1.6, 1.6, 1.6), (0, 1.75, -0.55), "skin_monkey", shape="Ball")
    # head
    b.add("Head", (2.2, 2.2, 2.2), (0, 3.7, 0), "fur", shape="Ball")
    b.add("Face", (1.55, 1.55, 1.55), (0, 3.6, -0.55), "skin_monkey", shape="Ball")
    b.add("Muzzle", (1.1, 1.1, 1.1), (0, 3.2, -0.95), "skin_monkey", shape="Ball")
    b.add("BrowRidge", (1.6, 0.35, 0.5), (0, 4.15, -0.85), "fur_dark", rot=(-10, 0, 0))
    # eyes
    b.mirror_x("Eye", (0.48, 0.48, 0.48), (0.32, 3.82, -1.18), "eye_white", shape="Ball")
    b.mirror_x("Pupil", (0.24, 0.24, 0.24), (0.32, 3.8, -1.4), "pupil", shape="Ball")
    # nose + grin
    b.mirror_x("Nostril", (0.12, 0.12, 0.12), (0.12, 3.38, -1.47), "pupil", shape="Ball")
    b.add("Mouth", (0.6, 0.1, 0.1), (0, 3.05, -1.45), "mouth", rot=(15, 0, 0))
    # ears (cylinders are X-axis aligned in Roblox, turn them to face forward)
    b.mirror_x("Ear", (0.3, 1.0, 1.0), (1.15, 3.85, -0.1), "fur", shape="Cylinder", rot=(0, 0, 0))
    b.mirror_x("EarInner", (0.32, 0.6, 0.6), (1.18, 3.85, -0.1), "skin_monkey", shape="Cylinder")
    # arms: long, slightly splayed, with big hands
    b.mirror_x("Arm", (0.55, 2.0, 0.55), (1.3, 1.85, -0.1), "fur", rot=(0, 0, 18))
    b.mirror_x("Hand", (0.75, 0.75, 0.75), (1.62, 0.85, -0.15), "skin_monkey", shape="Ball")
    # legs + feet
    b.mirror_x("Leg", (0.65, 1.0, 0.65), (0.55, 0.65, 0), "fur")
    b.mirror_x("Foot", (0.75, 0.3, 1.0), (0.58, 0.15, -0.2), "skin_monkey")
    # curly tail
    tail = [(0, 1.2, 1.15), (0, 1.0, 1.6), (0, 1.15, 2.05), (0, 1.6, 2.25), (0, 2.05, 2.1), (0, 2.25, 1.75)]
    for i, p in enumerate(tail):
        b.add(f"Tail{i + 1}", (0.4, 0.4, 0.4), p, "fur", shape="Ball")
    return b

# ---------------------------------------------------------------- brawler (level 1)


def build_brawler():
    b = Builder("Brawler_L1")
    # legs + shoes
    b.mirror_x("Leg", (0.95, 2.1, 0.95), (0.5, 1.45, 0), "jeans")
    b.mirror_x("Shoe", (1.0, 0.45, 1.3), (0.5, 0.22, -0.12), "shoes")
    # torso
    b.add("Torso", (2.1, 2.1, 1.1), (0, 3.55, 0), "tank_top")
    b.add("Belt", (2.15, 0.3, 1.15), (0, 2.55, 0), "belt")
    b.add("Buckle", (0.4, 0.3, 0.1), (0, 2.55, -0.6), (0.85, 0.75, 0.3), material="Metal")
    b.mirror_x("Shoulder", (0.85, 0.5, 0.95), (0.9, 4.4, 0), "skin_man")  # tank top straps show skin
    b.add("Collar", (0.9, 0.35, 0.05), (0, 4.45, -0.56), "skin_man")
    # arms: fists raised in a fighting stance
    b.mirror_x("UpperArm", (0.8, 1.35, 0.8), (1.45, 3.85, -0.35), "skin_man", rot=(38, 0, 6))
    b.mirror_x("Forearm", (0.72, 1.2, 0.72), (1.3, 3.8, -1.0), "skin_man", rot=(-31, 0, -8))
    b.mirror_x("FistWrap", (0.9, 0.85, 0.9), (1.15, 4.4, -1.4), "wraps", rot=(0, 0, -8))
    # neck + head
    b.add("Neck", (0.6, 0.35, 0.6), (0, 4.75, 0), "skin_man")
    b.add("Head", (1.45, 1.4, 1.35), (0, 5.55, 0), "skin_man")
    b.add("Hair", (1.5, 0.35, 1.4), (0, 6.35, 0.03), "hair")
    b.add("HairBack", (1.5, 0.8, 0.25), (0, 5.95, 0.6), "hair")
    b.add("Bandana", (1.52, 0.3, 1.42), (0, 6.05, 0), "bandana")
    b.add("BandanaKnot", (0.35, 0.35, 0.3), (0, 6.05, 0.75), "bandana")
    b.mirror_x("BandanaTail", (0.18, 0.5, 0.08), (0.12, 5.75, 0.82), "bandana", rot=(10, 0, 15))
    # face (front is -Z)
    b.mirror_x("Eye", (0.18, 0.24, 0.05), (0.3, 5.6, -0.69), "pupil")
    b.mirror_x("Brow", (0.38, 0.1, 0.05), (0.3, 5.82, -0.69), "hair", rot=(0, 0, 14))
    b.add("Mouth", (0.45, 0.08, 0.05), (0, 5.2, -0.69), "mouth")
    b.add("Nose", (0.2, 0.25, 0.15), (0, 5.42, -0.72), (0.9, 0.7, 0.55))
    return b

# ---------------------------------------------------------------- map platform


def build_platform():
    b = Builder("StylePlatform")
    S = 44  # island footprint (studs)
    # layered island block: grass cap, dirt body, darker base
    b.add("GrassTop", (S, 1.2, S), (0, -0.6, 0), "grass", material="Grass")
    b.add("GrassLip", (S + 0.6, 0.5, S + 0.6), (0, -1.3, 0), "grass", material="Grass")
    b.add("Dirt", (S - 0.6, 4, S - 0.6), (0, -3.5, 0), "dirt", material="Ground")
    b.add("DirtBase", (S - 3, 3, S - 3), (0, -6.8, 0), "dirt_dark", material="Ground")
    # dirt path coming in from the jungle edge toward the base
    b.add("Path", (6, 0.1, 24), (0, 0.04, 10), "path", material="Sand")
    b.add("PathBend", (14, 0.1, 6), (-4, 0.04, -1), "path", material="Sand")
    # camp / base corner
    for i, x in enumerate((-15, -12.5, -10, -7.5)):
        b.add(f"FencePost{i + 1}", (0.6, 3, 0.6), (x, 1.5, -12), "wood_dark", material="Wood")
    b.add("FenceRailTop", (8.6, 0.4, 0.3), (-11.25, 2.4, -12), "wood", material="Wood")
    b.add("FenceRailLow", (8.6, 0.4, 0.3), (-11.25, 1.3, -12), "wood", material="Wood")
    b.add("Crate1", (2.4, 2.4, 2.4), (-15, 1.2, -15.5), "wood", material="WoodPlanks")
    b.add("Crate2", (2.0, 2.0, 2.0), (-12.4, 1.0, -16), "wood", material="WoodPlanks", rot=(0, 20, 0))
    b.add("Crate3", (1.8, 1.8, 1.8), (-14.6, 3.3, -15.4), "wood", material="WoodPlanks", rot=(0, -12, 0))
    b.add("FlagPole", (0.3, 9, 0.3), (-17.5, 4.5, -10), "wood_dark", material="Wood")
    b.add("Flag", (0.1, 1.8, 3), (-17.5, 8, -8.5), "flag", material="Fabric")
    # campfire
    for i, yaw in enumerate((0, 60, 120)):
        b.add(f"FireLog{i + 1}", (3, 0.5, 0.5), (-9, 0.3, -6), "wood_dark", material="Wood", rot=(0, yaw, 0))
    b.add("Flame", (1.2, 1.4, 1.2), (-9, 1.1, -6), "fire", neon=True, rot=(0, 45, 0))
    b.add("FlameCore", (0.6, 0.9, 0.6), (-9, 1.0, -6), "fire_core", neon=True)
    for i in range(8):
        a = i * math.tau / 8
        b.add(f"FireStone{i + 1}", (0.8, 0.5, 0.8), (-9 + math.cos(a) * 1.9, 0.25, -6 + math.sin(a) * 1.9),
              "rock", material="Slate", rot=(0, i * 37, 0))
    # jungle trees around the edge
    for i, (x, z, h) in enumerate([(17, 16, 9), (-17, 14, 8), (17, -15, 10), (-2, -19, 7)]):
        _broadleaf_tree(b, f"Tree{i + 1}", x, z, h)
    for i, (x, z, lean) in enumerate([(-17, 4, 12), (17, 3, -14), (6, -18, 10)]):
        _palm_tree(b, f"Palm{i + 1}", x, z, lean)
    # bushes + rocks + grass tufts
    for i, (x, z, s) in enumerate([(12, 12, 3), (14, 9, 2.4), (-13, 10, 2.8), (10, -17, 3.2), (-6, -17, 2.6),
                                   (18.5, -6, 2.4), (-18.5, -2, 3)]):
        b.add(f"Bush{i + 1}", (s, s, s), (x, s * 0.35, z), "leaf" if i % 2 else "leaf_dark", material="Grass",
              shape="Ball")
    for i, (x, z, s, yaw) in enumerate([(6, -10, 2.2, 20), (7.6, -9, 1.3, 50), (-18, -17, 2.6, 10),
                                        (19, 10, 1.8, 70)]):
        b.add(f"Rock{i + 1}", (s, s * 0.7, s * 1.1), (x, s * 0.3, z), "rock" if i % 2 else "rock_dark",
              material="Slate", rot=(8, yaw, 6))
    tufts = [(4, 5), (-5, 8), (9, -3), (-2, -9), (13, -9), (-12, 0), (3, 14), (-9, 15), (11, 5), (6, -15)]
    for i, (x, z) in enumerate(tufts):
        b.add(f"Tuft{i + 1}", (0.25, 0.9, 0.25), (x, 0.4, z), "grass_light", material="Grass", rot=(0, i * 40, 12))
        b.add(f"TuftB{i + 1}", (0.25, 0.7, 0.25), (x + 0.3, 0.3, z), "grass_light", material="Grass",
              rot=(0, i * 40, -15))
    # banana bunch (monkey bait!)
    for i in range(4):
        b.add(f"Banana{i + 1}", (1.2, 0.3, 0.3), (5.6, 0.2 + (i // 2) * 0.28, -4.4 + i * 0.3), "banana",
              shape="Cylinder", rot=(0, 15 * i, 10 if i % 2 else -10))
    return b


def _broadleaf_tree(b, name, x, z, h):
    b.add(name + "Trunk", (1.4, h, 1.4), (x, h / 2, z), "trunk", material="Wood")
    b.add(name + "Root", (2.4, 0.8, 2.4), (x, 0.4, z), "trunk", material="Wood", rot=(0, 45, 0))
    b.add(name + "Canopy", (7, 7, 7), (x, h + 1.5, z), "leaf_dark", material="Grass", shape="Ball")
    b.add(name + "CanopyA", (5, 5, 5), (x + 2.6, h + 0.5, z - 1), "leaf", material="Grass", shape="Ball")
    b.add(name + "CanopyB", (4.6, 4.6, 4.6), (x - 2.4, h + 1, z + 1.2), "leaf", material="Grass", shape="Ball")
    b.add(name + "CanopyTop", (4, 4, 4), (x, h + 4.2, z + 0.4), "leaf", material="Grass", shape="Ball")


def _palm_tree(b, name, x, z, lean):
    seg_h = 1.6
    px, py = x, 0.0
    for i in range(7):
        tilt = lean * (i / 6)
        dx = math.sin(math.radians(tilt)) * seg_h
        dy = math.cos(math.radians(tilt)) * seg_h
        b.add(f"{name}Seg{i + 1}", (1.0 - i * 0.05, seg_h + 0.1, 1.0 - i * 0.05),
              (px + dx / 2, py + dy / 2, z), "trunk" if i % 2 else "wood", material="Wood", rot=(0, 0, -tilt))
        px, py = px + dx, py + dy
    b.add(name + "Crown", (1.3, 1.3, 1.3), (px, py, z), "wood_dark", material="Wood", shape="Ball")
    for i in range(7):
        yaw = i * 360 / 7
        ox = math.cos(math.radians(yaw)) * 2.4
        oz = -math.sin(math.radians(yaw)) * 2.4
        b.add(f"{name}Frond{i + 1}", (5, 0.25, 1.4), (px + ox, py - 0.5, z + oz), "palm_leaf", material="Grass",
              rot=(0, yaw, -22))

# ---------------------------------------------------------------- output


def to_rojo(parts):
    children = []
    for p in parts:
        props = {
            "Anchored": True,
            "Size": p["size"],
            "CFrame": {"CFrame": {"position": p["pos"], "orientation": p["rot"]}},
            "Color": list(p["color"]),
            "Material": p["material"],
            "TopSurface": "Smooth",
            "BottomSurface": "Smooth",
            "CastShadow": p["cast_shadow"],
        }
        if p["shape"] != "Block":
            props["Shape"] = p["shape"]
        if p["transparency"]:
            props["Transparency"] = p["transparency"]
        children.append({"name": p["name"], "className": "Part", "properties": props})
    return {"className": "Model", "children": children}


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    # name, builder, world position of the feet, yaw (180 = face the camera at +Z)
    scene = [
        ("StylePlatform", build_platform(), (0, 0, 0), 0),
        ("Monkey", build_monkey(), (-3.5, 0, 6), 200),
        ("Brawler_L1", build_brawler(), (3.5, 0, 6), 160),
    ]
    preview = []
    for name, builder, origin, yaw in scene:
        parts = builder.placed(origin, yaw)
        with open(os.path.join(OUT_DIR, f"{name}.model.json"), "w") as f:
            json.dump(to_rojo(parts), f, indent=1)
        preview.append({"name": name, "parts": parts})
        print(f"{name}: {len(parts)} parts")
    with open(os.path.join(PREVIEW_DIR, "scene.json"), "w") as f:
        json.dump(preview, f)


if __name__ == "__main__":
    main()
