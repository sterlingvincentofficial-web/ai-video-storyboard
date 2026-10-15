"""Generates the Rojo .model.json files for the style-test scene.

Style target (from the reference recordings): classic Roblox brick look.
- Map: Plastic parts with Studs surfaces (LEGO baseplate sand, stair-stepped studded
  cliffs, studded stone), mint water, lime grass strips along the shore, voxel palms.
- Characters: blocky R6 rigs with the classic Roblox head mesh, smooth surfaces.

Every model is described in local coordinates (feet at y=0, facing -Z, which is
Roblox's "forward"), then placed into the world. All colors live in PALETTE.

Run:  python3 tools/build_models.py
Out:  src/workspace/*.model.json  +  tools/preview/scene.json (for the preview render)
"""

import json
import math
import os
import random

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "src", "workspace")
PREVIEW_DIR = os.path.join(ROOT, "tools", "preview")


def rgb(r, g, b):
    return (r / 255, g / 255, b / 255)


# ---------------------------------------------------------------- style palette
PALETTE = {
    # monkey
    "fur": rgb(105, 66, 38),
    "fur_dark": rgb(84, 52, 30),
    "monkey_tip": rgb(240, 232, 140),
    "monkey_face": rgb(226, 208, 150),
    # men
    "skin": rgb(234, 184, 146),
    "face_ink": rgb(25, 22, 22),
    "tank_top": rgb(242, 242, 236),
    "jeans": rgb(45, 72, 120),
    "belt": rgb(70, 45, 28),
    "wraps": rgb(235, 232, 220),
    "headband": rgb(205, 35, 35),
    # map
    "sand": rgb(255, 212, 92),
    "sand_dark": rgb(232, 186, 80),
    "grass_lime": rgb(170, 225, 40),
    "grass": rgb(70, 190, 50),
    "water": rgb(80, 255, 180),
    "rock": rgb(92, 110, 100),
    "rock_light": rgb(104, 120, 106),
    "rock_dark": rgb(68, 84, 74),
    "stone": rgb(190, 178, 120),
    "stone_dark": rgb(160, 148, 98),
    "lantern": rgb(255, 214, 60),
    "wood": rgb(120, 72, 40),
    "wood_dark": rgb(86, 50, 28),
    "rope": rgb(200, 170, 110),
    "trunk": rgb(160, 95, 50),
    "trunk_ring": rgb(130, 75, 38),
    "palm": rgb(120, 205, 50),
    "palm_dark": rgb(70, 160, 40),
    "metal": rgb(60, 60, 64),
}

STUDS = "studs"    # map look: Plastic + Studs surfaces
SMOOTH = "smooth"  # character look

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


def norm(v):
    l = math.sqrt(sum(c * c for c in v))
    return [c / l for c in v]


def cross(a, b):
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]


def x_axis_to(d):
    """Rotation whose X axis points along d (cylinders in Roblox run along X)."""
    x = norm(d)
    up = [0, 1, 0] if abs(x[1]) < 0.95 else [1, 0, 0]
    z = norm(cross(x, up))
    y = cross(z, x)
    return [[x[0], y[0], z[0]], [x[1], y[1], z[1]], [x[2], y[2], z[2]]]


def pivot_point(pivot, rot, offset):
    """World position of `offset` (local to a joint at `pivot` rotated by `rot`)."""
    o = matvec(rot_matrix(*rot), offset)
    return tuple(pivot[i] + o[i] for i in range(3))


class Builder:
    """Collects parts for one model in local space."""

    def __init__(self, name):
        self.name = name
        self.parts = []

    def add(self, name, size, pos, color, *, look=SMOOTH, shape="Block", rot=(0, 0, 0), mesh=None,
            material=None, neon=False, transparency=0.0, reflectance=0.0):
        rot_m = rot if isinstance(rot[0], list) else rot_matrix(*rot)
        if shape == "Ball":
            d = min(size)
            size = (d, d, d)
        if material is None:
            material = "Plastic" if look == STUDS else "SmoothPlastic"
        self.parts.append({
            "name": name,
            "size": [round(s, 4) for s in size],
            "pos": list(pos),
            "rot": rot_m,
            "color": PALETTE[color] if isinstance(color, str) else color,
            "material": "Neon" if neon else material,
            "shape": shape,
            "look": look,
            "mesh": mesh,
            "transparency": transparency,
            "reflectance": reflectance,
        })

    def mirror_x(self, name, size, pos, color, rot=(0, 0, 0), **kw):
        """Adds a Left/Right pair mirrored across X (input describes the Right side)."""
        x, y, z = pos
        rx, ry, rz = rot
        self.add("Left" + name, size, (-x, y, z), color, rot=(rx, -ry, -rz), **kw)
        self.add("Right" + name, size, (x, y, z), color, rot=(rx, ry, rz), **kw)

    def segment(self, name, p0, p1, thickness, color, **kw):
        mid = [(p0[i] + p1[i]) / 2 for i in range(3)]
        d = [p1[i] - p0[i] for i in range(3)]
        length = math.sqrt(sum(c * c for c in d))
        self.add(name, (length, thickness, thickness), mid, color, shape="Cylinder", rot=x_axis_to(d), **kw)

    def placed(self, origin=(0, 0, 0), yaw=0.0):
        """Returns the parts moved into world space."""
        R = rot_matrix(0, yaw, 0)
        out = []
        for p in self.parts:
            q = dict(p)
            wp = matvec(R, p["pos"])
            q["pos"] = [round(wp[i] + origin[i], 4) for i in range(3)]
            q["rot"] = [[round(c, 6) for c in row] for row in matmul(R, p["rot"])]
            out.append(q)
        return out

# ---------------------------------------------------------------- R6 helpers

HEAD_Y = 4.5        # R6 head part center (part is 2x1x1, the Head mesh draws ~1.25 studs round)
HEAD_FRONT = -0.6   # z of the visible face surface


def r6_head(b, color):
    b.add("Head", (2, 1, 1), (0, HEAD_Y, 0), color, mesh={"MeshType": "Head", "Scale": [1.25, 1.25, 1.25]})

# ---------------------------------------------------------------- monkey


def build_monkey():
    b = Builder("Monkey")
    # legs: brown with pale feet
    b.mirror_x("Leg", (1, 1.6, 1), (0.5, 1.2, 0), "fur")
    b.mirror_x("Foot", (1, 0.4, 1), (0.5, 0.2, 0), "monkey_tip")
    # torso
    b.add("Torso", (2, 2, 1), (0, 3, 0), "fur")
    # arms: one raised in a swing, one hanging (as in the cutscene brawl)
    arm_up = (20, 0, 78)
    b.add("RightArm", (1, 1.5, 1), pivot_point((1.5, 3.9, 0), arm_up, (0, -0.75, 0)), "fur", rot=arm_up)
    b.add("RightHand", (1, 0.5, 1), pivot_point((1.5, 3.9, 0), arm_up, (0, -1.75, 0)), "monkey_tip", rot=arm_up)
    b.add("LeftArm", (1, 1.5, 1), pivot_point((-1.5, 4, 0), (0, 0, -8), (0, -0.75, 0)), "fur", rot=(0, 0, -8))
    b.add("LeftHand", (1, 0.5, 1), pivot_point((-1.5, 4, 0), (0, 0, -8), (0, -1.75, 0)), "monkey_tip",
          rot=(0, 0, -8))
    # head + face plate + ears
    r6_head(b, "fur")
    b.add("FacePlate", (0.08, 0.95, 0.95), (0, HEAD_Y - 0.08, HEAD_FRONT - 0.03), "monkey_face",
          shape="Cylinder", rot=(0, 90, 0))
    b.mirror_x("Eye", (0.13, 0.2, 0.05), (0.2, HEAD_Y + 0.05, HEAD_FRONT - 0.09), "face_ink")
    b.mirror_x("Brow", (0.26, 0.06, 0.05), (0.2, HEAD_Y + 0.22, HEAD_FRONT - 0.09), "face_ink", rot=(0, 0, 12))
    b.add("Mouth", (0.32, 0.06, 0.05), (0, HEAD_Y - 0.3, HEAD_FRONT - 0.09), "face_ink")
    b.mirror_x("Ear", (0.18, 0.55, 0.55), (0.68, HEAD_Y + 0.2, 0), "fur", shape="Cylinder")
    b.mirror_x("EarInner", (0.2, 0.32, 0.32), (0.69, HEAD_Y + 0.2, -0.02), "monkey_face", shape="Cylinder")
    # long curled tail out of the lower back
    pts = [(0, 2.4, 0.45), (0, 2.15, 1.15), (0, 2.4, 1.85), (0, 3.1, 2.35), (0, 4.0, 2.45), (0, 4.9, 2.2),
           (0, 5.5, 1.65), (0, 5.65, 1.05), (0, 5.4, 0.65)]
    for i in range(len(pts) - 1):
        b.segment(f"Tail{i + 1}", pts[i], pts[i + 1], 0.32, "fur")
        b.add(f"TailJoint{i + 1}", (0.32, 0.32, 0.32), pts[i + 1], "fur", shape="Ball")
    return b

# ---------------------------------------------------------------- brawler (level 1)


def build_brawler():
    b = Builder("Brawler_L1")
    # legs: jeans + shoes
    b.mirror_x("Leg", (1, 1.7, 1), (0.5, 1.15, 0), "jeans")
    b.mirror_x("Shoe", (1.02, 0.3, 1.1), (0.5, 0.15, -0.05), "belt")
    # torso: white tank top, bare shoulders, belt
    b.add("Torso", (2, 2, 1), (0, 3, 0), "tank_top")
    b.add("Belt", (2.04, 0.25, 1.04), (0, 2.12, 0), "belt")
    b.mirror_x("Strap", (0.6, 0.35, 1.02), (0.7, 3.83, 0), "skin")
    b.add("Neckline", (0.8, 0.3, 1.02), (0, 3.85, 0), "skin")
    # arms in a boxer's guard: rotate forward at the shoulder, wrapped fists at the end
    for side, x, yaw in (("Right", 1.5, -12), ("Left", -1.5, 12)):
        rot = (68, yaw, 0)
        shoulder = (x, 4, 0)
        b.add(side + "Arm", (1, 1.6, 1), pivot_point(shoulder, rot, (0, -0.8, 0)), "skin", rot=rot)
        b.add(side + "Fist", (1.08, 0.55, 1.08), pivot_point(shoulder, rot, (0, -1.8, 0)), "wraps", rot=rot)
    # head, classic face (built from parts so it reads the same in Studio and the preview)
    r6_head(b, "skin")
    b.mirror_x("Eye", (0.13, 0.24, 0.05), (0.2, HEAD_Y + 0.02, HEAD_FRONT - 0.03), "face_ink")
    b.mirror_x("Brow", (0.3, 0.07, 0.05), (0.22, HEAD_Y + 0.22, HEAD_FRONT - 0.03), "face_ink", rot=(0, 0, 16))
    b.add("Mouth", (0.36, 0.06, 0.05), (0, HEAD_Y - 0.28, HEAD_FRONT - 0.03), "face_ink")
    # headband wraps the round head, knot tails hang off the back
    b.add("Headband", (0.22, 1.32, 1.32), (0, HEAD_Y + 0.38, 0), "headband", shape="Cylinder", rot=(0, 0, 90))
    b.mirror_x("HeadbandTail", (0.2, 0.6, 0.06), (0.15, HEAD_Y + 0.1, 0.68), "headband", rot=(12, 0, 18))
    return b

# ---------------------------------------------------------------- map platform


def build_platform():
    rng = random.Random(7)
    b = Builder("StylePlatform")

    def brick(name, size, pos, color, **kw):
        b.add(name, size, pos, color, look=STUDS, **kw)

    # water around everything
    b.add("Water", (260, 1, 260), (0, -1.6, 0), "water", reflectance=0.08)
    # sand baseplate (the whole island top) + darker underside showing at the shore
    brick("Sand", (72, 2, 52), (0, -1, -2), "sand")
    brick("SandEdge", (74, 1, 54), (0, -1.6, -2), "sand_dark")
    # shoreline in front: lime + green strips, low dark rocks at the waterline
    brick("ShoreLime", (72, 0.2, 2), (0, 0.1, 22.6), "grass_lime")
    brick("ShoreGrass", (72, 0.2, 1.2), (0, 0.1, 24.2), "grass")
    for i in range(12):
        w = rng.uniform(3, 6)
        brick(f"ShoreRock{i + 1}", (w, rng.uniform(0.6, 1.4), rng.uniform(1.6, 2.6)),
              (-34 + i * 6 + rng.uniform(-1, 1), -0.6, 25.6 + rng.uniform(-0.3, 0.6)),
              "rock_dark" if i % 2 else "rock", rot=(0, rng.uniform(-8, 8), 0))
    # stair-stepped cliff along the back
    for ix in range(-9, 10):
        if abs(ix) <= 1:
            continue  # gap for the staircase
        for row in range(3):
            h = 4 + row * 4 + rng.uniform(-1.5, 2.5) + (abs(ix) * 0.25)
            w = rng.uniform(3.6, 4.6)
            d = 4.2
            brick(f"Cliff_{ix}_{row}", (w, h, d), (ix * 3.8, h / 2, -18 - row * 3.6 + rng.uniform(-0.4, 0.4)),
                  rng.choice(["rock", "rock_light", "rock_dark"]))
    # stone staircase up the middle with lantern posts
    for s in range(12):
        brick(f"Stair{s + 1}", (7, 0.8 * (s + 1), 1.2), (0, 0.4 * (s + 1), -14.5 - s * 1.2),
              "stone" if s % 2 else "stone_dark")
    for side in (-1, 1):
        for i, s in enumerate((0, 4, 8, 11)):
            top = 0.8 * (s + 1)
            brick(f"LanternPost{'L' if side < 0 else 'R'}{i + 1}", (1.2, top + 1.6, 1.2),
                  (side * 4.1, (top + 1.6) / 2, -14.5 - s * 1.2), "stone_dark")
            b.add(f"Lantern{'L' if side < 0 else 'R'}{i + 1}", (0.6, 0.6, 0.6),
                  (side * 4.1, top + 1.9, -14.5 - s * 1.2), "lantern", neon=True)
    # wooden dock out to the right
    for i in range(10):
        brick(f"DockPlank{i + 1}", (1.6, 0.4, 6), (36.5 + i * 1.7, -0.3, 8), "wood" if i % 2 else "wood_dark")
    for i, x in enumerate((37, 44, 51)):
        for z in (5.2, 10.8):
            brick(f"DockPost{i + 1}_{'a' if z < 8 else 'b'}", (0.8, 3, 0.8), (x, -0.4, z), "wood_dark")
    # rope fence along the dock edge
    for i, x in enumerate(range(22, 34, 3)):
        brick(f"FencePost{i + 1}", (0.7, 2.2, 0.7), (x, 1.1, 18), "wood_dark")
        b.add(f"FenceBarrel{i + 1}", (1.6, 1.2, 1.2), (x, 2.6, 18), "wood", shape="Cylinder", rot=(0, 0, 90))
        if i:
            b.segment(f"Rope{i}", (x - 3, 2.0, 18), (x, 2.0, 18), 0.18, "rope")
    # barrels
    for i, (x, z) in enumerate([(-22, -9), (-20.4, -9.6), (-21.2, -7.6), (26, -6)]):
        b.add(f"Barrel{i + 1}", (2.2, 1.8, 1.8), (x, 1.1, z), "wood", shape="Cylinder", rot=(0, 0, 90))
        b.add(f"BarrelBand{i + 1}", (0.25, 1.9, 1.9), (x, 1.6, z), "metal", shape="Cylinder", rot=(0, 0, 90))
    # voxel palm trees
    for i, (x, z, lean, h) in enumerate([(-28, 4, 10, 8), (-24, 14, -8, 6), (28, 12, -12, 9), (20, -8, 9, 7),
                                         (-14, -11, -6, 7)]):
        _voxel_palm(b, rng, f"Palm{i + 1}", x, z, lean, h)
    # grass clumps on the sand
    for i, (x, z) in enumerate([(-30, 16), (-18, 20), (14, 20), (30, 2), (-31, -6), (24, -12)]):
        brick(f"Grass{i + 1}", (rng.uniform(2, 3.5), 0.4, rng.uniform(1.5, 2.5)), (x, 0.2, z), "grass",
              rot=(0, rng.uniform(0, 90), 0))
    return b


def _voxel_palm(b, rng, name, x, z, lean, h):
    """Stacked trunk blocks with rings, crown of drooping block fronds."""
    px, py = x, 0.0
    for i in range(h):
        t = i / max(1, h - 1)
        dx = math.sin(math.radians(lean)) * t * 0.35
        b.add(f"{name}Trunk{i + 1}", (1.1, 1.0, 1.1), (px + dx, py + 0.5, z), "trunk_ring" if i % 2 else "trunk",
              look=STUDS, rot=(0, (i * 13) % 30, 0))
        px, py = px + dx, py + 1.0
    top = (px, py + 0.3, z)
    b.add(name + "Crown", (1.6, 1.0, 1.6), top, "palm_dark", look=STUDS, rot=(0, 20, 0))
    for f in range(6):
        yaw = f * 60 + rng.uniform(-10, 10)
        for k in range(4):
            reach = 1.2 + k * 1.1
            drop = 0.12 * k * k
            fx = top[0] + math.cos(math.radians(yaw)) * reach
            fz = top[2] - math.sin(math.radians(yaw)) * reach
            b.add(f"{name}Frond{f + 1}_{k + 1}", (1.4, 0.45, 1.0 - k * 0.15), (fx, top[1] + 0.2 - drop, fz),
                  "palm" if (f + k) % 3 else "palm_dark", look=STUDS, rot=(0, yaw, -10 - k * 12))

# ---------------------------------------------------------------- output

STUD_SURFACES = {
    "TopSurface": "Studs", "BottomSurface": "Inlet", "FrontSurface": "Studs",
    "BackSurface": "Studs", "LeftSurface": "Studs", "RightSurface": "Studs",
}
SMOOTH_SURFACES = {k: "Smooth" for k in STUD_SURFACES}


def to_rojo(parts):
    children = []
    for p in parts:
        props = {
            "Anchored": True,
            "Size": p["size"],
            "CFrame": {"CFrame": {"position": p["pos"], "orientation": p["rot"]}},
            "Color": list(p["color"]),
            "Material": p["material"],
            **(STUD_SURFACES if p["look"] == STUDS else SMOOTH_SURFACES),
        }
        if p["shape"] != "Block":
            props["Shape"] = p["shape"]
        if p["transparency"]:
            props["Transparency"] = p["transparency"]
        if p["reflectance"]:
            props["Reflectance"] = p["reflectance"]
        node = {"name": p["name"], "className": "Part", "properties": props}
        if p["mesh"]:
            node["children"] = [{"name": "Mesh", "className": "SpecialMesh", "properties": dict(p["mesh"])}]
        if p.get("extra"):
            node.setdefault("children", []).extend(p["extra"])
        children.append(node)
    return {"className": "Model", "children": children}


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    # name, builder, world position of the feet, yaw (180 = face the camera at +Z)
    scene = [
        ("StylePlatform", build_platform(), (0, 0, 0), 0),
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
