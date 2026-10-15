"""Builds the army (men_defs.py) as jointed toy figures with Blender (bpy).

Same construction as the approved monkeys (build_enemies.py): soft-edged blocks with a printed
face and shirt, plus chunky hats/hair, and weapons put together from studded bricks. Every
variant is 11 parts named like R15 (LowerTorso, UpperTorso, Head, Right/LeftUpperArm,
Right/LeftLowerArm, Right/LeftUpperLeg, Right/LeftLowerLeg) so the combat animations drive them
through Motor6Ds of the same names. Held weapons are baked into the lower arm they're held in.

Run (textures first):
  python3 tools/blender/men_textures.py
  python tools/blender/build_men.py            (needs `pip install bpy`)
Out:
  assets/men/Men.fbx   -> Studio: File > Import 3D. MeshParts named <Unit>_L<n>_<Part>.
  assets/men/Men.glb   -> tools/preview
  src/shared/RigData/Men.luau
Modelled in studs, Blender Z-up, facing -Y.
"""

import math
import os
import sys

import bpy
from mathutils import Euler, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from men_defs import MAN_BODY, UNITS, colors, swatch_uv, variants  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "assets", "men")
RIG_OUT = os.path.join(ROOT, "src", "shared", "RigData")

TILES = {"face": (0.0, 0.5, 0.5, 1.0), "chest": (0.5, 0.5, 1.0, 1.0), "back": (0.5, 0.0, 1.0, 0.5)}
PAD = 0.004
GAP = 5.0
U = 0.3          # brick unit for weapons
STUD_R = 0.1
STUD_H = 0.07

# ---------------------------------------------------------------- helpers


class Ctx:
    unit = "Brawler"
    level = 1


def select_only(o):
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o


def bake(o):
    select_only(o)
    for m in list(o.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    o.select_set(False)


def fresh_uv(me):
    while me.uv_layers:
        me.uv_layers.remove(me.uv_layers[0])
    return me.uv_layers.new(name="UVMap")


def tile_uv(u, v, tile):
    u0, v0, u1, v1 = TILES[tile]
    u, v = min(max(u, 0.0), 1.0), min(max(v, 0.0), 1.0)
    return (u0 + PAD + u * (u1 - u0 - 2 * PAD), v0 + PAD + v * (v1 - v0 - 2 * PAD))


def paint(o, swatch, smooth=True):
    uv = fresh_uv(o.data)
    u, v = swatch_uv(Ctx.unit, Ctx.level, swatch)
    for poly in o.data.polygons:
        for li in poly.loop_indices:
            uv.data[li].uv = (u, v)
        poly.use_smooth = smooth
    return o


def soft_box(name, size, center, radius, swatch, front=None, back=None, rot=None, segs=4):
    """Box with soft rounded edges; front (-Y) / back (+Y) faces can carry a printed tile."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    if rot:
        o.rotation_euler = rot
    bake(o)
    m = o.modifiers.new("Bevel", "BEVEL")
    m.width, m.segments, m.limit_method = min(radius, min(size) * 0.45), segs, "NONE"
    bake(o)
    uv = fresh_uv(o.data)
    cx, _, cz = center
    w, _, h = size
    su, sv = swatch_uv(Ctx.unit, Ctx.level, swatch)
    for poly in o.data.polygons:
        tile = front if (front and poly.normal.y < -0.55) else back if (back and poly.normal.y > 0.55) else None
        for li in poly.loop_indices:
            co = o.data.vertices[o.data.loops[li].vertex_index].co
            if tile and tile == front:
                uv.data[li].uv = tile_uv((co.x - cx) / w + 0.5, (co.z - cz) / h + 0.5, tile)
            elif tile:
                uv.data[li].uv = tile_uv(0.5 - (co.x - cx) / w, (co.z - cz) / h + 0.5, tile)
            else:
                uv.data[li].uv = (su, sv)
        poly.use_smooth = True
    return o


def cylinder(name, r, depth, loc, swatch, rot=(0, 0, 0), verts=24, bevel=0.03, r2=None):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=depth, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    bake(o)
    if bevel:
        m = o.modifiers.new("Bevel", "BEVEL")
        m.width, m.segments, m.limit_method = bevel, 2, "NONE"
        bake(o)
    return paint(o, swatch)


def ball(name, r, loc, swatch, scale=(1, 1, 1), segs=16):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=segs, ring_count=segs // 2)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    bake(o)
    return paint(o, swatch)


def tube(name, pts, radius, swatch):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = radius
    cu.bevel_resolution = 3
    cu.use_fill_caps = True
    sp = cu.splines.new("BEZIER")
    sp.bezier_points.add(len(pts) - 1)
    for bp, p in zip(sp.bezier_points, pts):
        bp.co = p
        bp.handle_left_type = bp.handle_right_type = "AUTO"
    o = bpy.data.objects.new(name, cu)
    bpy.context.collection.objects.link(o)
    select_only(o)
    bpy.ops.object.convert(target="MESH")
    return paint(bpy.context.active_object, swatch)


def brick(name, size, center, swatch, studs=True, radius=0.04):
    """A studded toy brick: soft box + a grid of studs on top (one per brick unit)."""
    out = [soft_box(name, size, center, radius, swatch, segs=2)]
    if studs:
        nx, ny = max(1, round(size[0] / U)), max(1, round(size[1] / U))
        for i in range(nx):
            for j in range(ny):
                x = center[0] - size[0] / 2 + (i + 0.5) * size[0] / nx
                y = center[1] - size[1] / 2 + (j + 0.5) * size[1] / ny
                out.append(cylinder(f"{name}Stud", STUD_R, STUD_H, (x, y, center[2] + size[2] / 2 + STUD_H / 2), swatch,
                                    verts=12, bevel=0.015))
    return out


def turn(objs, rot_deg):
    """Turns item parts authored around the origin (the grip) by rot_deg (XYZ, degrees)."""
    m = Euler([math.radians(a) for a in rot_deg], "XYZ").to_matrix().to_4x4()
    for o in objs:
        o.data.transform(m)
    return objs


def join(name, objs, pivot):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = o.data.name = name
    bpy.context.scene.cursor.location = pivot
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    o.select_set(False)
    return o

# ---------------------------------------------------------------- weapons (authored at the origin = grip)
# Long items are authored "upright" (+Z up, or pointing -Y) and turned so they hang along the
# forearm at rest; raised into a stance they point where the old gear did (see MenFactory HOLD).


def w_slingshot():
    s = []
    s += brick("SlHandle", (U, U, 3 * U), (0, 0, 0.1), "gear")
    s += brick("SlFork", (5 * U, U, U), (0, 0, 0.1 + 2 * U), "gear")
    for sx in (-1, 1):
        s += brick(f"SlProng{sx}", (U, U, 2 * U), (sx * 2 * U, 0, 0.1 + 3.5 * U), "gear")
    s.append(tube("SlBand", [(-2 * U, 0, 0.1 + 4 * U), (0, 0.35, 0.1 + 3.6 * U), (2 * U, 0, 0.1 + 4 * U)], 0.04, "band"))
    return turn(s, (90, 0, 0))   # fork points forward at rest, up when aimed


def w_axe():
    s = []
    for k in range(5):  # stacked handle bricks
        s += brick(f"AxHandle{k}", (U, U, 1.25 * U), (0, 0, -0.15 + k * 1.25 * U), "handle", studs=(k == 4))
    top = -0.15 + 4.5 * 1.25 * U
    s += brick("AxHead", (U * 1.6, 3 * U, 3 * U), (0, -0.25, top), "gear")
    s.append(soft_box("AxEdge", (U * 0.7, U * 1.2, 3.6 * U), (0, -0.25 - 1.9 * U, top), 0.05, "gear_metal", segs=2))
    return turn(s, (180, 0, 0))   # head hangs at the bottom, edge facing back at rest


def w_rifle():
    s = []
    s += brick("RfStock", (1.6 * U, 3.5 * U, 2 * U), (0, 0.6, -0.1), "handle")
    s += brick("RfBody", (1.6 * U, 2.5 * U, 1.6 * U), (0, -0.25, 0.05), "gear")
    for k in range(3):
        s += brick(f"RfBarrel{k}", (U, 1.2 * U, U), (0, -0.85 - k * 1.2 * U, 0.15), "gear")
    s.append(cylinder("RfScope", 0.13, 0.9, (0, -0.5, 0.48), "scope", rot=(math.pi / 2, 0, 0), verts=16))
    s.append(cylinder("RfLens", 0.1, 0.05, (0, -0.96, 0.48), "white", rot=(math.pi / 2, 0, 0), verts=16, bevel=0))
    return turn(s, (90, 0, 0))    # barrel down at rest, forward when aimed


def w_medkit():
    s = brick("MkBox", (4 * U, 2 * U, 3 * U), (0, 0, -0.75), "gear")
    s += brick("MkHandle", (2 * U, U * 0.6, U * 0.6), (0, 0, -0.2), "ink", studs=False)
    for sx in (-1, 1):
        s.append(soft_box(f"MkCrossV{sx}", (0.06, 0.18, 0.55), (sx * 2 * U + sx * 0.02, 0, -0.75), 0.02, "cross", segs=1))
        s.append(soft_box(f"MkCrossH{sx}", (0.06, 0.5, 0.18), (sx * 2 * U + sx * 0.02, 0, -0.75), 0.02, "cross", segs=1))
    return turn(s, (0, 0, 0))


def w_big_banana():
    s = []
    n = 7
    for k in range(n):  # a chain of studded yellow bricks along a curve (like the reference banana)
        a = (k / (n - 1) - 0.5) * 1.3
        x, z = math.sin(a) * 1.4, 0.2 + (k / (n - 1)) * 2.2 - (1 - math.cos(a)) * 0.6
        s += brick(f"BnSeg{k}", (2 * U, 2 * U, 1.4 * U), (x * 0.45, 0, z), "gear")
    s.append(soft_box("BnTip", (U, U, U * 1.2), (math.sin(0.65) * 1.4 * 0.45, 0, 2.6), 0.05, "tip", segs=2))
    s.append(soft_box("BnStem", (U, U, U), (math.sin(-0.65) * 1.4 * 0.45, 0, -0.05), 0.05, "tip", segs=2))
    return turn(s, (90, 0, 0))


def w_grenade():
    s = [soft_box("GrBody", (0.62, 0.62, 0.72), (0, 0, -0.45), 0.24, "gear", segs=4)]
    for k in range(3):
        s.append(soft_box(f"GrRib{k}", (0.68, 0.68, 0.06), (0, 0, -0.62 + k * 0.17), 0.03, "gear", segs=1))
    s += brick("GrCap", (U, U, U * 0.8), (0, 0, -0.02), "pin")
    s.append(tube("GrPin", [(0.12, 0, 0.0), (0.3, 0, 0.1), (0.25, 0, 0.25)], 0.03, "pin"))
    return turn(s, (0, 0, 0))


def w_net_gun():
    s = []
    s += brick("NgGrip", (1.4 * U, 1.6 * U, 2.4 * U), (0, 0.15, -0.15), "gear")
    s += brick("NgBody", (2 * U, 4 * U, 2 * U), (0, -0.55, 0.15), "gear")
    s += brick("NgMuzzle", (3.6 * U, 2 * U, 3.6 * U), (0, -1.45, 0.15), "muzzle")
    s.append(ball("NgNet", 0.36, (0, -1.8, 0.15), "net", scale=(1, 0.6, 1)))
    return turn(s, (90, 0, 0))


def w_megaphone():
    s = []
    s += brick("MgHandle", (U, 1.4 * U, 2 * U), (0, 0.05, -0.1), "gear")
    s.append(cylinder("MgCone", 0.2, 1.3, (0, -0.75, 0.3), "gear", rot=(math.pi / 2, 0, 0), verts=24, r2=0.58))
    s.append(cylinder("MgMouth", 0.17, 0.25, (0, 0.05, 0.3), "mouth", rot=(math.pi / 2, 0, 0), verts=16))
    s.append(cylinder("MgRim", 0.6, 0.08, (0, -1.4, 0.3), "white", rot=(math.pi / 2, 0, 0), verts=24, bevel=0.02))
    return turn(s, (90, 0, 0))


WEAPONS = {"slingshot": (w_slingshot, "Left"), "axe": (w_axe, "Right"), "rifle": (w_rifle, "Right"),
           "medkit": (w_medkit, "Right"), "big_banana": (w_big_banana, "Right"), "grenade": (w_grenade, "Right"),
           "net_gun": (w_net_gun, "Right"), "megaphone": (w_megaphone, "Right")}

# ---------------------------------------------------------------- heads


def head_pieces(u, hc):
    """Hats, hair and face geometry for a head centred at hc."""
    hw, hd, hh = MAN_BODY["head"]
    x, y, z = hc
    top = z + hh / 2
    front = y - hd / 2
    out = []
    hat = u["hat"]
    if hat in ("headband", "cap_back", "medic_cap", "officer", "safari", "ranger"):
        out.append(soft_box("HairCap", (hw + 0.06, hd + 0.06, 0.32), (x, y, top - 0.12), 0.14, "hair"))
        out.append(soft_box("HairBack", (hw + 0.06, 0.2, hh * 0.7), (x, y + hd / 2 - 0.06, top - hh * 0.35), 0.08, "hair"))
    if hat == "headband":
        for k, (dx, dy, tilt) in enumerate(((-0.6, 0.0, -20), (0.0, -0.15, 5), (0.55, 0.1, 22), (-0.15, 0.45, -8))):
            out.append(soft_box(f"Spike{k}", (0.62, 0.62, 0.62), (x + dx, y + dy, top + 0.14), 0.12, "hair",
                                rot=(math.radians(tilt), math.radians(tilt * 1.4), math.radians(45))))
        out.append(soft_box("Band", (hw + 0.1, hd + 0.1, 0.28), (x, y, top - 0.42), 0.1, "hat"))
        for s in (-1, 1):
            out.append(soft_box(f"BandTail{s}", (0.18, 0.08, 0.75), (x + s * 0.2, y + hd / 2 + 0.14, top - 0.78), 0.04,
                                "hat", rot=(math.radians(-28), 0, math.radians(s * 20))))
    elif hat == "cap_back":
        out.append(soft_box("Cap", (hw + 0.12, hd + 0.12, 0.62), (x, y, top + 0.12), 0.26, "hat"))
        out.append(soft_box("CapBrim", (1.5, 0.95, 0.12), (x, y + hd / 2 + 0.38, top - 0.12), 0.05, "hat"))
        out.append(ball("CapButton", 0.13, (x, y, top + 0.45), "hat", segs=12))
    elif hat == "beanie":
        out.append(soft_box("Beanie", (hw + 0.14, hd + 0.14, 0.8), (x, y, top + 0.12), 0.3, "hat"))
        out.append(soft_box("BeanieCuff", (hw + 0.2, hd + 0.2, 0.3), (x, y, top - 0.2), 0.12, "hat"))
        out.append(ball("Pompom", 0.3, (x, y, top + 0.62), "hat", segs=14))
    elif hat == "safari":
        out.append(soft_box("SafariBrim", (hw + 0.9, hd + 0.85, 0.12), (x, y, top + 0.02), 0.06, "hat"))
        out.append(soft_box("SafariCrown", (hw - 0.15, hd - 0.1, 0.68), (x, y, top + 0.4), 0.26, "hat"))
        out.append(soft_box("SafariBand", (hw - 0.1, hd - 0.05, 0.16), (x, y, top + 0.16), 0.06, "belt"))
    elif hat == "medic_cap":
        out.append(soft_box("MedCap", (hw + 0.1, hd + 0.1, 0.5), (x, y, top + 0.06), 0.2, "hat"))
        out.append(soft_box("MedBrim", (1.5, 0.6, 0.1), (x, front - 0.22, top - 0.14), 0.04, "hat"))
        out.append(soft_box("MedCrossV", (0.16, 0.06, 0.4), (x, front - 0.05, top + 0.06), 0.02, "cross", segs=1)
                   if "cross" in colors(Ctx.unit, Ctx.level) else None)
        out.append(soft_box("MedCrossH", (0.4, 0.06, 0.14), (x, front - 0.05, top + 0.06), 0.02, "cross", segs=1)
                   if "cross" in colors(Ctx.unit, Ctx.level) else None)
    elif hat == "banana_hood":
        out.append(soft_box("HoodBack", (hw + 0.5, 0.45, hh + 0.4), (x, y + hd / 2 + 0.1, z + 0.1), 0.2, "hat"))
        for s in (-1, 1):
            out.append(soft_box(f"HoodSide{s}", (0.32, hd + 0.3, hh + 0.4), (x + s * (hw / 2 + 0.1), y + 0.05, z + 0.1),
                                0.14, "hat"))
        out.append(soft_box("HoodTop", (hw + 0.5, hd + 0.4, 0.4), (x, y + 0.05, top + 0.15), 0.18, "hat"))
        out.append(tube("HoodTip", [(x, y + 0.2, top + 0.3), (x + 0.15, y + 0.1, top + 0.95), (x + 0.6, y, top + 1.4)], 0.3,
                        "hat"))
        out.append(ball("HoodStem", 0.18, (x + 0.65, y, top + 1.5), "tip", segs=12))
    elif hat == "helmet":
        out.append(soft_box("Helmet", (hw + 0.22, hd + 0.22, 0.85), (x, y, top + 0.12), 0.38, "hat"))
        out.append(soft_box("HelmetRim", (hw + 0.42, hd + 0.42, 0.14), (x, y, top - 0.22), 0.07, "hat"))
        out.append(soft_box("GoggleStrap", (hw + 0.26, 0.1, 0.16), (x, front - 0.1, top + 0.08), 0.04, "belt"))
        for s in (-1, 1):
            out.append(cylinder(f"Goggle{s}", 0.2, 0.16, (x + s * 0.35, front - 0.16, top + 0.12), "ink",
                                rot=(math.pi / 2, 0, 0), verts=16))
            out.append(cylinder(f"GoggleLens{s}", 0.14, 0.04, (x + s * 0.35, front - 0.25, top + 0.12), "steel",
                                rot=(math.pi / 2, 0, 0), verts=16, bevel=0))
    elif hat == "ranger":
        out.append(soft_box("RangerBrim", (hw + 0.75, hd + 0.7, 0.12), (x, y, top + 0.02), 0.06, "hat"))
        out.append(soft_box("RangerCrown", (hw - 0.25, hd - 0.2, 0.6), (x, y, top + 0.36), 0.22, "hat"))
        out.append(soft_box("RangerDent", (0.25, 1.2, 0.1), (x, y, top + 0.66), 0.04, "hat"))
        out.append(soft_box("RangerBand", (hw - 0.2, hd - 0.15, 0.14), (x, y, top + 0.14), 0.05, "belt"))
    elif hat == "officer":
        out.append(soft_box("OffBand", (hw + 0.08, hd + 0.08, 0.3), (x, y, top + 0.04), 0.1, "ink"))
        out.append(soft_box("OffCrown", (hw + 0.4, hd + 0.4, 0.42), (x, y + 0.05, top + 0.38), 0.18, "hat"))
        out.append(soft_box("OffVisor", (1.7, 0.7, 0.1), (x, front - 0.25, top - 0.06), 0.04, "ink",
                            rot=(math.radians(-14), 0, 0)))
        out.append(soft_box("OffBadge", (0.42, 0.08, 0.36), (x, front - 0.2, top + 0.36), 0.05, "gold", segs=2))
    elif hat == "pilot":
        out.append(soft_box("PilotHelmet", (hw + 0.2, hd + 0.2, 0.75), (x, y, top + 0.1), 0.34, "hat"))
        for s in (-1, 1):
            out.append(cylinder(f"EarCup{s}", 0.38, 0.28, (x + s * (hw / 2 + 0.12), y + 0.05, z + 0.05), "mic",
                                rot=(0, math.pi / 2, 0), verts=20))
        out.append(tube("MicBoom", [(x + hw / 2 + 0.15, y - 0.1, z - 0.05), (x + 0.75, front - 0.25, z - 0.35),
                                    (x + 0.3, front - 0.12, z - 0.45)], 0.05, "mic"))
        out.append(ball("Mic", 0.1, (x + 0.28, front - 0.12, z - 0.46), "mic", segs=10))
    if u.get("beard"):
        out.append(soft_box("Beard", (hw - 0.25, 0.4, 0.95), (x, front - 0.08, z - hh / 2 + 0.2), 0.18, "hair"))
    if u.get("mustache"):
        for s in (-1, 1):
            out.append(soft_box(f"Stache{s}", (0.6, 0.16, 0.24), (x + s * 0.28, front - 0.06, z - 0.36), 0.08, "hair",
                                rot=(0, math.radians(s * -14), 0)))
    # little ears (hidden under hoods)
    if hat not in ("banana_hood",):
        for s in (-1, 1):
            out.append(cylinder(f"Ear{s}", 0.2, 0.14, (x + s * (hw / 2 + 0.05), y + 0.1, z + 0.02), "skin",
                                rot=(0, math.pi / 2, 0), verts=20, bevel=0.05))
    return [o for o in out if o is not None]

# ---------------------------------------------------------------- one variant


def build_variant(vname, unit, level, ox):
    Ctx.unit, Ctx.level = unit, level
    u = UNITS[unit]
    b = MAN_BODY
    rad = b["radius"]
    c = colors(unit, level)
    parts, pivots, grips = {}, {}, {}
    hipw, hipd, hiph = b["hips"]
    cw, cd, ch = b["chest"]
    ulw, uld, ulh = b["upper_leg"]
    llw, lld, llh = b["lower_leg"]
    uaw, uad, uah = b["upper_arm"]
    law, lad, lah = b["lower_arm"]
    knee, hip = llh, llh + ulh
    waist = hip + hiph
    neck = waist + ch
    shoulder_z = neck - 0.25

    # legs: boots + pants (or shorts over bare shins)
    for side, sx in (("Left", -1), ("Right", 1)):
        x = ox + sx * hipw / 4
        lower_sw = "skin" if u["legs"] == "shorts" else "pants"
        boot = soft_box("Boot", (llw + 0.06, lld + 0.18, b["boot"]), (x, -0.08, b["boot"] / 2), rad, "boot")
        shin = soft_box("Shin", (llw, lld, llh - b["boot"] + 0.06), (x, 0, b["boot"] + (llh - b["boot"]) / 2), rad, lower_sw)
        pivots[side + "LowerLeg"] = (x, 0, knee)
        parts[side + "LowerLeg"] = join(f"{vname}_{side}LowerLeg", [boot, shin], pivots[side + "LowerLeg"])
        thigh = soft_box("Thigh", (ulw, uld, ulh + 0.06), (x, 0, knee + ulh / 2), rad, "pants")
        pivots[side + "UpperLeg"] = (x, 0, hip)
        parts[side + "UpperLeg"] = join(f"{vname}_{side}UpperLeg", [thigh], pivots[side + "UpperLeg"])

    # hips: pants + belt + buckle
    hips = soft_box("Hips", (hipw, hipd, hiph + 0.04), (ox, 0, hip + hiph / 2), rad, "pants")
    belt = soft_box("Belt", (hipw + 0.06, hipd + 0.06, 0.2), (ox, 0, waist - 0.12), 0.06, "belt")
    buckle = soft_box("Buckle", (0.38, 0.08, 0.26), (ox, -hipd / 2 - 0.04, waist - 0.12), 0.04, "gold" if level == 3 else "steel",
                      segs=2)
    pivots["LowerTorso"] = (ox, 0, hip + hiph / 2)
    parts["LowerTorso"] = join(f"{vname}_LowerTorso", [hips, belt, buckle], pivots["LowerTorso"])

    # chest with the printed shirt
    chest = soft_box("Chest", (cw, cd, ch), (ox, 0, waist + ch / 2), rad + 0.04, "shirt", front="chest", back="back")
    extras = []
    if u["print"] == "uniform":  # gold epaulettes
        for s in (-1, 1):
            extras.append(soft_box(f"Epaulette{s}", (0.7, 1.0, 0.16), (ox + s * (cw / 2 - 0.2), 0, neck + 0.02), 0.06, "gold"))
    pivots["UpperTorso"] = (ox, 0, waist)
    parts["UpperTorso"] = join(f"{vname}_UpperTorso", [chest] + extras, pivots["UpperTorso"])

    # arms: sleeves, forearms, hands (or gloves); the weapon joins the hand that holds it
    weapon = WEAPONS.get(u["weapon"]) if u["weapon"] else None
    for side, sx in (("Left", -1), ("Right", 1)):
        x = ox + sx * (cw / 2 + uaw / 2)
        elbow = shoulder_z - uah + 0.25
        upper_sw = "skin" if u["sleeves"] == "skin" else "shirt"
        sleeve = soft_box("UpperArm", (uaw, uad, uah), (x, 0, shoulder_z + 0.25 - uah / 2), rad, upper_sw)
        pivots[side + "UpperArm"] = (x, 0, shoulder_z)
        parts[side + "UpperArm"] = join(f"{vname}_{side}UpperArm", [sleeve], pivots[side + "UpperArm"])
        fore_sw = "shirt" if u["sleeves"] == "long" else "skin"
        hand_bottom = elbow - lah
        fore = soft_box("Forearm", (law, lad, lah - b["hand"] + 0.06), (x, 0, elbow - (lah - b["hand"]) / 2), rad, fore_sw)
        objs = [fore]
        if u["hands"] == "glove":
            gsw = "glove" if "glove" in c else "gear"
            objs.append(soft_box("Glove", (law + 0.3, lad + 0.38, b["hand"] + 0.3), (x, -0.06, hand_bottom + b["hand"] / 2 - 0.08),
                                 0.3, gsw))
            if "glove_cuff" in c:
                objs.append(soft_box("Cuff", (law + 0.12, lad + 0.12, 0.2), (x, 0, hand_bottom + b["hand"] + 0.06), 0.06, "glove_cuff"))
        else:
            objs.append(soft_box("Hand", (law, lad, b["hand"]), (x, 0, hand_bottom + b["hand"] / 2), rad, "skin"))
        grip = (x, 0, hand_bottom + 0.12)
        grips[side] = grip
        if weapon and weapon[1] == side:
            for o in weapon[0]():
                o.location = grip
                bake(o)
                objs.append(o)
        pivots[side + "LowerArm"] = (x, 0, elbow)
        parts[side + "LowerArm"] = join(f"{vname}_{side}LowerArm", objs, pivots[side + "LowerArm"])

    # head
    hw, hd, hh = b["head"]
    hc = (ox, 0, neck + hh / 2)
    head = soft_box("HeadMesh", (hw, hd, hh), hc, b["head_radius"], "skin", front="face")
    pivots["Head"] = (ox, 0, neck)
    parts["Head"] = join(f"{vname}_Head", [head] + head_pieces(u, hc), pivots["Head"])
    return parts, pivots, grips


def material(vname):
    mat = bpy.data.materials.new(vname)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(os.path.join(OUT, f"{vname}.png"))
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.5
    return mat


def to_roblox(v):
    """Blender (X right, Y back, Z up; model faces -Y) -> Roblox (X right, Y up, -Z forward)."""
    return (v[0], v[2], v[1])


def main():
    only = [a for a in sys.argv[sys.argv.index("--") + 1:]] if "--" in sys.argv else []
    bpy.ops.wm.read_factory_settings(use_empty=True)
    os.makedirs(RIG_OUT, exist_ok=True)
    lines = ["-- Generated by tools/blender/build_men.py. Do not edit by hand.",
             "-- Rest-pose layout of each imported army mesh, in studs, relative to its feet (Roblox axes).",
             "return {"]
    ox = 0.0
    built = []
    for vname, unit, level in variants():
        if only and unit not in only:
            continue
        ox += 2.5
        parts, pivots, grips = build_variant(vname, unit, level, ox)
        mat = material(vname)
        for o in parts.values():
            o.data.materials.clear()
            o.data.materials.append(mat)
        corners = [o.matrix_world @ Vector(cn) for o in parts.values() for cn in o.bound_box]
        origin = Vector((ox, 0, 0))
        lines.append(f"\t{vname} = {{")
        lines.append("\t\tHeight = %.3f," % max(cn.z for cn in corners))
        lines.append("\t\tParts = {")
        for pname, o in parts.items():
            cs = [o.matrix_world @ Vector(cn) for cn in o.bound_box]
            mn = Vector((min(cn[i] for cn in cs) for i in range(3))) - origin
            mx = Vector((max(cn[i] for cn in cs) for i in range(3))) - origin
            size = mx - mn
            pv = Vector(pivots[pname]) - origin
            lines.append("\t\t\t%s = { Size = Vector3.new(%.3f, %.3f, %.3f), Center = Vector3.new(%.3f, %.3f, %.3f), "
                         "Pivot = Vector3.new(%.3f, %.3f, %.3f) }," % (pname, size.x, size.z, size.y,
                                                                      *to_roblox((mn + mx) / 2), *to_roblox(pv)))
        lines.append("\t\t},")
        for side, g in grips.items():
            gv = Vector(g) - origin
            lines.append("\t\t%sGrip = Vector3.new(%.3f, %.3f, %.3f)," % (side, *to_roblox(gv)))
        lines.append("\t},")
        tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in parts.values())
        print(vname, "tris:", tris)
        built.append(vname)
        ox += GAP
    lines += ["}", ""]
    if not only:
        with open(os.path.join(RIG_OUT, "Men.luau"), "w") as f:
            f.write("\n".join(lines))
    # marker in front of the first variant's feet: tells the game how the importer turned things
    Ctx.unit, Ctx.level = variants()[0][1], variants()[0][2]
    bpy.ops.mesh.primitive_cube_add(size=0.05, location=(2.5, -1.0, 0.05))
    marker = bpy.context.active_object
    marker.name = marker.data.name = "MenFrontMarker"
    paint(marker, "skin")
    marker.data.materials.append(bpy.data.materials[built[0]])
    bpy.ops.object.select_all(action="SELECT")
    name = "Men" if not only else "MenTest"
    bpy.ops.export_scene.fbx(filepath=os.path.join(OUT, f"{name}.fbx"), use_selection=True, object_types={"MESH"},
                             apply_unit_scale=True, apply_scale_options="FBX_SCALE_ALL", path_mode="COPY",
                             embed_textures=True, mesh_smooth_type="FACE")
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, f"{name}.glb"), export_format="GLB", use_selection=True)
    print("exported", name, len(built), "variants")


main()
