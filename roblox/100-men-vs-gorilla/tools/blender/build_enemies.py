"""Builds every enemy variant (enemy_defs.py) as meshes with Blender (bpy).

Same construction as the approved Monkey: soft-edged toy blocks, printed face/belly, cream
hand and foot caps, forward-facing disc ears. Gorillas use broad bodies, long knuckle-walker
arms and short legs. Extras (helmets, bananas, crowns...) are baked into the body part they
ride on, so they move with it.

Run (textures first, they need Pillow):
  python3 tools/blender/enemy_textures.py
  python tools/blender/build_enemies.py        (needs `pip install bpy`)
Out:
  assets/enemies/Enemies.fbx  -> Studio: File > Import 3D. MeshParts named <Variant>_<Part>.
  assets/enemies/Enemies.glb  -> tools/preview lineup
  src/shared/RigData/Enemies.luau
Modelled in studs, Blender Z-up, facing -Y.
"""

import math
import os
import random
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from enemy_defs import VARIANTS, swatch_uv  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "assets", "enemies")
RIG_OUT = os.path.join(ROOT, "src", "shared", "RigData")

TILES = {"face": (0.0, 0.5, 0.5, 1.0), "belly": (0.5, 0.5, 1.0, 1.0), "back": (0.5, 0.0, 1.0, 0.5)}
PAD = 0.004
LINEUP_GAP = 7.0
RNG = random.Random(5)

# ---------------------------------------------------------------- helpers


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


class Ctx:
    """Current variant: where flat colors live in its atlas."""
    variant = "Monkey"


def paint(o, swatch, smooth=True):
    """Maps every face of `o` to one flat color swatch."""
    uv = fresh_uv(o.data)
    u, v = swatch_uv(Ctx.variant, swatch)
    for poly in o.data.polygons:
        for li in poly.loop_indices:
            uv.data[li].uv = (u, v)
        poly.use_smooth = smooth
    return o


def soft_box(name, size, center, radius, front=None, back=None, swatch="fur", rot=None):
    """Box with soft rounded edges. Front (-Y) faces can carry a printed tile, back (+Y) faces too."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    if rot:
        o.rotation_euler = rot  # about the box's own center, before baking
    bake(o)
    m = o.modifiers.new("Bevel", "BEVEL")
    m.width, m.segments, m.limit_method = min(radius, min(size) * 0.45), 5, "NONE"
    bake(o)
    uv = fresh_uv(o.data)
    cx, _, cz = center
    w, _, h = size
    su, sv = swatch_uv(Ctx.variant, swatch)
    for poly in o.data.polygons:
        tile = front if (front and poly.normal.y < -0.55) else back if (back and poly.normal.y > 0.55) else None
        for li in poly.loop_indices:
            co = o.data.vertices[o.data.loops[li].vertex_index].co
            if tile == front and tile:
                uv.data[li].uv = tile_uv((co.x - cx) / w + 0.5, (co.z - cz) / h + 0.5, tile)
            elif tile:
                uv.data[li].uv = tile_uv(0.5 - (co.x - cx) / w, (co.z - cz) / h + 0.5, tile)
            else:
                uv.data[li].uv = (su, sv)
        poly.use_smooth = True
    return o


def cylinder(name, r, depth, loc, rot=(0, 0, 0), verts=32, bevel=0.05, swatch="fur", r2=None):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=depth, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    bake(o)
    if bevel:
        m = o.modifiers.new("Bevel", "BEVEL")
        m.width, m.segments, m.limit_method = bevel, 3, "NONE"
        bake(o)
    return paint(o, swatch)


def ball(name, r, loc, swatch, scale=(1, 1, 1), segs=20):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=segs, ring_count=segs // 2)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    bake(o)
    return paint(o, swatch)


def tube(name, pts, radius, swatch, end_radius=1.0):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = radius
    cu.bevel_resolution = 4
    cu.use_fill_caps = True
    sp = cu.splines.new("BEZIER")
    sp.bezier_points.add(len(pts) - 1)
    for bp, p in zip(sp.bezier_points, pts):
        bp.co = p
        bp.handle_left_type = bp.handle_right_type = "AUTO"
    sp.bezier_points[0].radius = end_radius
    sp.bezier_points[-1].radius = end_radius
    o = bpy.data.objects.new(name, cu)
    bpy.context.collection.objects.link(o)
    select_only(o)
    bpy.ops.object.convert(target="MESH")
    return paint(bpy.context.active_object, swatch)


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

# ---------------------------------------------------------------- extras (baked into a body part)


def extra_banana(base, along=(0, -1, 0), length=1.4):
    """A curved banana starting at `base`, pointing along `along`."""
    bx, by, bz = base
    ax, ay, az = along
    pts = [(bx, by, bz), (bx + ax * length * 0.5, by + ay * length * 0.5, bz + az * length * 0.5 + 0.25),
           (bx + ax * length, by + ay * length, bz + az * length + 0.15)]
    b = tube("Banana", pts, 0.17 if length < 1 else 0.24, "banana", end_radius=0.35)
    tip = ball("BananaTip", 0.07, pts[-1], "banana_tip", segs=10)
    stem = ball("BananaStem", 0.07, pts[0], "banana_tip", segs=10)
    return [b, tip, stem]


def extras_for(v, part, geo):
    """Returns extra objects to join into `part` for this variant. geo has the part's layout."""
    out = []
    ex = v.get("extras", [])
    hw, hd, hh = v["body"]["head"]
    tw, td, th = v["body"]["torso"]
    if part == "Head":
        hx, hy, hz = geo["head_center"]
        top = hz + hh / 2
        if "headband" in ex:
            out.append(soft_box("Headband", (hw + 0.08, hd + 0.08, 0.26), (hx, hy, top - 0.28), 0.1, swatch="headband"))
            for s in (-1, 1):
                out.append(soft_box(f"BandTail{s}", (0.16, 0.08, 0.7), (hx + s * 0.18, hy + hd / 2 + 0.12, top - 0.6),
                                    0.04, swatch="headband", rot=(math.radians(-25), 0, math.radians(s * 18))))
        if "helmet" in ex:
            # a pot helmet that hugs the top of the head and stops above the brows
            out.append(soft_box("Helmet", (hw + 0.16, hd + 0.16, 0.75), (hx, hy, top), 0.3, swatch="metal"))
        if "ninja_band" in ex:
            band_z = hz + 0.18 * (hh / 1.9)
            for s in (-1, 1):
                out.append(soft_box(f"MaskSide{s}", (0.06, hd * 0.98, 0.42), (hx + s * (hw / 2 + 0.02), hy, band_z), 0.02,
                                    swatch="mask"))
            out.append(soft_box("MaskBack", (hw * 0.98, 0.06, 0.42), (hx, hy + hd / 2 + 0.02, band_z), 0.02, swatch="mask"))
            out.append(ball("Knot", 0.16, (hx, hy + hd / 2 + 0.12, band_z), "scarf", segs=12))
            for s in (-1, 1):
                out.append(soft_box(f"Scarf{s}", (0.22, 0.06, 0.9), (hx + s * 0.22, hy + hd / 2 + 0.2, band_z - 0.45),
                                    0.04, swatch="scarf", rot=(math.radians(-30), 0, math.radians(s * 25))))
        if "crown" in ex:
            cr = min(hw, hd) * 0.32
            out.append(cylinder("CrownRing", cr, 0.34, (hx, hy, top + 0.12), swatch="gold", bevel=0.04))
            for k in range(5):
                a = k / 5 * math.tau
                px, py = hx + math.cos(a) * cr * 0.9, hy + math.sin(a) * cr * 0.9
                out.append(cylinder(f"CrownSpike{k}", 0.13, 0.45, (px, py, top + 0.5), swatch="gold", bevel=0, r2=0.0,
                                    verts=8))
            out.append(ball("CrownGem", 0.1, (hx, hy - cr - 0.02, top + 0.14), "gem", segs=12))
    if part == "Torso":
        cx, cy, cz = geo["torso_center"]
        front = cy - td / 2
        if "bandolier" in ex:
            out.append(soft_box("Strap", (0.32, td + 0.12, th * 1.35), (cx, cy, cz), 0.06, swatch="strap",
                                rot=(0, math.radians(38), 0)))
            for k in range(3):
                t = (k - 1) * 0.55
                bx, bz = cx + t * math.sin(math.radians(38)), cz + t * math.cos(math.radians(38))
                out += extra_banana((bx - 0.25, front - 0.12, bz), along=(1, 0, 0.1), length=0.55)
        if "diaper" in ex:
            out.append(soft_box("Diaper", (tw + 0.08, td + 0.08, th * 0.5), (cx, cy, cz - th * 0.3), 0.14, swatch="diaper"))
        if "cape" in ex:
            out.append(soft_box("Cape", (tw * 0.92, 0.1, th + 1.3), (cx, cy + td / 2 + 0.08, cz - 0.6), 0.04, swatch="cape"))
            for s in (-1, 1):
                out.append(ball(f"CapeClasp{s}", 0.16, (cx + s * tw * 0.36, front - 0.05, cz + th * 0.42), "gold", segs=12))
        if "gold_armor" in ex:
            out.append(soft_box("GoldPlate", (tw * 0.55, 0.16, th * 0.36), (cx, front - 0.05, cz - th * 0.02), 0.08, swatch="gold"))
            out.append(ball("ChestGem", 0.16, (cx, front - 0.14, cz - th * 0.02), "gem", scale=(1, 0.5, 1)))
    if part in ("LeftArm", "RightArm"):
        ax, ay, top, bottom = geo["arm"]
        aw, ad = v["body"]["arm"][0], v["body"]["arm"][1]
        if part == "RightArm" and "banana_hand" in ex:
            out += extra_banana((ax, ay - aw / 2 - 0.05, bottom + 0.3), along=(0, -1, 0.5), length=2.0)
        if part == "RightArm" and "boulder" in ex:
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1.25, location=(ax, ay - 0.9, bottom + 0.4))
            rock = bpy.context.active_object
            rock.name = "Boulder"
            for vert in rock.data.vertices:
                vert.co *= 1 + RNG.uniform(-0.14, 0.14)
            bake(rock)
            out.append(paint(rock, "rock", smooth=False))
        if "gold_armor" in ex:  # pads that fit the arm, sitting on the shoulder
            out.append(soft_box("ShoulderPad", (aw + 0.14, ad + 0.14, 0.55), (ax, ay, top - 0.2), 0.16, swatch="gold"))
        if "spikes" in ex:  # bone spikes straight out of the shoulder
            for k in range(3):
                out.append(cylinder(f"Spike{k}", 0.15, 0.55, (ax, ay - 0.45 + k * 0.45, top + 0.22), swatch="spike_tip",
                                    bevel=0, r2=0.0, verts=8))
    return out

# ---------------------------------------------------------------- one variant


def build_variant(name, v, ox):
    Ctx.variant = name
    b = v["body"]
    gor = v.get("gorilla", False)
    lw, ld, lh = b["leg"]
    tw, td, th = b["torso"]
    aw, ad, ah = b["arm"]
    hw, hd, hh = b["head"]
    rad = b["radius"]
    leg_top = lh
    torso_top = leg_top + th
    parts, pivots = {}, {}

    # legs with cream feet
    for side, sx in (("Left", -1), ("Right", 1)):
        x = ox + sx * (tw * 0.25 if not gor else tw * 0.26)
        fur = soft_box("LegFur", (lw, ld, lh - b["foot_cap"] + 0.05), (x, 0, (lh + b["foot_cap"]) / 2 + 0.02), rad)
        cap = soft_box("Foot", (lw, ld, b["foot_cap"]), (x, 0, b["foot_cap"] / 2), rad, swatch="cream")
        pivots[side + "Leg"] = (x, 0, leg_top)
        parts[side + "Leg"] = join(f"{name}_{side}Leg", [fur, cap], pivots[side + "Leg"])

    # torso (printed belly front, printed back)
    tc = (ox, 0, leg_top + th / 2)
    torso = soft_box("TorsoMesh", (tw, td, th), tc, rad + 0.02, front="belly", back="back")
    pivots["Torso"] = tc
    parts["Torso"] = join(f"{name}_Torso", [torso] + extras_for(v, "Torso", {"torso_center": tc}), pivots["Torso"])

    # arms with cream hands; gorillas' hang to the ground
    for side, sx in (("Left", -1), ("Right", 1)):
        x = ox + sx * (tw / 2 + aw / 2 - (0.1 if gor else 0))
        top = torso_top - (0.15 if gor else 0)
        bottom = top - ah
        fur = soft_box("ArmFur", (aw, ad, ah - b["hand_cap"] + 0.05), (x, 0, bottom + b["hand_cap"] + (ah - b["hand_cap"]) / 2 - 0.02), rad)
        cap = soft_box("Hand", (aw, ad, b["hand_cap"]), (x, 0, bottom + b["hand_cap"] / 2), rad, swatch="cream")
        pivots[side + "Arm"] = (x, 0, top - min(0.45, aw * 0.4))
        objs = [fur, cap] + extras_for(v, side + "Arm", {"arm": (x, 0, top, bottom)})
        parts[side + "Arm"] = join(f"{name}_{side}Arm", objs, pivots[side + "Arm"])

    # head: gorillas sit lower and further forward, between the shoulders
    hy = -0.35 if gor else 0
    hz = torso_top + hh / 2 - (0.35 if gor else 0)
    head = soft_box("HeadMesh", (hw, hd, hh), (ox, hy, hz), b["head_radius"], front="face")
    ex = hw / 2 + b["ear_r"] * 0.45
    ear_sw = "skin_dark" if gor else "cream"
    ears = [cylinder(f"Ear{s}", b["ear_r"], 0.2, (ox + s * ex, hy + 0.2, hz + (0.05 if gor else 0.18)),
                     rot=(1.5708, 0, 0), verts=40, bevel=0.07, swatch=ear_sw) for s in (-1, 1)]
    pivots["Head"] = (ox, 0, torso_top - (0.35 if gor else 0))
    parts["Head"] = join(f"{name}_Head", [head] + ears + extras_for(v, "Head", {"head_center": (ox, hy, hz)}),
                         pivots["Head"])
    return parts, pivots


def material(name):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(os.path.join(OUT, f"{name}.png"))
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.55
    return mat


def to_roblox(v):
    """Blender (X right, Y back, Z up; model faces -Y) -> Roblox (X right, Y up, -Z forward)."""
    return (v[0], v[2], v[1])


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    os.makedirs(RIG_OUT, exist_ok=True)
    lines = ["-- Generated by tools/blender/build_enemies.py. Do not edit by hand.",
             "-- Rest-pose layout of each imported enemy mesh, in studs, relative to its feet (Roblox axes).",
             "return {"]
    ox = 0.0
    for name, v in VARIANTS.items():
        tw = v["body"]["torso"][0]
        ox += tw / 2 + 2
        parts, pivots = build_variant(name, v, ox)
        mat = material(name)
        for o in parts.values():
            o.data.materials.clear()
            o.data.materials.append(mat)
        corners = [o.matrix_world @ Vector(c) for o in parts.values() for c in o.bound_box]
        lines.append(f"\t{name} = {{")
        lines.append("\t\tHeight = %.3f," % max(c.z for c in corners))
        lines.append("\t\tParts = {")
        origin = Vector((ox, 0, 0))
        for pname, o in parts.items():
            cs = [o.matrix_world @ Vector(c) for c in o.bound_box]
            mn = Vector((min(c[i] for c in cs) for i in range(3))) - origin
            mx = Vector((max(c[i] for c in cs) for i in range(3))) - origin
            size = mx - mn
            pv = Vector(pivots[pname]) - origin
            lines.append("\t\t\t%s = { Size = Vector3.new(%.3f, %.3f, %.3f), Center = Vector3.new(%.3f, %.3f, %.3f), "
                         "Pivot = Vector3.new(%.3f, %.3f, %.3f) }," % (pname, size.x, size.z, size.y,
                                                                      *to_roblox((mn + mx) / 2), *to_roblox(pv)))
        lines += ["\t\t},", "\t},"]
        print(name, "tris:", sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in parts.values()))
        ox += tw / 2 + LINEUP_GAP
    lines += ["}", ""]
    with open(os.path.join(RIG_OUT, "Enemies.luau"), "w") as f:
        f.write("\n".join(lines))
    # one marker in front of the first variant: tells the game how the importer turned things
    first = next(iter(VARIANTS))
    Ctx.variant = first
    first_x = VARIANTS[first]["body"]["torso"][0] / 2 + 2
    bpy.ops.mesh.primitive_cube_add(size=0.05, location=(first_x, -1.0, 0.05))
    marker = bpy.context.active_object
    marker.name = marker.data.name = "FrontMarker"
    paint(marker, "fur")
    marker.data.materials.append(bpy.data.materials[first])
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.fbx(filepath=os.path.join(OUT, "Enemies.fbx"), use_selection=True, object_types={"MESH"},
                             apply_unit_scale=True, apply_scale_options="FBX_SCALE_ALL", path_mode="COPY",
                             embed_textures=True, mesh_smooth_type="FACE")
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, "Enemies.glb"), export_format="GLB", use_selection=True)
    print("exported", OUT)


main()
