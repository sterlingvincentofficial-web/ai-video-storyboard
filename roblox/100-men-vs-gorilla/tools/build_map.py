"""Builds the full battle map in the studded-brick style and the path data the game runs on.

Layout (Roblox axes, camera usually looks north = -Z):
  North  terraced cliff with a monkey temple on a plateau; monkeys pour down the giant stone stairs.
  West   voxel jungle; monkeys come out of the tree line.
  East   lagoon with a dock, stilt huts and a rope fence.
  South  the player's base camp: the Banana Stash (what the monkeys want) inside a sandbag ring,
         tents, the crashed helicopter from the intro, a helipad, the beach behind it.

Every prop is placed through a footprint registry so nothing intersects anything else, trails
are rasterised onto the 1-stud grid (no overlapping rotated slabs), and check_overlaps() runs at
the end and fails the build if two separate objects interpenetrate or two surfaces z-fight.

Run:  cd tools && python3 build_map.py
Out:  src/workspace/Map_*.model.json, src/shared/MapData.luau, tools/preview/scene.json
"""

import json
import math
import os
import random
import sys

from build_models import PALETTE, STUDS, Builder, _voxel_palm, matmul, matvec, rgb, rot_matrix, to_rojo

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "src", "workspace")
SHARED_DIR = os.path.join(ROOT, "src", "shared")
PREVIEW_DIR = os.path.join(ROOT, "tools", "preview")
ASSET_DIR = os.path.join(ROOT, "src", "assets")
CUTSCENE_DIR = os.path.join(ROOT, "tools", "cutscene")

PALETTE.update({
    "path": rgb(212, 172, 96),
    "path_edge": rgb(186, 150, 82),
    "plaza": rgb(200, 160, 92),
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
    "idol": rgb(132, 118, 92),
    "idol_face": rgb(196, 182, 136),
    "moss": rgb(96, 150, 60),
    "torch_fire": rgb(255, 150, 40),
    "pad": rgb(120, 122, 126),
    "shallows": rgb(120, 240, 200),
    "metal_dark": rgb(50, 52, 56),
    "ink": rgb(20, 18, 16),
    "flower": rgb(255, 90, 120),
    "lagoon_bed": rgb(96, 168, 128),
})

ISLAND_X, ISLAND_Z = 112, 92          # half extents of the sand top
PATH_WIDTH = 9
BASE_POS = (0, 0, 42)
BASE_RING = 15                        # sandbag ring radius
PLAZA_R = 13                          # packed-dirt floor inside the ring
PLAZA_Y = 0.2                         # props inside the camp stand on the plaza
CLIFF_FRONT = -70
LAGOON = (50, 100, -58, -16)          # x0, x1, z0, z1
PLATEAU_X = 32                        # plateau spans |x| < 32

# Monkey routes: spawn point first, base gate last. North starts at the temple door at y=24.
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
        self.obj = None

    def group(self, name):
        if name not in self.groups:
            self.groups[name] = Builder(name)
        return self.groups[name]


M = Map()
R = M.rng


def obj(name):
    """Everything added until the next obj() call belongs to one object (for the overlap check).
    Names starting with "T:" are terrain: props may sit in them."""
    M.obj = name


def _tag(g, n0, dy=0.0):
    for p in M.group(g).parts[n0:]:
        p["obj"] = M.obj
        if dy:
            p["pos"][1] += dy


def brick(g, name, size, pos, color, **kw):
    n0 = len(M.group(g).parts)
    M.group(g).add(name, size, pos, color, look=STUDS, **kw)
    _tag(g, n0)


def smooth(g, name, size, pos, color, **kw):
    n0 = len(M.group(g).parts)
    M.group(g).add(name, size, pos, color, **kw)
    _tag(g, n0)


def rope(g, name, p0, p1, thickness, color):
    n0 = len(M.group(g).parts)
    M.group(g).segment(name, p0, p1, thickness, color)
    _tag(g, n0)


def palm(g, name, x, z, y=0.0, lean=None, h=None):
    obj(name)
    n0 = len(M.group(g).parts)
    _voxel_palm(M.group(g), R, name, x, z, R.uniform(-14, 14) if lean is None else lean,
                R.randint(7, 10) if h is None else h)
    _tag(g, n0, dy=y)


def box(g, name, x0, x1, y0, y1, z0, z1, color, studs=True, **kw):
    """Axis-aligned part given by its bounds (keeps neighbouring parts exactly flush)."""
    size = (x1 - x0, y1 - y0, z1 - z0)
    pos = ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
    (brick if studs else smooth)(g, name, size, pos, color, **kw)


class Frame:
    """A local frame (rotation + origin) for building props in their own coordinates."""

    def __init__(self, origin, yaw=0.0, pitch=0.0, roll=0.0):
        self.R = matmul(rot_matrix(0, yaw, 0), matmul(rot_matrix(pitch, 0, 0), rot_matrix(0, 0, roll)))
        self.o = list(origin)

    def at(self, p):
        w = matvec(self.R, p)
        return [w[i] + self.o[i] for i in range(3)]

    def add(self, g, name, size, lpos, color, lrot=(0, 0, 0), studs=True, **kw):
        rot = matmul(self.R, rot_matrix(*lrot))
        (brick if studs else smooth)(g, name, size, self.at(lpos), color, rot=rot, **kw)


# ---------------------------------------------------------------- footprints

FOOT = {"ground": [], "canopy": []}


def seg_dist(x, z, a, b):
    ax, az, bx, bz = a[0], a[2], b[0], b[2]
    dx, dz = bx - ax, bz - az
    L2 = dx * dx + dz * dz or 1
    t = max(0, min(1, ((x - ax) * dx + (z - az) * dz) / L2))
    return math.hypot(ax + dx * t - x, az + dz * t - z)


def path_dist(x, z):
    return min(seg_dist(x, z, a, b) for pts in PATHS.values() for a, b in zip(pts, pts[1:]) if a[1] == b[1] == 0)


def take(layer, x, z, r):
    FOOT[layer].append((x, z, r))


def free(x, z, ground, canopy=0.0, path_margin=1.5):
    """True if a prop with these footprint radii fits at (x, z) on open sand."""
    r = max(ground, canopy)
    if abs(x) > ISLAND_X - 5 - ground or z > ISLAND_Z - 5 - ground or z < CLIFF_FRONT + 2 + r:
        return False
    lx0, lx1, lz0, lz1 = LAGOON
    if lx0 - 3 - r < x < lx1 + 3 + r and lz0 - 3 - r < z < lz1 + 4.5 + r:
        return False
    if path_dist(x, z) < PATH_WIDTH / 2 + 1 + path_margin + ground:
        return False
    if math.hypot(x - BASE_POS[0], z - BASE_POS[2]) < BASE_RING + 2 + r:
        return False
    for layer, rr in (("ground", ground), ("canopy", canopy)):
        if rr and any(math.hypot(x - fx, z - fz) < rr + fr for fx, fz, fr in FOOT[layer]):
            return False
    return True


# ---------------------------------------------------------------- ground


def build_ground():
    g = "Map_Ground"
    obj("T:ground")
    smooth(g, "Water", (700, 1, 700), (0, -1.6, 0), "water", reflectance=0.08)
    smooth(g, "Shallows", (ISLAND_X * 2 + 36, 0.2, ISLAND_Z * 2 + 36), (0, -1.0, 0), "shallows",
           transparency=0.25)
    # sand top split into tiles so the east lagoon can be cut out
    lx0, lx1, lz0, lz1 = LAGOON
    tiles = [
        (-ISLAND_X, ISLAND_X, -ISLAND_Z, lz0),          # north strip
        (-ISLAND_X, ISLAND_X, lz1, ISLAND_Z),           # south strip
        (-ISLAND_X, lx0, lz0, lz1),                     # west of lagoon
        (lx1, ISLAND_X, lz0, lz1),                      # east of lagoon
    ]
    for i, (x0, x1, z0, z1) in enumerate(tiles):
        box(g, f"Sand{i + 1}", x0, x1, -2, 0, z0, z1, "sand")
    box(g, "LagoonBed", lx0, lx1, -2, -1.4, lz0, lz1, "lagoon_bed")
    # shoreline: a lime band on the outside, a green band inside it (S, W and E edges; N is cliff)
    for k, (w0, w1, col) in enumerate(((0, 2.4, "grass_lime"), (2.4, 3.8, "grass"))):
        box(g, f"ShoreS{k}", -ISLAND_X + w0, ISLAND_X - w0, 0, 0.25, ISLAND_Z - w1, ISLAND_Z - w0, col)
        for side, sx in (("W", -1), ("E", 1)):
            xa, xb = sorted((sx * (ISLAND_X - w0), sx * (ISLAND_X - w1)))
            box(g, f"Shore{side}{k}", xa, xb, 0, 0.25, CLIFF_FRONT, ISLAND_Z - w1, col)

    # waterline rocks: laid one after another with a gap so they never touch
    def rock_line(prefix, a0, a1, place):
        a, i = a0, 0
        while True:
            w = R.uniform(2.6, 4.6)
            if a + w > a1:
                break
            place(f"{prefix}{i + 1}", a + w / 2, w)
            a += w + R.uniform(0.6, 1.6)
            i += 1

    obj("BeachRocks")
    rock_line("BeachRock", -ISLAND_X + 1, ISLAND_X - 1, lambda n, c, w: brick(
        g, n, (w, R.uniform(0.6, 1.4), R.uniform(1.6, 2.6)), (c, -0.5, ISLAND_Z + 1.6),
        R.choice(["rock", "rock_dark", "rock_light"])))
    for side, sx in (("W", -1), ("E", 1)):
        obj(f"SideRocks{side}")
        rock_line(f"SideRock{side}", CLIFF_FRONT + 1, ISLAND_Z - 1, lambda n, c, w, sx=sx: brick(
            g, n, (R.uniform(1.6, 2.6), R.uniform(0.6, 1.4), w), (sx * (ISLAND_X + 1.6), -0.5, c),
            R.choice(["rock", "rock_dark"])))

    # two little islets out at sea
    for i, (x, z, r) in enumerate(((150, 64, 7), (-146, 28, 6))):
        obj(f"T:Islet{i}")
        smooth(g, f"Islet{i}", (1.6, r * 2, r * 2), (x, -0.6, z), "sand", shape="Cylinder", rot=(0, 0, 90))
        obj(f"IsletRock{i}")
        brick(g, f"IsletRock{i}", (3, 1.6, 2.4), (x - r * 0.45, 0.6, z + r * 0.3), "rock", rot=(0, 20, 0))
        palm(g, f"IsletPalm{i}", x + 1, z - 1, y=0.2)


# ---------------------------------------------------------------- paths (rasterised studded trails)


def rects(cells):
    """Greedy merge of grid cells into as few rectangles as possible."""
    cells = set(cells)
    out = []
    for x, z in sorted(cells, key=lambda c: (c[1], c[0])):
        if (x, z) not in cells:
            continue
        w = 1
        while (x + w, z) in cells:
            w += 1
        h = 1
        while all((x + i, z + h) in cells for i in range(w)):
            h += 1
        for i in range(w):
            for j in range(h):
                cells.discard((x + i, z + j))
        out.append((x, z, w, h))
    return out


def build_paths():
    g = "Map_Paths"
    inner, edge, plaza = set(), set(), set()
    lim = ISLAND_X - 4  # stop at the shore bands
    bx, _, bz = BASE_POS
    for x in range(-lim, lim):
        for z in range(-50, ISLAND_Z - 4):
            cx, cz = x + 0.5, z + 0.5
            d = path_dist(cx, cz)
            db = math.hypot(cx - bx, cz - bz)
            if db < PLAZA_R:
                plaza.add((x, z))
            elif d < PATH_WIDTH / 2:
                inner.add((x, z))
            elif d < PATH_WIDTH / 2 + 1 and db > PLAZA_R + 1:
                edge.add((x, z))
    obj("T:paths")
    for name, cells, col in (("Path", inner, "path"), ("PathEdge", edge, "path_edge"), ("Plaza", plaza, "plaza")):
        for i, (x, z, w, h) in enumerate(rects(cells)):
            box(g, f"{name}{i + 1}", x, x + w, 0, 0.2, z, z + h, col)
    # the stretch from the temple door to the top of the stairs is a stone walkway
    box(g, "TempleWalk", -5, 5, 24, 24.2, -82, -74, "stone")


# ---------------------------------------------------------------- north: cliff, temple, giant stairs


def build_north():
    g = "Map_North"
    # terraced cliff: 5 stepped rows; column heights from smooth noise (quantised to 2 studs), and
    # neighbouring columns of equal height merged into one chunky block
    rows = [(CLIFF_FRONT, CLIFF_FRONT - 4, 6), (CLIFF_FRONT - 4, CLIFF_FRONT - 8, 11), (CLIFF_FRONT - 8, CLIFF_FRONT - 12, 16),
            (CLIFF_FRONT - 12, CLIFF_FRONT - 16, 22), (CLIFF_FRONT - 16, -ISLAND_Z, 29)]
    top_row = len(rows) - 1
    look_cols = (11, 12, 13)          # the lookout ledge: one flat 12-stud block on the east cliff top
    tops, blocks = {}, []
    obj("T:cliff")
    cols = [ix for ix in range(-ISLAND_X // 4, ISLAND_X // 4) if not -PLATEAU_X <= ix * 4 < PLATEAU_X]
    for r, (zf, zb, base) in enumerate(rows):
        heights = {}
        for ix in cols:
            x0 = ix * 4
            n = 1.3 * math.sin(x0 * 0.11 + r * 1.7) + 0.8 * math.sin(x0 * 0.29 + r * 0.6)
            heights[ix] = base + 2 * round(n) + (2 if abs(x0) > 80 and r == top_row else 0)
            if r == top_row and ix in look_cols:
                heights[ix] = base
        k = 0
        while k < len(cols):
            j = k
            if r == top_row and cols[k] == look_cols[0]:
                j = k + len(look_cols) - 1
            else:
                while (j + 1 < len(cols) and cols[j + 1] == cols[j] + 1 and heights[cols[j + 1]] == heights[cols[k]] and j - k < 2
                       and not (r == top_row and cols[j + 1] == look_cols[0])):
                    j += 1
            ix0, ix1, h = cols[k], cols[j], heights[cols[k]]
            box(g, f"Cliff_{ix0}_{r}", ix0 * 4, ix1 * 4 + 4, 0, h, zb, zf, R.choice(["rock", "rock_light", "rock_dark"]))
            grass = r < top_row and R.random() < 0.45
            if grass:
                box(g, f"CliffGrass_{ix0}_{r}", ix0 * 4, ix1 * 4 + 4, h, h + 0.5, zb, zf, R.choice(["moss", "grass"]))
            blocks.append((r, ix0, ix1, h))
            for ix in range(ix0, ix1 + 1):
                tops[(ix, r)] = h + (0.5 if grass else 0)
            k = j + 1
    # plateau the temple stands on (in a notch of the cliff), stone columns in two tones
    obj("T:plateau")
    for k in range(8):
        x0 = -PLATEAU_X + k * 8
        box(g, f"Plateau{k + 1}", x0, x0 + 8, 0, 24, -ISLAND_Z, -74, "temple_dark" if k % 2 else "temple")
    # giant stairs: 23 one-stud steps from the plateau edge down to the sand
    obj("Stairs")
    for s in range(23):
        top = 23 - s
        z0 = -74 + s
        box(g, f"Stair{s + 1}", -7, 7, 0, top, z0, z0 + 1, "stone" if s % 2 else "stone_dark")
        for side in (-1, 1):
            post = s % 6 == 0
            xa, xb = sorted((side * 7, side * 8.6))
            box(g, f"StairRail{'L' if side < 0 else 'R'}{s + 1}", xa, xb, 0, top + (3 if post else 1.2), z0, z0 + 1,
                "stone_dark" if post else "stone")
            if post:
                smooth(g, f"StairLantern{'L' if side < 0 else 'R'}{s + 1}", (0.9, 0.9, 0.9),
                       (side * 7.8, top + 3.45, z0 + 0.5), "lantern", neon=True)

    # temple: stepped pyramid centred at z=-87, front tier has a real doorway
    obj("Temple")
    tiers = [(30, 24, 30, -92, -82), (24, 30, 35, -91, -83), (18, 35, 40, -90, -84), (12, 40, 44, -89, -85)]
    for k, (w, y0, y1, z0, z1) in enumerate(tiers):
        col = "temple" if k % 2 else "temple_dark"
        if k == 0:
            box(g, "Temple1L", -15, -3, y0, y1, z0, z1, col)
            box(g, "Temple1R", 3, 15, y0, y1, z0, z1, col)
            box(g, "Temple1Lintel", -3, 3, 29, y1, z0, z1, col)
            box(g, "TempleDark", -3, 3, y0, 29, z0, -84, (0.06, 0.05, 0.05), studs=False)
        else:
            box(g, f"Temple{k + 1}", -w / 2, w / 2, y0, y1, z0, z1, col)
    for sx in (-1, 1):
        xa, xb = sorted((sx * 3, sx * 4))
        box(g, f"DoorPilaster{'L' if sx < 0 else 'R'}", xa, xb, 24, 29, -82, -81.4, "stone")
    box(g, "DoorLintel", -4, 4, 29, 30, -82, -81.4, "stone")
    box(g, "Brazier", -1, 1, 44, 45, -88, -86, "temple_dark")
    smooth(g, "BrazierFire", (1.2, 1.4, 1.2), (0, 45.7, -87), "torch_fire", neon=True, rot=(0, 45, 0))

    # carved monkey idol: big stone head on the front of the top tiers, glowing eyes
    obj("Idol")
    box(g, "IdolHeadLow", -5, 5, 35, 40, -84, -82.8, "idol")
    box(g, "IdolHeadHigh", -5, 5, 40, 44, -85, -82.8, "idol")
    box(g, "IdolTuft", -1.5, 1.5, 44, 45, -84.6, -83.2, "idol")
    for sx, side in ((-1, "L"), (1, "R")):
        xa, xb = sorted((sx * 5, sx * 7.4))
        box(g, f"IdolEar{side}", xa, xb, 38.5, 42, -84, -83, "idol")
        xa, xb = sorted((sx * 5.6, sx * 6.8))
        box(g, f"IdolEarIn{side}", xa, xb, 39.2, 41.3, -83, -82.8, "idol_face")
        xa, xb = sorted((sx * 0.9, sx * 2.5))
        box(g, f"IdolEye{side}", xa, xb, 40.2, 41.8, -82.4, -82.2, "torch_fire", studs=False, neon=True)
        xa, xb = sorted((sx * 0.5, sx * 1.1))
        box(g, f"IdolNostril{side}", xa, xb, 38.2, 38.8, -82.0, -81.9, "ink", studs=False)
    box(g, "IdolFace", -3.6, 3.6, 39.4, 42.4, -82.8, -82.4, "idol_face")
    box(g, "IdolBrow", -4.2, 4.2, 42.4, 43.4, -82.8, -82.2, "temple_dark")
    box(g, "IdolMuzzle", -3, 3, 35.8, 39.4, -82.8, -82.0, "idol_face")
    box(g, "IdolMouth", -2, 2, 36.6, 37.2, -82.0, -81.9, "ink", studs=False)

    # pillars with fire bowls flanking the walkway
    for i, x in enumerate((-22, -14, 14, 22)):
        obj(f"Pillar{i + 1}")
        box(g, f"Pillar{i + 1}", x - 1.2, x + 1.2, 24, 33, -79.2, -76.8, "temple")
        box(g, f"PillarCap{i + 1}", x - 1.6, x + 1.6, 33, 34, -79.6, -76.4, "temple_dark")
        smooth(g, f"PillarFlame{i + 1}", (1.2, 1.6, 1.2), (x, 34.8, -78), "torch_fire", neon=True)
    obj("PlateauMoss")
    for i, (x0, x1, z0, z1) in enumerate(((-30, -26, -90, -86), (26, 29, -91, -87), (-20, -17, -91, -89),
                                          (17.5, 20.5, -81, -79.6), (-30, -27, -79, -76))):
        box(g, f"Moss{i + 1}", x0, x1, 24, 24.4, z0, z1, "moss")

    # palms and bushes on the cliff top / terraces
    # the reference's cliff-top lookout: a plank cabin on a sand ledge at the cliff edge, a dish on
    # its roof, a lit window and a lantern post, facing the beach
    ix0, ix1 = look_cols[0], look_cols[-1]
    h = tops[(ix0, top_row)]
    zf, zb = rows[top_row][0], rows[top_row][1]
    obj("Lookout")
    box(g, "LookoutLedge", ix0 * 4, ix1 * 4 + 4, h, h + 0.6, zb, zf, "sand")
    lx, f = ix0 * 4 + 6.6, h + 0.6
    cz0, cz1 = zb + 0.6, zb + 5.6                     # cabin depth 5, its front 0.4 back from the edge
    box(g, "LookoutFloor", lx - 4.5, lx + 4.5, f, f + 0.4, cz0, cz1, "wood")
    f += 0.4
    planks = ("wood_dark", "wood")
    for k in range(4):                                # plank courses on the back and side walls
        y0, y1 = f + k * 1.1, f + (k + 1) * 1.1
        box(g, f"LookoutBack{k}", lx - 4.5, lx + 4.5, y0, y1, cz0, cz0 + 0.5, planks[k % 2])
        for sx, side in ((-1, "L"), (1, "R")):
            xa, xb = sorted((lx + sx * 4.5, lx + sx * 4.0))
            box(g, f"LookoutSide{side}{k}", xa, xb, y0, y1, cz0 + 0.5, cz1 - 0.5, planks[k % 2])
    top = f + 4.4
    fz0, fz1 = cz1 - 0.5, cz1
    box(g, "LookoutFrontL", lx - 4.5, lx - 3, f, top, fz0, fz1, "wood_dark")
    box(g, "LookoutDoorTop", lx - 3, lx - 1, f + 3.2, top, fz0, fz1, "wood_dark")
    box(g, "LookoutFrontM", lx - 1, lx + 1.2, f, top, fz0, fz1, "wood_dark")
    box(g, "LookoutSill", lx + 1.2, lx + 3, f, f + 1.6, fz0, fz1, "wood_dark")
    box(g, "LookoutWinTop", lx + 1.2, lx + 3, f + 3, top, fz0, fz1, "wood_dark")
    box(g, "LookoutFrontR", lx + 3, lx + 4.5, f, top, fz0, fz1, "wood_dark")
    box(g, "LookoutTrim", lx - 4.5, lx + 4.5, top, top + 0.3, fz0 - 0.1, fz1 + 0.1, "wood")
    smooth(g, "LookoutLamp", (0.7, 0.7, 0.7), (lx + 2.1, f + 2.3, fz0 - 0.6), "lantern", neon=True)
    box(g, "LookoutRoof", lx - 5.2, lx + 5.2, top + 0.3, top + 0.9, cz0 - 0.5, cz1 + 0.9, "trunk_ring")
    box(g, "LookoutRoofTop", lx - 4.2, lx + 4.2, top + 0.9, top + 1.4, cz0, cz1 + 0.2, "wood_dark")
    obj("Dish")
    dx, dz, ry = lx + 2.4, cz0 + 2.2, top + 1.4
    box(g, "DishPost", dx - 0.3, dx + 0.3, ry, ry + 2.4, dz - 0.3, dz + 0.3, "metal")
    # tipped up toward the sky and the beach (its axis is a), a lighter bowl, a feed arm on its axis
    a, at = (0.3, 0.78, 0.55), (lambda c, k: (c[0] + a[0] * k, c[1] + a[1] * k, c[2] + a[2] * k))
    c = at((dx, ry + 2.4, dz), 0.6)
    smooth(g, "Dish", (0.35, 3.8, 3.8), c, "white", shape="Cylinder", rot=(25, -30, 70))
    smooth(g, "DishBowl", (0.1, 2.6, 2.6), at(c, 0.245), (0.8, 0.8, 0.78), shape="Cylinder", rot=(25, -30, 70))
    rope(g, "DishArm", at(c, 0.32), at(c, 1.5), 0.18, "metal")
    smooth(g, "DishFeed", (0.4, 0.4, 0.4), at(c, 1.72), "metal")
    obj("LookoutLantern")
    px = ix1 * 4 + 3.6
    box(g, "LanternPost", px - 0.25, px + 0.25, h + 0.6, h + 3.6, zf - 0.6, zf - 0.1, "wood_dark")
    smooth(g, "LanternLight", (0.8, 0.8, 0.8), (px, h + 4.0, zf - 0.35), "lantern", neon=True)

    for i, x in enumerate((-100, -84, -60, -44, 44, 58, 80, 100)):
        ix = math.floor(x / 4)
        if ix0 <= ix <= ix1 + 1:
            continue  # the lookout is there
        palm(g, f"CliffPalm{i + 1}", ix * 4 + 2, -88, y=tops[(ix, top_row)])
    for i in range(16):
        ix = R.choice(cols)
        r = R.randint(0, top_row - 1)
        x, z = ix * 4 + 2, rows[r][0] - 2
        if (ix, r, "b") in tops:
            continue
        tops[(ix, r, "b")] = True
        obj(f"CliffBush{i}")
        y = tops[(ix, r)]
        brick(g, f"CliffBush{i}a", (3, 1.4, 3), (x, y + 0.7, z), R.choice(["leaf", "leaf_dark"]))
        brick(g, f"CliffBush{i}b", (1.8, 1, 1.8), (x, y + 1.9, z), "leaf_light", rot=(0, 45, 0))


# ---------------------------------------------------------------- west: jungle


def voxel_tree(g, name, x, z, h):
    """Broadleaf jungle tree: chunky trunk, root flare, stacked leaf slabs (each sits on the last)."""
    obj(name)
    brick(g, name + "Trunk", (2, h, 2), (x, h / 2, z), "trunk")
    brick(g, name + "Root", (3.6, 1, 3.6), (x, 0.5, z), "trunk_ring", rot=(0, 45, 0))
    for k in range(5):
        s = 9 - k * 1.6 + R.uniform(-0.5, 0.5)
        brick(g, f"{name}Leaf{k}", (s, 1.5, s), (x + R.uniform(-0.5, 0.5), h + 0.75 + k * 1.5, z + R.uniform(-0.5, 0.5)),
              R.choice(["leaf", "leaf_dark", "leaf_light"]), rot=(0, R.uniform(0, 90), 0))


def bush(g, name, x, z, s, y=0.0):
    obj(name)
    h1 = s * 0.5
    brick(g, name + "a", (s, h1, s), (x, y + h1 / 2, z), R.choice(["leaf", "leaf_dark", "grass"]),
          rot=(0, R.uniform(0, 90), 0))
    brick(g, name + "b", (s * 0.6, s * 0.35, s * 0.6), (x, y + h1 + s * 0.175, z), "leaf_light",
          rot=(0, R.uniform(0, 90), 0))


def boulder(g, name, x, z, w, h, d):
    obj(name)
    brick(g, name, (w, h, d), (x, h / 2 - 0.3, z), R.choice(["rock", "rock_light"]), rot=(0, R.uniform(0, 90), 0))
    brick(g, name + "Top", (w * 0.55, h * 0.4, d * 0.55), (x, h - 0.3 + h * 0.2, z), "rock_dark",
          rot=(0, R.uniform(0, 90), 0))


def scatter(g, n, tries, region, make):
    placed = 0
    for _ in range(tries):
        if placed >= n:
            break
        x, z = R.uniform(region[0], region[1]), R.uniform(region[2], region[3])
        if make(x, z, placed):
            placed += 1
    return placed


def groves(n, tries, region, size, spread, make):
    """Clustered planting like the reference: a few tight groups of 2-4, open sand in between.
    Returns the trunk positions so bushes can sit at their feet instead of dotting the beach."""
    trunks, placed = [], 0
    for _ in range(tries):
        if placed >= n:
            break
        cx, cz = R.uniform(region[0], region[1]), R.uniform(region[2], region[3])
        want = R.randint(*size)
        got = []
        for _ in range(want * 30):
            if len(got) >= want or placed >= n:
                break
            a, d = R.uniform(0, math.tau), R.uniform(0, spread) if got else 0
            x, z = cx + math.cos(a) * d, cz + math.sin(a) * d
            if make(x, z, placed):
                got.append((x, z))
                placed += 1
        trunks += got
    return trunks


def foot_bushes(g, trunks, n, size):
    """Bushes tucked against the trunks of a grove."""
    placed = 0
    for i in range(n * 40):
        if placed >= n or not trunks:
            break
        tx, tz = R.choice(trunks)
        a, d = R.uniform(0, math.tau), R.uniform(2.6, 4.2)
        x, z, s = tx + math.cos(a) * d, tz + math.sin(a) * d, R.uniform(*size)
        if not free(x, z, s * 0.75):
            continue
        bush(g, f"Bush{placed}", x, z, s)
        take("ground", x, z, s * 0.75)
        placed += 1


def build_west():
    g = "Map_West"
    region = (-ISLAND_X + 6, -58, CLIFF_FRONT + 4, ISLAND_Z - 6)

    def tree(x, z, i):
        if R.random() < 0.45:
            if not free(x, z, 2.6, 6.6):
                return False
            voxel_tree(g, f"Tree{i}", x, z, R.randint(8, 12))
            take("ground", x, z, 2.6)
            take("canopy", x, z, 6.6)
        else:
            if not free(x, z, 0.9, 5.4):
                return False
            palm(g, f"Palm{i}", x, z)
            take("ground", x, z, 0.9)
            take("canopy", x, z, 5.4)
        return True

    def rock_at(x, z, i):
        w, d = R.uniform(4, 6), R.uniform(4, 6)
        r = math.hypot(w, d) / 2
        if not free(x, z, r):
            return False
        boulder(g, f"Boulder{i}", x, z, w, R.uniform(2.6, 4), d)
        take("ground", x, z, r)
        return True

    trunks = groves(28, 400, region, (3, 5), 8, tree)
    scatter(g, 5, 600, region, rock_at)
    foot_bushes(g, trunks, 12, (2.4, 3.6))


# ---------------------------------------------------------------- east: lagoon, dock, huts


def hut(g, name, x, z, stilts=True, door="S"):
    obj(name)
    base = 3 if stilts else 0
    if stilts:
        for sx in (-1, 1):
            for sz in (-1, 1):
                box(g, f"{name}Stilt{sx}{sz}", x + sx * 3.4 - 0.4, x + sx * 3.4 + 0.4, -1.4, base,
                    z + sz * 3.4 - 0.4, z + sz * 3.4 + 0.4, "wood_dark")
    box(g, name + "Floor", x - 4, x + 4, base, base + 0.6, z - 4, z + 4, "wood")
    y0, y1 = base + 0.6, base + 4.6
    dz = 1 if door == "S" else -1
    # front/back walls run the full width, side walls fit between them
    box(g, name + "WallBack", x - 4, x + 4, y0, y1, *sorted((z - dz * 4, z - dz * 3.4)), "wood")
    for sx in (-1, 1):
        box(g, f"{name}WallSide{sx}", *sorted((x + sx * 4, x + sx * 3.4)), y0, y1, z - 3.4, z + 3.4, "wood_dark")
        box(g, f"{name}WallFront{sx}", *sorted((x + sx * 4, x + sx * 1.4)), y0, y1, *sorted((z + dz * 4, z + dz * 3.4)),
            "wood_dark")
    box(g, name + "DoorTop", x - 1.4, x + 1.4, y1 - 1, y1, *sorted((z + dz * 4, z + dz * 3.4)), "wood_dark")
    for k in range(4):
        s = 10 - k * 2.4
        box(g, f"{name}Roof{k}", x - s / 2, x + s / 2, y1 + k * 0.85, y1 + (k + 1) * 0.85, z - s / 2, z + s / 2,
            "trunk_ring" if k % 2 else "wood")


def ladder(g, name, x, y0, y1, z0, z1):
    """Wooden ladder standing on a deck, rails at x +-0.7, between z0..z1."""
    obj(name)
    for sx in (-1, 1):
        box(g, f"{name}Rail{sx}", x + sx * 0.7 - 0.125, x + sx * 0.7 + 0.125, y0, y1, z0, z1, "wood_dark")
    y = y0 + 0.5
    k = 0
    while y + 0.2 < y1 - 0.3:
        box(g, f"{name}Rung{k}", x - 0.575, x + 0.575, y, y + 0.2, z0 + 0.03, z1 - 0.03, "wood")
        y += 0.6
        k += 1


def barrel(g, name, x, z):
    obj(name)
    smooth(g, name, (1.8, 1.7, 1.7), (x, 0.9, z), "wood", shape="Cylinder", rot=(0, 0, 90))
    smooth(g, name + "Band", (0.25, 1.8, 1.8), (x, 1.2, z), "metal", shape="Cylinder", rot=(0, 0, 90))
    take("ground", x, z, 1.0)


def ring(g, name, x0, x1, z0, z1, w, y0, y1, color):
    """Rectangular frame of width w inside x0..x1 / z0..z1 (four strips, no overlaps)."""
    box(g, name + "N", x0, x1, y0, y1, z0, z0 + w, color)
    box(g, name + "S", x0, x1, y0, y1, z1 - w, z1, color)
    box(g, name + "W", x0, x0 + w, y0, y1, z0 + w, z1 - w, color)
    box(g, name + "E", x1 - w, x1, y0, y1, z0 + w, z1 - w, color)


def rope_between(g, name, p, q, inset=0.36):
    d = [q[i] - p[i] for i in range(3)]
    L = math.sqrt(sum(c * c for c in d))
    a = [p[i] + d[i] / L * inset for i in range(3)]
    b = [q[i] - d[i] / L * inset for i in range(3)]
    rope(g, name, a, b, 0.2, "rope")


def build_east():
    g = "Map_East"
    lx0, lx1, lz0, lz1 = LAGOON
    # sunken pond: a wet-sand ledge just above the water, a submerged step, see-through water
    obj("T:lagoon")
    ring(g, "LagoonBank", lx0, lx1, lz0, lz1, 2, -1.4, -0.3, "sand_dark")
    ring(g, "LagoonStep", lx0 + 2, lx1 - 2, lz0 + 2, lz1 - 2, 2, -1.4, -1.0, "sand_dark")
    box(g, "LagoonWater", lx0 + 2, lx1 - 2, -1.4, -0.6, lz0 + 2, lz1 - 2, "water", studs=False,
        reflectance=0.08, transparency=0.3)
    ring(g, "LagoonGrass", lx0 - 1.6, lx1 + 1.6, lz0 - 1.6, lz1 + 1.6, 1.6, 0, 0.25, "grass_lime")

    # boardwalk: one deck on stringers and pilings, rope railings, branches + ladders up to both huts
    zn, zs = -39.25, -34.75
    DY0, DY1 = 0.3, 0.6
    obj("Boardwalk")
    x, i = 46.0, 0
    while x + 1 <= 92:
        box(g, f"Plank{i}", x, x + 1, DY0, DY1, zn, zs, "wood" if i % 2 else "wood_dark")
        x += 1.1
        i += 1
    end_x = x - 0.1
    for side, (za, zb) in (("N", (zn, zn + 0.5)), ("S", (zs - 0.5, zs))):
        box(g, f"Stringer{side}", 46, end_x, 0, DY0, za, zb, "wood_dark")
    xs = [46.4 + k * 4.4 for k in range(11) if 46.4 + k * 4.4 < end_x - 0.4] + [end_x - 0.4]
    for k, px in enumerate(xs):
        if px > 50.5:
            for side, zc in (("N", zn + 0.25), ("S", zs - 0.25)):
                box(g, f"Piling{k}{side}", px - 0.35, px + 0.35, -1.4, 0, zc - 0.35, zc + 0.35, "wood_dark")
    # branch A runs north to HutA's door, branch B south to HutB's door
    k, z1 = 0, zn
    while z1 - 1 >= -45 - 1e-6:
        box(g, f"BranchA{k}", 64, 68, DY0, DY1, z1 - 1, z1, "wood" if k % 2 else "wood_dark")
        z1 -= 1.1
        k += 1
    k, z0 = 0, zs
    while z0 + 1 <= -30 + 1e-6:
        box(g, f"BranchB{k}", 86, 90, DY0, DY1, z0, z0 + 1, "wood" if k % 2 else "wood_dark")
        z0 += 1.1
        k += 1
    for px in (64.4, 67.6):
        box(g, f"BranchPilingA{px}", px - 0.35, px + 0.35, -1.4, DY0, -44.9, -44.2, "wood_dark")
    for px in (86.4, 89.6):
        box(g, f"BranchPilingB{px}", px - 0.35, px + 0.35, -1.4, DY0, -30.8, -30.1, "wood_dark")
    # railing posts and ropes; the main deck rail opens where each branch leaves it
    openings = {"N": (64, 68), "S": (86, 90)}
    for side, zc in (("N", zn + 0.3), ("S", zs - 0.3)):
        o0, o1 = openings[side]
        posts = sorted([px for px in xs if not o0 - 0.6 < px < o1 + 0.6] + [o0 - 0.4, o1 + 0.4])
        for k, px in enumerate(posts):
            box(g, f"Rail{side}{k}", px - 0.3, px + 0.3, DY1, DY1 + 1.6, zc - 0.3, zc + 0.3, "wood_dark")
            if k and not (posts[k - 1] < o0 < px):
                rope_between(g, f"RailRope{side}{k}", (posts[k - 1], DY1 + 1.3, zc), (px, DY1 + 1.3, zc))
    rope_between(g, "RailRopeEnd", (end_x - 0.4, DY1 + 1.3, zn + 0.3), (end_x - 0.4, DY1 + 1.3, zs - 0.3))
    for name, bx0, za, zb in (("A", 64, -44.0, zn - 0.6), ("B", 86, zs + 0.6, -31.0)):
        for px in (bx0 + 0.3, bx0 + 3.7):
            for k, pz in enumerate((za, zb)):
                box(g, f"BranchRail{name}{px}{k}", px - 0.3, px + 0.3, DY1, DY1 + 1.6, pz - 0.3, pz + 0.3, "wood_dark")
            rope_between(g, f"BranchRope{name}{px}", (px, DY1 + 1.3, za), (px, DY1 + 1.3, zb))
    hut(g, "HutA", 66, -49, door="S")
    hut(g, "HutB", 88, -26, door="N")
    ladder(g, "LadderA", 66, DY1, 4.6, -44.95, -44.7)
    ladder(g, "LadderB", 88, DY1, 4.6, -30.3, -30.05)
    hut(g, "HutC", 104, -63, stilts=False, door="S")
    take("ground", 104, -63, 6)
    take("canopy", 104, -63, 6)

    # pond life: lily pads on the water, reed clumps and stones on the bank
    keep_out = [(46, 93, zn - 0.8, zs + 0.8), (63.2, 68.8, -45.4, zn), (85.2, 90.8, zs, -29.6),
                (61.5, 70.5, -53.5, -44.5), (83.5, 92.5, -30.5, -21.5)]
    pads = []
    for k in range(400):
        if len(pads) >= 16:
            break
        d = R.uniform(1.4, 2.4)
        px, pz = R.uniform(lx0 + 2.5 + d / 2, lx1 - 2.5 - d / 2), R.uniform(lz0 + 2.5 + d / 2, lz1 - 2.5 - d / 2)
        if any(a - d / 2 < px < b + d / 2 and c - d / 2 < pz < e + d / 2 for a, b, c, e in keep_out):
            continue
        if any(math.hypot(px - qx, pz - qz) < (d + qd) / 2 + 0.6 for qx, qz, qd in pads):
            continue
        pads.append((px, pz, d))
        obj(f"LilyPad{k}")
        smooth(g, f"LilyPad{k}", (0.1, d, d), (px, -0.55, pz), "leaf" if k % 2 else "leaf_light", shape="Cylinder",
               rot=(0, 0, 90))
        if R.random() < 0.35:
            brick(g, f"LilyFlower{k}", (0.45, 0.35, 0.45), (px + d * 0.15, -0.325, pz), "flower", rot=(0, 45, 0))
    for k, (rx, rz) in enumerate(((51, -57), (99, -57), (51, -17), (99, -17), (76, -57), (51, -48), (99, -42),
                                  (72, -17))):
        obj(f"Reeds{k}")
        for j, (ox, oz) in enumerate(((-0.45, -0.3), (0.35, -0.4), (0.0, 0.45), (0.55, 0.35))):
            h = R.uniform(1.6, 2.6)
            box(g, f"Reed{k}_{j}", rx + ox - 0.12, rx + ox + 0.12, -0.3, -0.3 + h, rz + oz - 0.12, rz + oz + 0.12, "grass")
            if j % 2 == 0:
                box(g, f"Cattail{k}_{j}", rx + ox - 0.2, rx + ox + 0.2, -0.3 + h, -0.3 + h + 0.6, rz + oz - 0.2,
                    rz + oz + 0.2, "trunk_ring")
    for k, (sx, sz) in enumerate(((51, -27), (99, -50), (86, -57), (60, -17), (88, -17), (99, -24))):
        obj(f"BankStone{k}")
        box(g, f"BankStone{k}", sx - 0.9, sx + 0.9, -0.3, 0.6, sz - 0.7, sz + 0.7, R.choice(["rock", "rock_light"]))
        box(g, f"BankStone{k}Top", sx - 0.5, sx + 0.4, 0.6, 1.1, sz - 0.4, sz + 0.4, "rock_dark")

    # rope fence: along the south shore, round the corner and up to the boardwalk's railing
    obj("Fence")
    pts = [(98 - 4 * k, -13.5) for k in range(13)] + [(47.5, -13.5)] + [(47.5, -13.5 - 4 * k) for k in range(1, 6)]
    for k, (fx, fz) in enumerate(pts):
        box(g, f"FencePost{k}", fx - 0.35, fx + 0.35, 0, 2.4, fz - 0.35, fz + 0.35, "wood_dark")
        if k:
            rope_between(g, f"Rope{k}", (pts[k - 1][0], 2.0, pts[k - 1][1]), (fx, 2.0, fz))
    rope_between(g, "RopeTie", (47.5, 2.0, -33.5), (46.4, 1.9, zs - 0.3))
    for i, (x, z) in enumerate([(101, -8), (103, -8), (102, -6), (56, -65), (57.9, -65.3)]):
        barrel(g, f"Barrel{i}", x, z)

    def palm_at(x, z, i):
        if not free(x, z, 0.9, 5.4):
            return False
        palm(g, f"Palm{i}", x, z, h=R.randint(6, 10))
        take("ground", x, z, 0.9)
        take("canopy", x, z, 5.4)
        return True

    trunks = groves(14, 400, (46, ISLAND_X - 6, CLIFF_FRONT + 4, ISLAND_Z - 6), (2, 3), 5.5, palm_at)
    foot_bushes(g, trunks, 6, (2, 3))


# ---------------------------------------------------------------- south: base camp


def banana_bunch(g, name, x, y, z, yaw=0):
    obj(name)
    for k in range(5):
        a = math.radians(yaw + k * 72)
        bx, bz = x + math.cos(a) * 0.45, z - math.sin(a) * 0.45
        brick(g, f"{name}B{k}", (0.5, 1.6, 0.5), (bx, y + 0.85, bz), "banana", rot=(0, yaw + k * 72, 14))
    brick(g, name + "Stem", (0.6, 0.5, 0.6), (x, y + 1.85, z), "banana_tip")


def tent(g, name, x, z, yaw):
    """A-frame tent: floor, two canvas panels meeting at a ridge pole, open ends."""
    obj(name)
    f = Frame((x, 0, z), yaw=yaw)
    f.add(g, name + "Floor", (6, 0.2, 7), (0, 0.1, 0), "canvas_dark")
    ang = math.degrees(math.atan2(3, 2.6))
    for s in (-1, 1):
        f.add(g, f"{name}Side{s}", (math.hypot(2.6, 3), 0.25, 7), (s * 1.3, 1.7, 0),
              "canvas" if s > 0 else "canvas_dark", lrot=(0, 0, -s * ang))
    f.add(g, name + "Ridge", (7.6, 0.35, 0.35), (0, 3.25, 0), "wood_dark", lrot=(0, 90, 0), studs=False,
          shape="Cylinder")
    take("ground", x, z, 4.7)


HELI_S = 1.35
WRECK = {"x": 26, "z": 58, "yaw": 100, "pitch": -8, "roll": 10}


def heli_parts(wrecked):
    """The chopper in its own frame (nose toward -Z), as (name, size, pos, color, rot, studs, kw).
    The cabin is hollow (floor, walls, roof, glass front, open right-hand door) so the squad can
    ride inside it in the intro. The wreck has snapped rotor stubs, a missing strut, the banana
    splat and engine flames; the flying one has a full rotor and a hidden splat."""
    S = HELI_S
    parts = []

    def P(name, size, lpos, color, lrot=(0, 0, 0), studs=True, **kw):
        parts.append((name, [v * S for v in size], [v * S for v in lpos], color, lrot, studs, kw))

    P("HeliBelly", (4.6, 1.0, 7.6), (0, 1.0, 0), "olive_dark")
    P("HeliRoof", (5, 0.4, 8), (0, 5.2, 0), "olive")
    P("HeliWallL", (0.25, 3.5, 8), (-2.375, 3.25, 0), "olive")
    P("HeliWallRF", (0.25, 3.5, 3.7), (2.375, 3.25, -2.15), "olive")
    P("HeliWallRB", (0.25, 3.5, 1.7), (2.375, 3.25, 3.15), "olive")
    P("HeliWallBack", (4.5, 3.5, 0.25), (0, 3.25, 3.875), "olive")
    P("HeliConsole", (4.5, 1.2, 0.25), (0, 2.1, -3.875), "olive_dark")
    P("HeliPillar", (0.3, 2.3, 0.25), (0, 3.85, -3.875), "metal_dark")
    for sx in (-1, 1):
        P(f"HeliPane{sx}", (2.1, 2.3, 0.15), (sx * 1.2, 3.85, -3.9), "glass", studs=False, transparency=0.35)
    P("HeliWindowL", (0.12, 1.2, 1.8), (-2.56, 3.8, -2.0), "glass", studs=False, transparency=0.3)
    P("HeliWindowR", (0.12, 1.2, 1.8), (2.56, 3.8, -2.2), "glass", studs=False, transparency=0.3)
    P("HeliStripe", (0.12, 0.5, 8), (-2.56, 2.2, 0), "white", studs=False)
    P("HeliNose", (4.2, 1.6, 2.4), (0, 1.5, -5.2), "olive")
    P("HeliBananaSplat", (1.2, 0.5, 0.12), (-1.2, 4.0, -4.035), "banana", lrot=(0, 0, 25), studs=False)
    # inside: pilot + co-pilot seats up front, a bench along the left wall
    for sx, side in ((-1, "L"), (1, "R")):
        P(f"HeliSeat{side}", (1.4, 0.9, 1.2), (sx * 1.1, 1.95, -2.6), "metal_dark")
        P(f"HeliSeatBack{side}", (1.4, 0.8, 0.25), (sx * 1.1, 2.8, -1.875), "metal")
    P("HeliBench", (1.0, 0.9, 4.0), (-1.75, 1.95, 1.6), "metal_dark")
    P("HeliHousing", (3.4, 1.2, 4.4), (0, 6.0, 0.8), "olive_dark")
    for sx in (-1, 1):
        P(f"HeliExhaust{sx}", (1.6, 0.7, 0.7), (sx * 1.0, 6.0, 3.8), "metal_dark", lrot=(0, 90, 0), studs=False,
          shape="Cylinder")
    P("HeliMast", (0.8, 0.6, 0.8), (0, 6.9, -0.6), "metal")
    P("HeliHub", (0.4, 1.2, 1.2), (0, 7.4, -0.6), "metal_dark", lrot=(0, 0, 90), studs=False, shape="Cylinder")
    P("HeliBoom1", (1.6, 1.6, 6), (0, 3.4, 7), "olive")
    P("HeliBoom2", (1.1, 1.1, 5.5), (0, 3.6, 12.75), "olive")
    P("HeliFin", (0.4, 3.2, 2.0), (0, 5.75, 14.5), "olive_dark")
    P("HeliTailRotor", (0.15, 2.8, 0.35), (0.375, 5.6, 15.0), "metal_dark", lrot=(35, 0, 0))
    for sx in (-1, 1):
        P(f"HeliStab{sx}", (1.6, 0.25, 1.0), (sx * 1.35, 3.6, 12.5), "olive_dark")
        P(f"HeliSkid{sx}", (0.4, 0.4, 8.4), (sx * 2.0, -0.6, 0), "metal")
        for sz in (-1, 1):
            if not (wrecked and (sx, sz) == (-1, -1)):  # front-left strut snapped off in the crash
                P(f"HeliStrut{sx}{sz}", (0.3, 0.9, 0.3), (sx * 2.0, 0.05, sz * 2.6), "metal")
    blades = ((30, 3.0, -8), (160, 2.0, -8)) if wrecked else ((0, 6.5, 0), (90, 6.5, 0), (180, 6.5, 0), (270, 6.5, 0))
    for i, (a, length, droop) in enumerate(blades):
        r = 0.6 + length / 2
        ca, sa = math.cos(math.radians(a)), math.sin(math.radians(a))
        P(f"{'HeliStub' if wrecked else 'HeliRotor'}{i}", (length, 0.2, 0.9 if not wrecked else 0.8),
          (ca * r, 7.4, -0.6 - sa * r), "metal_dark", lrot=(0, a, droop))
    if wrecked:
        P("HeliFlame0", (1.2, 1.4, 1.2), (-0.7, 7.3, 1.3), "torch_fire", studs=False, neon=True)
        P("HeliFlame1", (1.0, 1.0, 1.0), (0.8, 7.1, 2.2), "torch_fire", studs=False, neon=True)
    return parts


def helicopter_wreck(g, x, z):
    """The chopper from the intro: slid in nose-first, ploughed a trench, spilled the squad's cargo."""
    yaw, S = WRECK["yaw"], HELI_S
    f = Frame((x, 0, z), yaw=yaw, pitch=WRECK["pitch"], roll=WRECK["roll"])
    parts = heli_parts(True)
    low = 1e9
    for name, size, lpos, color, lrot, *_ in parts:
        Rl = matmul(f.R, rot_matrix(*lrot))
        for cx in (-1, 1):
            for cy in (-1, 1):
                for cz in (-1, 1):
                    c = matvec(Rl, [cx * size[0] / 2, cy * size[1] / 2, cz * size[2] / 2])
                    low = min(low, matvec(f.R, lpos)[1] + c[1])
    f.o[1] = -low - 0.5
    WRECK["y"] = f.o[1]
    obj("Helicopter")
    for name, size, lpos, color, lrot, studs, kw in parts:
        f.add(g, name, size, lpos, color, lrot=lrot, studs=studs, **kw)
        if name == "HeliFlame0":
            M.group(g).parts[-1]["extra"] = [{"name": "Fire", "className": "Fire",
                                              "properties": {"Size": 5, "Heat": 9}}]
        elif name == "HeliHousing":
            M.group(g).parts[-1]["extra"] = [{"name": "Smoke", "className": "Smoke", "properties": {
                "Color": [0.3, 0.3, 0.31], "Opacity": 0.3, "RiseVelocity": 5, "Size": 2.5}}]


    # the trench it ploughed: dark floor narrowing behind it, sand berms along both sides, a pile at the nose
    d = (math.sin(math.radians(yaw)), math.cos(math.radians(yaw)))          # tail direction (x, z)
    n = (d[1], -d[0])                                                       # across the trench
    at = lambda t, o=0.0: (x + d[0] * t + n[0] * o, z + d[1] * t + n[1] * o)
    obj("T:crash")
    t = -2.0
    for k, (L, w) in enumerate(((11, 5.6), (9, 4.2), (8, 3.0))):
        cx, cz = at(t + L / 2)
        brick(g, f"Trench{k}", (L, 0.12, w), (cx, 0.06, cz), "sand_dark", rot=(0, yaw - 90, 0))
        t += L
    t, k = 9.4, 0
    while t < 26:
        w = 5.6 if t < 9 else 4.2 if t < 18 else 3.0
        h = max(0.4, 1.0 - (t - 7) * 0.035)
        for side in (-1, 1):
            cx, cz = at(t, side * (w / 2 + 0.75))
            brick(g, f"Berm{k}_{side}", (2.6, h, 1.4), (cx, h / 2, cz), "sand" if k % 2 else "sand_dark",
                  rot=(0, yaw - 90, 0))
        t += 2.6
        k += 1
    for k, (tt, sz, h) in enumerate(((-10.2, (3.4, 7.4), 1.1), (-10.5, (2.6, 5.4), 0.9), (-10.7, (1.6, 3.2), 0.7))):
        cx, cz = at(tt)
        brick(g, f"NosePile{k}", (sz[0], h, sz[1]), (cx, sum((1.1, 0.9, 0.7)[:k]) + h / 2, cz), "sand" if k % 2 else "sand_dark",
              rot=(0, yaw - 90, 0))
    # snapped rotor blade stuck in the sand, another lying in the trench, a broken skid
    obj("HeliBladeStuck")
    cx, cz = at(14, -7.5)
    brick(g, "HeliBladeStuck", (0.9, 6.5, 0.22), (cx, 2.6, cz), "metal_dark", rot=(0, 30, 12))
    obj("HeliBladeLoose")
    cx, cz = at(20)
    brick(g, "HeliBladeLoose", (4.2, 0.2, 0.8), (cx, 0.22, cz), "metal_dark", rot=(0, yaw - 90 + 22, 0))
    obj("HeliSkidLoose")
    cx, cz = at(10.5, 0.6)
    brick(g, "HeliSkidLoose", (0.4, 0.4, 2.6), (cx, 0.32, cz), "metal", rot=(0, yaw + 30, 0))
    # the squad's cargo spilled out of the open door
    out = (f.R[0][0], f.R[2][0])
    door = f.at([2.6 * S, 1.6 * S, 1.0 * S])
    place = lambda o, a: (door[0] + out[0] * o + d[0] * a, door[2] + out[1] * o + d[1] * a)
    obj("CargoAmmo")
    cx, cz = place(2.8, 0.5)
    brick(g, "CargoAmmo", (1.8, 1.0, 1.2), (cx, 0.5, cz), "olive_dark", rot=(0, 20, 0))
    obj("CargoCrate")
    cx, cz = place(4.6, -1.5)
    brick(g, "CargoCrate", (2.0, 2.0, 2.0), (cx, 1.0, cz), "wood", rot=(0, 35, 0))
    obj("CargoOpen")
    cx, cz = place(6.4, 1.6)
    brick(g, "CargoOpen", (1.8, 1.4, 1.8), (cx, 0.7, cz), "wood_dark", rot=(0, -15, 0))
    cx, cz = place(6.6, 3.6)
    banana_bunch(g, "CargoBananas", cx, 0, cz, 40)
    obj("HeliDoorPanel")
    cx, cz = place(2.6, -4.8)
    brick(g, "HeliDoorPanel", (2.6, 0.2, 2.4), (cx, 0.1, cz), "olive", rot=(0, yaw + 15, 0))
    take("ground", x, z, 11)
    for tt in (10, 18, 24):
        take("ground", *at(tt), 4.5)
    take("ground", *place(4.6, 0), 5)
    take("canopy", *at(8), 10)
    # keep the intro clear: the chopper's last descent (rotor radius ~10) and the crash cameras
    for px, pz in ((52, 54), (58, 55.5), (64, 57), (70, 58), (76, 59), (82, 60)):
        take("canopy", px, pz, 11)
        take("ground", px, pz, 3)
    for px, pz in ((50, 34), (44, 36), (38, 38), (36, 40)):
        take("canopy", px, pz, 4)
        take("ground", px, pz, 2)


def build_base():
    g = "Map_Base"
    bx, _, bz = BASE_POS
    y0 = PLAZA_Y
    # the Banana Stash: crate pyramid with bananas piled on top and around it
    obj("Stash")
    for i, (dx, dy, dz) in enumerate([(-2.6, 0, -1.3), (0, 0, -1.3), (2.6, 0, -1.3), (-2.6, 0, 1.3), (0, 0, 1.3),
                                      (2.6, 0, 1.3), (-1.3, 2.5, 0), (1.3, 2.5, 0), (0, 5, 0)]):
        brick(g, f"StashCrate{i}", (2.5, 2.5, 2.5), (bx + dx, y0 + 1.25 + dy, bz + dz), "wood" if i % 2 else "wood_dark")
    banana_bunch(g, "StashTop", bx, y0 + 7.5, bz, 30)
    for i, (dx, dz) in enumerate(((-5, -2.4), (5, 2.2), (4.8, -2.6), (-4.6, 2.8), (0, -4.2))):
        banana_bunch(g, f"StashPile{i}", bx + dx, y0, bz + dz, i * 40)
    # sandbag ring: bags laid end to end, brick-bonded, skipped wherever a trail comes through
    obj("Sandbags")
    n = int(2 * math.pi * BASE_RING / 2.7)
    kept = []
    for row in range(3):
        for i in range(n):
            a = 2 * math.pi * (i + 0.5 * (row % 2)) / n
            x, z = bx + math.cos(a) * BASE_RING, bz - math.sin(a) * BASE_RING
            if path_dist(x, z) < PATH_WIDTH / 2 + 2.6:
                continue
            if row == 0:
                kept.append(i)
            brick(g, f"Sandbag{i}_{row}", (2.5, 0.9, 1.4), (x, 0.45 + row * 0.9, z),
                  "sandbag" if (i + row) % 2 else "sandbag_dark", rot=(0, math.degrees(a) + 90, 0))
    # gate posts with lanterns on both sides of every gap
    for i in range(n):
        for d in (1, -1):
            if i in kept and (i + d) % n not in kept:
                a = 2 * math.pi * (i + d * 0.62) / n
                x, z = bx + math.cos(a) * BASE_RING, bz - math.sin(a) * BASE_RING
                obj(f"GatePost{i}{d}")
                brick(g, f"GatePost{i}_{d}", (0.9, 4, 0.9), (x, 2, z), "wood_dark", rot=(0, math.degrees(a), 0))
                smooth(g, f"GateLantern{i}_{d}", (0.8, 0.8, 0.8), (x, 4.4, z), "lantern", neon=True)
    # flag with a banana emblem
    obj("Flag")
    fx, fz = bx + 8, bz + 8
    brick(g, "FlagPole", (0.5, 14, 0.5), (fx, y0 + 7, fz), "metal")
    fc = fz - 0.25 - 2.5
    smooth(g, "Flag", (0.15, 3, 5), (fx, y0 + 12.4, fc), "red", material="Fabric")
    for sx in (-1, 1):
        for k, (dz, dy, ang) in enumerate(((-0.9, 0.25, 30), (0, 0, 0), (0.9, 0.25, -30))):
            smooth(g, f"FlagBanana{sx}{k}", (0.06, 0.5, 1.0), (fx + sx * 0.105, y0 + 12.2 + dy, fc + dz), "banana",
                   rot=(ang, 0, 0))
    # campfire with a stone ring
    obj("Campfire")
    cx, cz = bx - 5, bz + 8
    for i, yaw in enumerate((0, 60, 120)):
        smooth(g, f"FireLog{i}", (2.6, 0.45, 0.45), (cx, y0 + 0.23 + i * 0.01, cz), "wood_dark", shape="Cylinder",
               rot=(0, yaw, 0))
    smooth(g, "Fire", (1.1, 1.5, 1.1), (cx, y0 + 1.1, cz), "torch_fire", neon=True, rot=(0, 45, 0))
    for i in range(7):
        a = i / 7 * math.tau
        brick(g, f"FireStone{i}", (0.8, 0.5, 0.8), (cx + math.cos(a) * 1.9, y0 + 0.25, cz + math.sin(a) * 1.9), "rock",
              rot=(0, math.degrees(a), 0))
    # supply crates
    for side, (sx, sz) in (("W", (-10, 47)), ("E", (10.5, 47))):
        obj(f"Crates{side}")
        brick(g, f"Crate{side}1", (2.2, 2.2, 2.2), (bx + sx, y0 + 1.1, bz + sz - 42 - 1.15), "wood")
        brick(g, f"Crate{side}2", (2.2, 2.2, 2.2), (bx + sx, y0 + 1.1, bz + sz - 42 + 1.15), "wood_dark")
        brick(g, f"Crate{side}3", (2.2, 2.2, 2.2), (bx + sx, y0 + 3.3, bz + sz - 42), "wood", rot=(0, 20, 0))
    # tents outside the ring, behind the camp
    tent(g, "TentA", -14, 67, 15)
    tent(g, "TentB", 3, 69, -12)
    # helipad + wreck
    obj("Helipad")
    box(g, "Helipad", -38, -22, 0, 0.4, 58, 74, "pad")
    box(g, "PadH0", -32.85, -31.95, 0.4, 0.5, 62.5, 69.5, "white", studs=False)
    box(g, "PadH1", -28.05, -27.15, 0.4, 0.5, 62.5, 69.5, "white", studs=False)
    box(g, "PadH2", -31.95, -28.05, 0.4, 0.5, 65.55, 66.45, "white", studs=False)
    for i, (px, pz) in enumerate(((-37, 59), (-23, 59), (-37, 73), (-23, 73))):
        smooth(g, f"PadLight{i}", (0.6, 0.3, 0.6), (px, 0.55, pz), "lantern", neon=True)
    take("ground", -30, 66, 11.5)
    take("canopy", -30, 66, 8)
    helicopter_wreck("Map_Wreck", WRECK["x"], WRECK["z"])
    # beach palms behind the base
    for i, (x, z) in enumerate([(-48, 80), (-22, 82), (16, 82), (44, 78), (64, 84), (-68, 84), (-6, 84)]):
        if free(x, z, 0.9, 5.4):
            palm(g, f"BeachPalm{i}", x, z)
            take("ground", x, z, 0.9)
            take("canopy", x, z, 5.4)


def build_decor():
    """Small details on the open sand: pebbles, grass tufts, flowers, a banana peel or two."""
    g = "Map_Base"

    def put(x, z, i):
        if not free(x, z, 1.4, path_margin=2):
            return False
        kind = R.random()
        obj(f"Decor{i}")
        if kind < 0.4:
            brick(g, f"Pebble{i}", (R.uniform(1, 1.8), 0.6, R.uniform(1, 1.6)), (x, 0.3, z), R.choice(["rock", "rock_light"]),
                  rot=(0, R.uniform(0, 90), 0))
        elif kind < 0.8:
            brick(g, f"Tuft{i}a", (1.6, 0.5, 1.6), (x, 0.25, z), "grass", rot=(0, R.uniform(0, 90), 0))
            brick(g, f"Tuft{i}b", (0.8, 0.5, 0.8), (x, 0.75, z), "grass_lime" if R.random() < 0.6 else "flower")
        else:
            for k, ang in enumerate((-35, 0, 35)):
                a = math.radians(ang)
                brick(g, f"Peel{i}_{k}", (0.4, 0.2, 1.0), (x + math.sin(a) * 0.55, 0.1, z - math.cos(a) * 0.55),
                      "banana", rot=(0, ang, 0))
        take("ground", x, z, 1.4)
        return True

    scatter(g, 22, 3000, (-56, 44, CLIFF_FRONT + 4, ISLAND_Z - 6), put)


# ---------------------------------------------------------------- overlap check


def corners_axes(p):
    Rm, (sx, sy, sz) = p["rot"], p["size"]
    axes = [[Rm[0][i], Rm[1][i], Rm[2][i]] for i in range(3)]
    return axes, (sx / 2, sy / 2, sz / 2)


def obb_overlap(p, q, tol):
    """Separating-axis test; tol shrinks both boxes so touching faces don't count."""
    A, ha = corners_axes(p)
    B, hb = corners_axes(q)
    ha = [max(0.0, h - tol) for h in ha]
    hb = [max(0.0, h - tol) for h in hb]
    t = [q["pos"][i] - p["pos"][i] for i in range(3)]
    dot = lambda u, v: u[0] * v[0] + u[1] * v[1] + u[2] * v[2]
    crossv = lambda u, v: [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
    tests = A + B + [crossv(a, b) for a in A for b in B]
    for L in tests:
        n = math.sqrt(dot(L, L))
        if n < 1e-6:
            continue
        L = [c / n for c in L]
        ra = sum(ha[i] * abs(dot(A[i], L)) for i in range(3))
        rb = sum(hb[i] * abs(dot(B[i], L)) for i in range(3))
        if abs(dot(t, L)) > ra + rb:
            return False
    return True


def aabb(p):
    A, h = corners_axes(p)
    ext = [sum(abs(A[i][k]) * h[i] for i in range(3)) for k in range(3)]
    return [p["pos"][k] - ext[k] for k in range(3)], [p["pos"][k] + ext[k] for k in range(3)]


def check_overlaps(parts):
    """Interpenetrating parts of different objects, and coplanar overlapping terrain tops (z-fighting)."""
    boxes = []
    for p in parts:
        lo, hi = aabb(p)
        boxes.append((lo, hi, p))
    cell = 8
    grid = {}
    for i, (lo, hi, p) in enumerate(boxes):
        for gx in range(int(lo[0] // cell), int(hi[0] // cell) + 1):
            for gz in range(int(lo[2] // cell), int(hi[2] // cell) + 1):
                grid.setdefault((gx, gz), []).append(i)
    bad, fights, seen = {}, [], set()
    for ids in grid.values():
        for a in range(len(ids)):
            for b in range(a + 1, len(ids)):
                i, j = ids[a], ids[b]
                if (i, j) in seen:
                    continue
                seen.add((i, j))
                (lo1, hi1, p), (lo2, hi2, q) = boxes[i], boxes[j]
                if any(lo1[k] > hi2[k] - 0.02 or lo2[k] > hi1[k] - 0.02 for k in range(3)):
                    continue
                op, oq = p.get("obj", "?"), q.get("obj", "?")
                terr_p, terr_q = op.startswith("T:"), oq.startswith("T:")
                if terr_p and terr_q:
                    # flat terrain pieces: only flag identical top heights that overlap in plan
                    if p["name"] in ("Water", "Shallows") or q["name"] in ("Water", "Shallows"):
                        continue
                    if abs(hi1[1] - hi2[1]) < 0.01 and obb_overlap(p, q, 0.05):
                        fights.append((p["name"], q["name"]))
                    continue
                if op == oq or terr_p or terr_q:
                    continue
                if obb_overlap(p, q, 0.03):
                    bad.setdefault(tuple(sorted((op, oq))), (p["name"], q["name"]))
    return bad, fights


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
        f"\tBaseRadius = {BASE_RING},",
        f"\tBuildArea = {{ Min = Vector3.new({-ISLAND_X + 4}, 0, {CLIFF_FRONT + 4}), Max = Vector3.new({ISLAND_X - 4}, 0, {ISLAND_Z - 6}) }},",
        "\tPaths = {",
    ]
    for name, pts in PATHS.items():
        lines.append(f"\t\t{name} = {{ " + ", ".join(lua_v3(p) for p in pts) + " },")
    lines += ["\t},", "\tPlayerSpawn = Vector3.new(0, 0, 70),", "}", ""]
    with open(os.path.join(SHARED_DIR, "MapData.luau"), "w") as f:
        f.write("\n".join(lines))


def write_heli_assets():
    """The intact chopper for the intro (ReplicatedStorage.Assets.HeliFlying) plus the data the
    intro needs to land it exactly on the wreck (tools/cutscene/heli.json)."""
    b = Builder("HeliFlying")
    b.add("HeliRoot", (0.4, 0.4, 0.4), (0, 0, 0), (1, 1, 1), transparency=1)
    for name, size, lpos, color, lrot, studs, kw in heli_parts(False):
        b.add(name, size, lpos, color, look=STUDS if studs else "smooth", rot=lrot, **kw)
    parts = b.placed()
    os.makedirs(ASSET_DIR, exist_ok=True)
    with open(os.path.join(ASSET_DIR, "HeliFlying.model.json"), "w") as f:
        json.dump(to_rojo(parts), f)
    S = HELI_S
    data = {
        "scale": S,
        "hub": [0, 7.4 * S, -0.6 * S],
        "tailHub": [0.375 * S, 5.6 * S, 15.0 * S],
        "wreck": {"pos": [WRECK["x"], round(WRECK["y"], 4), WRECK["z"]], "yaw": WRECK["yaw"],
                  "pitch": WRECK["pitch"], "roll": WRECK["roll"]},
        "parts": parts,
    }
    os.makedirs(CUTSCENE_DIR, exist_ok=True)
    with open(os.path.join(CUTSCENE_DIR, "heli.json"), "w") as f:
        json.dump(data, f)


def main():
    build_ground()
    build_paths()
    build_north()
    build_base()       # base first so its props reserve their footprints
    build_east()
    build_west()
    # (no scattered decor: the reference keeps the open sand clean for placing men)
    all_parts = [p for b in M.groups.values() for p in b.parts]
    bad, fights = check_overlaps(all_parts)
    for (a, b), (pa, pb) in sorted(bad.items()):
        print(f"OVERLAP {a} x {b}: {pa} / {pb}")
    for pa, pb in fights[:40]:
        print(f"Z-FIGHT {pa} / {pb}")
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
    print("total parts:", total, "| overlaps:", len(bad), "| z-fights:", len(fights))
    with open(os.path.join(PREVIEW_DIR, "scene.json"), "w") as f:
        json.dump(preview, f)
    write_map_data()
    write_heli_assets()
    if bad or fights:
        sys.exit(1)


if __name__ == "__main__":
    main()
