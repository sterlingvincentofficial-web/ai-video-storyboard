"""Builds the full battle map in the studded-brick style and the path data the game runs on.

Layout (Roblox axes, camera usually looks north = -Z):
  North  cliff wall with a monkey temple on top; monkeys pour down the giant stone stairs.
  West   dense voxel jungle; monkeys come out of the tree line.
  East   lagoon with a dock and stilt huts; monkeys run along the shore.
  South  the player's base camp: the Banana Stash (what the monkeys want), sandbag walls,
         tents, the crashed helicopter from the intro, a helipad, the beach behind it.

Run:  python3 tools/build_map.py
Out:  src/workspace/Map_*.model.json, src/shared/MapData.luau, tools/preview/scene.json
"""

import json
import math
import os
import random

from build_models import PALETTE, STUDS, Builder, _voxel_palm, rgb, to_rojo

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "src", "workspace")
SHARED_DIR = os.path.join(ROOT, "src", "shared")
PREVIEW_DIR = os.path.join(ROOT, "tools", "preview")

PALETTE.update({
    "path": rgb(212, 172, 96),
    "path_edge": rgb(186, 150, 82),
    "sandbag": rgb(196, 170, 112),
    "sandbag_dark": rgb(170, 146, 94),
    "canvas": rgb(116, 128, 76),
    "canvas_dark": rgb(92, 104, 60),
    "olive": rgb(88, 102, 56),
    "olive_dark": rgb(66, 78, 42),
    "glass": rgb(150, 210, 230),
    "white": rgb(240, 240, 236),
    "red": rgb(210, 40, 40),
    "banana": rgb(255, 214, 40),
    "banana_tip": rgb(80, 56, 30),
    "leaf": rgb(70, 170, 50),
    "leaf_dark": rgb(46, 132, 38),
    "leaf_light": rgb(120, 205, 60),
    "temple": rgb(150, 150, 120),
    "temple_dark": rgb(118, 120, 96),
    "moss": rgb(96, 150, 60),
    "torch_fire": rgb(255, 150, 40),
    "pad": rgb(120, 122, 126),
})

ISLAND_X, ISLAND_Z = 112, 92          # half extents of the sand top
PATH_WIDTH = 9
BASE_POS = (0, 0, 42)

# Monkey routes: spawn point first, base gate last. North starts on the temple at y=24.
PATHS = {
    "North": [(0, 24, -81), (0, 24, -74), (0, 0, -50), (-14, 0, -38), (-20, 0, -18), (-6, 0, -2), (2, 0, 14),
              (0, 0, 31)],
    "West": [(-114, 0, -8), (-86, 0, -14), (-62, 0, 2), (-50, 0, 22), (-28, 0, 26), (-10, 0, 36)],
    "East": [(114, 0, 14), (92, 0, 18), (74, 0, 4), (52, 0, 6), (40, 0, 24), (10, 0, 36)],
}


class Map:
    def __init__(self):
        self.groups = {}
        self.rng = random.Random(42)

    def group(self, name):
        if name not in self.groups:
            self.groups[name] = Builder(name)
        return self.groups[name]


M = Map()
R = M.rng


def brick(g, name, size, pos, color, **kw):
    M.group(g).add(name, size, pos, color, look=STUDS, **kw)


def smooth(g, name, size, pos, color, **kw):
    M.group(g).add(name, size, pos, color, **kw)

# ---------------------------------------------------------------- ground


def build_ground():
    g = "Map_Ground"
    smooth(g, "Water", (700, 1, 700), (0, -1.6, 0), "water", reflectance=0.08)
    # sand top split into tiles so the east lagoon can be cut out
    lag_x0, lag_x1, lag_z0, lag_z1 = 50, 100, -58, -16
    tiles = [
        (-ISLAND_X, ISLAND_X, -ISLAND_Z, lag_z0),          # north strip
        (-ISLAND_X, ISLAND_X, lag_z1, ISLAND_Z),           # south strip
        (-ISLAND_X, lag_x0, lag_z0, lag_z1),               # west of lagoon
        (lag_x1, ISLAND_X, lag_z0, lag_z1),                # east of lagoon
    ]
    for i, (x0, x1, z0, z1) in enumerate(tiles):
        brick(g, f"Sand{i + 1}", (x1 - x0, 2, z1 - z0), ((x0 + x1) / 2, -1, (z0 + z1) / 2), "sand")
    brick(g, "SandUnder", (ISLAND_X * 2 + 3, 1.2, ISLAND_Z * 2 + 3), (0, -1.9, 0), "sand_dark")
    # lagoon: sunken water, shore strips, dark rocks round the rim
    smooth("Map_East", "LagoonWater", (lag_x1 - lag_x0, 0.6, lag_z1 - lag_z0),
           ((lag_x0 + lag_x1) / 2, -0.9, (lag_z0 + lag_z1) / 2), "water", reflectance=0.08)
    for i, (sx, sz, px, pz) in enumerate([(lag_x1 - lag_x0, 1.6, (lag_x0 + lag_x1) / 2, lag_z0 + 0.8),
                                          (lag_x1 - lag_x0, 1.6, (lag_x0 + lag_x1) / 2, lag_z1 - 0.8),
                                          (1.6, lag_z1 - lag_z0, lag_x0 + 0.8, (lag_z0 + lag_z1) / 2),
                                          (1.6, lag_z1 - lag_z0, lag_x1 - 0.8, (lag_z0 + lag_z1) / 2)]):
        brick("Map_East", f"LagoonLime{i + 1}", (sx, 0.25, sz), (px, 0.12, pz), "grass_lime")
    for i in range(22):
        t = i / 22
        x = lag_x0 + 3 + t * (lag_x1 - lag_x0 - 6)
        for z in (lag_z0 + 2.4, lag_z1 - 2.4):
            brick("Map_East", f"LagoonRock{i + 1}_{'n' if z < 0 and z < (lag_z0 + lag_z1) / 2 else 's'}",
                  (R.uniform(2.5, 4.5), R.uniform(0.5, 1.1), R.uniform(1.4, 2.2)), (x, -0.3, z),
                  R.choice(["rock", "rock_dark"]), rot=(0, R.uniform(-15, 15), 0))
    # shoreline ring: lime + green strips and waterline rocks on all four sides
    for side in ("S", "W", "E"):
        for k, (w, col, off) in enumerate(((2.4, "grass_lime", 0.6), (1.4, "grass", 2.4))):
            if side == "S":
                brick(g, f"Shore{side}{k}", (ISLAND_X * 2, 0.25, w), (0, 0.12, ISLAND_Z - off), col)
            else:
                sx = -ISLAND_X + off if side == "W" else ISLAND_X - off
                brick(g, f"Shore{side}{k}", (w, 0.25, ISLAND_Z * 2), (sx, 0.12, 0), col)
    for i in range(40):
        x = -ISLAND_X + 4 + i * (ISLAND_X * 2 - 8) / 39
        brick(g, f"BeachRock{i + 1}", (R.uniform(3, 6), R.uniform(0.6, 1.5), R.uniform(1.6, 2.8)),
              (x, -0.5, ISLAND_Z + 1.5 + R.uniform(-0.4, 0.6)), R.choice(["rock", "rock_dark", "rock_light"]),
              rot=(0, R.uniform(-10, 10), 0))
    for side, sx in (("W", -1), ("E", 1)):
        for i in range(30):
            z = -ISLAND_Z + 4 + i * (ISLAND_Z * 2 - 8) / 29
            if sx > 0 and -60 < z < -14:
                continue
            brick(g, f"SideRock{side}{i + 1}", (R.uniform(1.6, 2.8), R.uniform(0.6, 1.5), R.uniform(3, 6)),
                  (sx * (ISLAND_X + 1.5), -0.5, z), R.choice(["rock", "rock_dark"]), rot=(0, R.uniform(-10, 10), 0))

# ---------------------------------------------------------------- paths (studded trails)


def build_paths():
    g = "Map_Paths"
    for name, pts in PATHS.items():
        for i in range(len(pts) - 1):
            a, b = pts[i], pts[i + 1]
            if a[1] != b[1]:
                continue  # the north stairs are their own geometry
            dx, dz = b[0] - a[0], b[2] - a[2]
            length = math.hypot(dx, dz)
            yaw = math.degrees(math.atan2(-dz, dx))
            mid = ((a[0] + b[0]) / 2, a[1] + 0.1, (a[2] + b[2]) / 2)
            brick(g, f"{name}Trail{i + 1}", (length + PATH_WIDTH * 0.6, 0.2, PATH_WIDTH), mid, "path", rot=(0, yaw, 0))
            # edge stones every few studs
            nx, nz = -dz / length, dx / length
            steps = int(length // 6)
            for k in range(steps):
                t = (k + 0.5) / steps
                for s in (-1, 1):
                    if R.random() < 0.55:
                        continue
                    ex = a[0] + dx * t + nx * s * (PATH_WIDTH / 2 + 0.4)
                    ez = a[2] + dz * t + nz * s * (PATH_WIDTH / 2 + 0.4)
                    brick(g, f"{name}Edge{i + 1}_{k}_{s}", (R.uniform(1, 1.8), 0.5, R.uniform(1, 1.8)),
                          (ex, a[1] + 0.25, ez), "path_edge", rot=(0, R.uniform(0, 90), 0))

# ---------------------------------------------------------------- north: cliff, temple, giant stairs


def build_north():
    g = "Map_North"
    # stair-stepped cliff wall (gap in the middle for the stairs)
    for ix in range(-28, 29):
        x = ix * 4
        if abs(x) < 9:
            continue
        for row in range(4):
            z = -72 - row * 5.5
            h = 8 + row * 6 + R.uniform(-2, 3) + min(abs(x), 60) * 0.04
            brick(g, f"Cliff_{ix}_{row}", (R.uniform(4.2, 5.2), h, 6), (x + R.uniform(-0.5, 0.5), h / 2, z),
                  R.choice(["rock", "rock_light", "rock_dark"]))
    # plateau top for the temple
    brick(g, "Plateau", (56, 24, 24), (0, 12, -86), "rock")
    brick(g, "PlateauSand", (54, 0.4, 22), (0, 24.2, -86), "sand")
    # giant stairs: 24 steps from the plateau down to the beach
    for s in range(24):
        top = 24 - s
        brick(g, f"Stair{s + 1}", (14, top, 1.05), (0, top / 2, -74.5 + s * 1.04 + 0.5), "stone" if s % 2 else "stone_dark")
    for side in (-1, 1):
        for i, s in enumerate(range(0, 24, 4)):
            top = 24 - s
            px, pz = side * 8, -74.5 + s * 1.04 + 0.5
            brick(g, f"StairPost{'L' if side < 0 else 'R'}{i}", (1.6, top + 2, 1.6), (px, (top + 2) / 2, pz), "stone_dark")
            smooth(g, f"StairLantern{'L' if side < 0 else 'R'}{i}", (0.9, 0.9, 0.9), (px, top + 2.5, pz), "lantern",
                   neon=True)
    # temple: stepped stone pyramid with a doorway and a carved monkey face
    for k, (w, h, d) in enumerate([(30, 6, 14), (24, 5, 11), (18, 5, 8), (12, 4, 6)]):
        y = 24 + sum(hh for _, hh, _ in [(30, 6, 14), (24, 5, 11), (18, 5, 8), (12, 4, 6)][:k]) + h / 2
        brick(g, f"Temple{k + 1}", (w, h, d), (0, y, -90), "temple" if k % 2 else "temple_dark")
    brick(g, "TempleDoorFrame", (9, 8, 1), (0, 28, -82.6), "temple_dark")
    smooth(g, "TempleDoor", (6, 6.4, 1.2), (0, 27.2, -82.4), (0.06, 0.05, 0.05))
    # carved monkey idol face above the door
    brick(g, "IdolHead", (8, 6, 2), (0, 37, -86.2), "temple")
    for sx in (-1, 1):
        brick(g, f"IdolEar{'L' if sx < 0 else 'R'}", (2, 3, 1.4), (sx * 5, 37.5, -86.2), "temple_dark")
        smooth(g, f"IdolEye{'L' if sx < 0 else 'R'}", (1.1, 1.1, 0.4), (sx * 1.6, 38, -85.1), "torch_fire", neon=True)
    brick(g, "IdolMuzzle", (5, 2.4, 0.8), (0, 35.6, -84.9), "temple_dark")
    # pillars and torches on the plateau
    for i, x in enumerate((-22, -14, 14, 22)):
        brick(g, f"Pillar{i + 1}", (2.4, 9, 2.4), (x, 28.6, -78), "temple")
        brick(g, f"PillarCap{i + 1}", (3.2, 1, 3.2), (x, 33.6, -78), "temple_dark")
        smooth(g, f"PillarFlame{i + 1}", (1.2, 1.6, 1.2), (x, 34.9, -78), "torch_fire", neon=True)
    # moss and vines
    for i in range(18):
        brick(g, f"Moss{i + 1}", (R.uniform(2, 4), 0.4, R.uniform(1.5, 3)),
              (R.uniform(-26, 26), 24.5, R.uniform(-96, -76)), "moss", rot=(0, R.uniform(0, 90), 0))
    for i, x in enumerate((-40, -30, 30, 42, -70, 64, 88, -94)):
        _voxel_palm(M.group(g), R, f"CliffPalm{i + 1}", x, -96, R.uniform(-12, 12), R.randint(7, 10))
    # solid cliff top behind the wall, and lift the cliff-top palms onto it
    brick(g, "CliffBack", (ISLAND_X * 2, 24, 12), (0, 12, -96), "rock_dark")
    for p in M.group(g).parts:
        if p["name"].startswith("CliffPalm"):
            p["pos"][1] += 24

# ---------------------------------------------------------------- west: jungle


def voxel_tree(g, name, x, z, h):
    """Broadleaf jungle tree: chunky trunk + stacked leaf blocks."""
    brick(g, name + "Trunk", (2, h, 2), (x, h / 2, z), "trunk")
    brick(g, name + "Root", (3.6, 1, 3.6), (x, 0.5, z), "trunk_ring", rot=(0, 45, 0))
    for k in range(5):
        s = 9 - k * 1.6 + R.uniform(-0.6, 0.6)
        brick(g, f"{name}Leaf{k}", (s, 1.6, s), (x + R.uniform(-0.8, 0.8), h + k * 1.5, z + R.uniform(-0.8, 0.8)),
              R.choice(["leaf", "leaf_dark", "leaf_light"]), rot=(0, R.uniform(0, 90), 0))


def bush(g, name, x, z, s):
    for k in range(3):
        brick(g, f"{name}_{k}", (s * R.uniform(0.6, 1), s * 0.6, s * R.uniform(0.6, 1)),
              (x + R.uniform(-s / 3, s / 3), s * 0.3 + k * 0.3, z + R.uniform(-s / 3, s / 3)),
              R.choice(["leaf", "leaf_dark", "grass"]), rot=(0, R.uniform(0, 90), 0))


def near_path(x, z, margin):
    for pts in PATHS.values():
        for a, b in zip(pts, pts[1:]):
            ax, az, bx, bz = a[0], a[2], b[0], b[2]
            dx, dz = bx - ax, bz - az
            L2 = dx * dx + dz * dz or 1
            t = max(0, min(1, ((x - ax) * dx + (z - az) * dz) / L2))
            if math.hypot(ax + dx * t - x, az + dz * t - z) < PATH_WIDTH / 2 + margin:
                return True
    return False


def build_west():
    g = "Map_West"
    placed = 0
    tries = 0
    while placed < 34 and tries < 600:
        tries += 1
        x, z = R.uniform(-110, -70), R.uniform(-66, 86)
        if near_path(x, z, 5):
            continue
        if R.random() < 0.45:
            voxel_tree(g, f"Tree{placed}", x, z, R.randint(8, 13))
        else:
            _voxel_palm(M.group(g), R, f"Palm{placed}", x, z, R.uniform(-14, 14), R.randint(7, 10))
        placed += 1
    for i in range(40):
        x, z = R.uniform(-110, -60), R.uniform(-66, 86)
        if not near_path(x, z, 2):
            bush(g, f"Bush{i}", x, z, R.uniform(2.5, 4.5))
    for i in range(10):
        x, z = R.uniform(-105, -60), R.uniform(-60, 80)
        if not near_path(x, z, 3):
            brick(g, f"Boulder{i}", (R.uniform(4, 7), R.uniform(3, 5), R.uniform(4, 7)), (x, 1.5, z),
                  R.choice(["rock", "rock_light"]), rot=(R.uniform(-8, 8), R.uniform(0, 90), R.uniform(-8, 8)))

# ---------------------------------------------------------------- east: lagoon, dock, huts


def hut(g, name, x, z, stilts=True):
    base = 3 if stilts else 0
    if stilts:
        for sx in (-1, 1):
            for sz in (-1, 1):
                brick(g, f"{name}Stilt{sx}{sz}", (0.8, base + 1, 0.8), (x + sx * 3.4, (base + 1) / 2 - 0.8, z + sz * 3.4),
                      "wood_dark")
    brick(g, name + "Floor", (8, 0.6, 8), (x, base + 0.3, z), "wood")
    for i, (sx, sz, w, d) in enumerate([(0, -3.7, 8, 0.6), (0, 3.7, 8, 0.6), (-3.7, 0, 0.6, 8), (3.7, 0, 0.6, 8)]):
        if i == 1:  # doorway side
            for dx in (-2.6, 2.6):
                brick(g, f"{name}Wall{i}{dx}", (2.8, 4, 0.6), (x + dx, base + 2.6, z + sz), "wood_dark")
            continue
        brick(g, f"{name}Wall{i}", (w, 4, d), (x + sx, base + 2.6, z + sz), "wood_dark" if i % 2 else "wood")
    for k in range(4):
        s = 10 - k * 2.4
        brick(g, f"{name}Roof{k}", (s, 0.9, s), (x, base + 5 + k * 0.85, z), "trunk_ring" if k % 2 else "wood")


def build_east():
    g = "Map_East"
    # dock across the lagoon
    for i in range(18):
        brick(g, f"DockPlank{i}", (2.2, 0.5, 7), (54 + i * 2.3, 0.15, -37), "wood" if i % 2 else "wood_dark")
    for i in range(0, 18, 4):
        for sz in (-40.4, -33.6):
            brick(g, f"DockPost{i}{sz}", (0.9, 3, 0.9), (54 + i * 2.3, 0.4, sz), "wood_dark")
    hut(g, "HutA", 66, -48)
    hut(g, "HutB", 86, -26)
    hut(g, "HutC", 104, -64, stilts=False)
    # rope fence + barrels along the lagoon's south shore
    for i, x in enumerate(range(54, 100, 4)):
        brick(g, f"FencePost{i}", (0.7, 2.4, 0.7), (x, 1.2, -12.5), "wood_dark")
        if i:
            M.group(g).segment(f"Rope{i}", (x - 4, 2.1, -12.5), (x, 2.1, -12.5), 0.2, "rope")
    for i, (x, z) in enumerate([(98, -8), (100.2, -7.2), (99, -5.6), (58, -66), (60, -64.5)]):
        smooth(g, f"Barrel{i}", (2.2, 1.8, 1.8), (x, 1.1, z), "wood", shape="Cylinder", rot=(0, 0, 90))
        smooth(g, f"BarrelBand{i}", (0.25, 1.9, 1.9), (x, 1.6, z), "metal", shape="Cylinder", rot=(0, 0, 90))
    placed = 0
    for i in range(80):
        if placed >= 16:
            break
        x, z = R.uniform(46, 110), R.uniform(-88, 84)
        if near_path(x, z, 5) or (46 < x < 104 and -62 < z < -12) or (abs(x) < 30 and z > 20):
            continue
        _voxel_palm(M.group(g), R, f"Palm{i}", x, z, R.uniform(-14, 14), R.randint(6, 10))
        placed += 1
    for i in range(16):
        x, z = R.uniform(48, 110), R.uniform(-88, 84)
        if not near_path(x, z, 2) and not (46 < x < 104 and -62 < z < -12):
            bush(g, f"Bush{i}", x, z, R.uniform(2, 3.5))

# ---------------------------------------------------------------- south: base camp


def banana_bunch(g, name, x, y, z, yaw=0):
    for k in range(5):
        a = math.radians(yaw + k * 22 - 44)
        bx, bz = x + math.cos(a) * 0.5, z - math.sin(a) * 0.5
        brick(g, f"{name}B{k}", (0.5, 1.8, 0.5), (bx, y + 0.9, bz), "banana", rot=(0, yaw + k * 22, 18))
    brick(g, name + "Stem", (0.5, 0.6, 0.5), (x, y + 2, z), "banana_tip")


def sandbags(g, name, cx, cz, r, a0, a1):
    """Curved sandbag wall from angle a0 to a1 (degrees, 0 = +X, counter-clockwise seen from above)."""
    n = int(abs(a1 - a0) / 7)
    for i in range(n):
        a = math.radians(a0 + (a1 - a0) * (i + 0.5) / n)
        x, z = cx + math.cos(a) * r, cz - math.sin(a) * r
        for row in range(3):
            brick(g, f"{name}{i}_{row}", (2.6, 0.9, 1.4), (x, 0.45 + row * 0.9, z),
                  "sandbag" if (i + row) % 2 else "sandbag_dark", rot=(0, math.degrees(a) + 90 + (row % 2) * 6, 0))


def tent(g, name, x, z, yaw):
    """A-frame tent: two canvas panels leaning on a ridge that runs along the tent's local Z."""
    brick(g, name + "Floor", (6, 0.3, 7), (x, 0.15, z), "canvas_dark", rot=(0, yaw, 0))
    c, sn = math.cos(math.radians(yaw)), math.sin(math.radians(yaw))
    for s in (-1, 1):
        brick(g, f"{name}Side{s}", (3.6, 0.3, 7), (x + s * 1.25 * c, 1.55, z - s * 1.25 * sn),
              "canvas" if s > 0 else "canvas_dark", rot=(0, yaw, -s * 55))


def helicopter_wreck(g, x, z):
    """The chopper from the intro, nose-down in the sand beside the base."""
    brick(g, "HeliBody", (5, 4.4, 9), (x, 2.4, z), "olive", rot=(8, 25, 14))
    brick(g, "HeliNose", (4.2, 3.4, 3), (x - 2.0, 1.6, z - 4.6), "olive_dark", rot=(20, 25, 14))
    smooth(g, "HeliGlass", (3.8, 2.2, 0.4), (x - 2.2, 2.6, z - 6.0), "glass", rot=(30, 25, 14), transparency=0.35)
    brick(g, "HeliTail", (1.6, 1.6, 12), (x + 4.2, 4.6, z + 9), "olive", rot=(-12, 25, 14))
    brick(g, "HeliFin", (0.5, 3, 2), (x + 6.6, 6.6, z + 14.2), "olive_dark", rot=(-12, 25, 14))
    brick(g, "HeliSkidL", (0.5, 0.5, 9), (x - 2.6, 0.3, z + 0.4), "metal", rot=(0, 25, 0))
    brick(g, "HeliSkidR", (0.5, 0.5, 9), (x + 2.6, 0.8, z - 0.4), "metal", rot=(10, 25, 0))
    brick(g, "HeliMast", (0.8, 1.4, 0.8), (x + 0.4, 5.2, z), "metal", rot=(8, 25, 14))
    for i, (yaw, droop) in enumerate(((25, -6), (115, 14), (205, -18))):
        brick(g, f"HeliBlade{i}", (14, 0.25, 1.1), (x + 0.4 + math.cos(math.radians(yaw)) * 6, 5.8 + droop * 0.12,
                                                   z - math.sin(math.radians(yaw)) * 6), "metal_dark",
              rot=(0, yaw, droop))
    for i in range(10):
        brick(g, f"HeliDebris{i}", (R.uniform(0.6, 1.6), R.uniform(0.3, 0.8), R.uniform(0.6, 1.6)),
              (x + R.uniform(-9, 9), 0.25, z + R.uniform(-8, 10)), R.choice(["olive", "olive_dark", "metal"]),
              rot=(R.uniform(-20, 20), R.uniform(0, 90), R.uniform(-20, 20)))
    # crater ring of kicked-up sand
    for i in range(14):
        a = i / 14 * math.tau
        brick(g, f"HeliCrater{i}", (3, 0.8, 2), (x + math.cos(a) * 7, 0.3, z + math.sin(a) * 8), "sand_dark",
              rot=(0, math.degrees(-a), 10))


def gate_angle(pts, r=15):
    """Angle (degrees, sandbags() convention) where a path first enters the base ring."""
    bx, _, bz = BASE_POS
    for a, b in zip(pts, pts[1:]):
        for k in range(200):
            t = k / 199
            x, z = a[0] + (b[0] - a[0]) * t, a[2] + (b[2] - a[2]) * t
            if math.hypot(x - bx, z - bz) <= r:
                ang = math.degrees(math.atan2(-(z - bz), x - bx))
                return ang if ang > -90 else ang + 360
    return 90


def build_base():
    g = "Map_Base"
    bx, _, bz = BASE_POS
    # the Banana Stash: crate pyramid heaped with bananas (what the monkeys are after)
    for i, (dx, dy, dz) in enumerate([(-2.6, 0, -1.3), (0, 0, -1.3), (2.6, 0, -1.3), (-2.6, 0, 1.3), (0, 0, 1.3),
                                      (2.6, 0, 1.3), (-1.3, 2.5, 0), (1.3, 2.5, 0), (0, 5, 0)]):
        brick(g, f"StashCrate{i}", (2.5, 2.5, 2.5), (bx + dx, 1.25 + dy, bz + dz), "wood" if i % 2 else "wood_dark")
    for i, (dx, dy, dz, yaw) in enumerate([(-2.6, 2.5, -1.4, 10), (2.6, 2.5, 1.3, 70), (0, 7.5, 0, 30),
                                           (-1.2, 5, 1.2, 140), (1.4, 5, -1.2, 200), (2.6, 2.5, -1.4, 260)]):
        banana_bunch(g, f"Stash{i}", bx + dx, dy, bz + dz, yaw)
    # sandbag ring with a gate wherever a monkey path crosses it
    gates = sorted(gate_angle(pts) for pts in PATHS.values())
    edges = [-90] + [a for gate in gates for a in (gate - 10, gate + 10)] + [270]
    for k in range(0, len(edges), 2):
        if edges[k + 1] - edges[k] > 6:
            sandbags(g, f"Sandbags{k}", bx, bz, 15, edges[k], edges[k + 1])
    # flag
    brick(g, "FlagPole", (0.5, 14, 0.5), (bx + 9, 7, bz + 6), "metal")
    smooth(g, "Flag", (0.15, 3, 5), (bx + 9, 12.5, bz + 3.4), "red", material="Fabric")
    banana_bunch(g, "FlagBanana", bx + 9, 11.6, bz + 3.4, 90)
    # tents, crates, campfire
    tent(g, "TentA", bx - 10, bz + 9, 20)
    tent(g, "TentB", bx + 4, bz + 11, -10)
    for i, (dx, dz) in enumerate([(-11, -3), (-12.5, -1.4), (11, -2)]):
        brick(g, f"Crate{i}", (2.2, 2.2, 2.2), (bx + dx, 1.1, bz + dz), "wood", rot=(0, i * 25, 0))
    for i, yaw in enumerate((0, 60, 120)):
        brick(g, f"FireLog{i}", (3, 0.5, 0.5), (bx - 5, 0.3, bz + 6), "wood_dark", rot=(0, yaw, 0))
    smooth(g, "Fire", (1.2, 1.6, 1.2), (bx - 5, 1.1, bz + 6), "torch_fire", neon=True, rot=(0, 45, 0))
    # helipad + wreck
    brick(g, "Helipad", (16, 0.4, 16), (-30, 0.2, 66), "pad")
    for i, (sx, sz, px, pz) in enumerate([(0.9, 7, -32.4, 66), (0.9, 7, -27.6, 66), (4, 0.9, -30, 66)]):
        smooth(g, f"PadH{i}", (sx, 0.45, sz), (px, 0.25, pz), "white")
    helicopter_wreck(g, 26, 58)
    # beach palms behind the base
    for i, (x, z) in enumerate([(-48, 78), (-20, 84), (14, 82), (44, 76), (62, 86), (-66, 86)]):
        _voxel_palm(M.group(g), R, f"BeachPalm{i}", x, z, R.uniform(-14, 14), R.randint(7, 10))


# ---------------------------------------------------------------- data for the game


def lua_v3(p):
    return "Vector3.new(%g, %g, %g)" % tuple(round(c, 3) for c in p)


def write_map_data():
    lines = [
        "-- Generated by tools/build_map.py. Do not edit by hand.",
        "-- Monkey routes (spawn first, base gate last), base position and the buildable area.",
        "return {",
        f"\tPathWidth = {PATH_WIDTH},",
        f"\tBase = {lua_v3(BASE_POS)},",
        "\tBaseRadius = 15,",
        f"\tBuildArea = {{ Min = Vector3.new({-ISLAND_X + 4}, 0, {-ISLAND_Z + 26}), Max = Vector3.new({ISLAND_X - 4}, 0, {ISLAND_Z - 6}) }},",
        "\tPaths = {",
    ]
    for name, pts in PATHS.items():
        lines.append(f"\t\t{name} = {{ " + ", ".join(lua_v3(p) for p in pts) + " },")
    lines += ["\t},", "\tPlayerSpawn = Vector3.new(0, 0, 70),", "}", ""]
    with open(os.path.join(SHARED_DIR, "MapData.luau"), "w") as f:
        f.write("\n".join(lines))


def main():
    PALETTE.setdefault("metal_dark", rgb(50, 52, 56))
    build_ground()
    build_paths()
    build_north()
    build_west()
    build_east()
    build_base()
    os.makedirs(OUT_DIR, exist_ok=True)
    for f in os.listdir(OUT_DIR):
        if f.endswith(".model.json"):
            os.remove(os.path.join(OUT_DIR, f))
    preview, total = [], 0
    for name, b in M.groups.items():
        parts = b.placed()
        with open(os.path.join(OUT_DIR, f"{name}.model.json"), "w") as f:
            json.dump(to_rojo(parts), f)
        preview.append({"name": name, "parts": parts})
        total += len(parts)
        print(f"{name}: {len(parts)} parts")
    print("total parts:", total)
    with open(os.path.join(PREVIEW_DIR, "scene.json"), "w") as f:
        json.dump(preview, f)
    write_map_data()


if __name__ == "__main__":
    main()
