"""Builds every piece of the army's gear as meshes with Blender (bpy).

Each item is one solid-color MeshPart (the game colors it, so levels can turn wood to steel to
gold). Items are modelled around an anchor at the origin:
  hats      anchor = top-center of a 1.2-stud head; the shell hangs down over it
  held      anchor = the grip, item points forward (-Y), up is +Z
  badges    anchor = center of the badge's back, which sits on the chest
  projectiles anchor = center
The game reads the anchors from src/shared/RigData/Gear.luau, so it never cares where the
importer put things or which unit scale it used.

Run: python tools/blender/build_gear.py   (needs `pip install bpy`)
Out: assets/men/MenGear.fbx, assets/men/MenGear.glb, src/shared/RigData/Gear.luau
"""

import math
import os

import bpy
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "assets", "men")
RIG_OUT = os.path.join(ROOT, "src", "shared", "RigData")


def select_only(o):
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o


def bake(o):
    select_only(o)
    for m in list(o.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for p in o.data.polygons:
        p.use_smooth = True
    o.select_set(False)
    return o


def bevel(o, w, segs=3):
    m = o.modifiers.new("Bevel", "BEVEL")
    m.width, m.segments, m.limit_method = w, segs, "NONE"
    return bake(o)


def box(size, loc, rot=(0, 0, 0), r=0.04):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.scale = size
    o.rotation_euler = rot
    bake(o)
    return bevel(o, min(r, min(size) * 0.45)) if r else o


def cyl(r, depth, loc, rot=(0, 0, 0), verts=24, r2=None, bev=0.02):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=depth, location=loc, rotation=rot)
    o = bake(bpy.context.active_object)
    return bevel(o, bev) if bev else o


def sphere(r, loc, scale=(1, 1, 1), segs=24):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=segs, ring_count=segs // 2)
    o = bpy.context.active_object
    o.scale = scale
    return bake(o)


def dome(r, h, z0, open_below=True):
    """Half-sphere shell of radius r, height h, sitting with its rim at z0 (a hat crown)."""
    o = sphere(r, (0, 0, z0), scale=(1, 1, h / r), segs=32)
    if open_below:
        select_only(o)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="DESELECT")
        bpy.ops.object.mode_set(mode="OBJECT")
        for v in o.data.vertices:
            v.select = v.co.z < z0 - 1e-4
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.delete(type="VERT")
        bpy.ops.object.mode_set(mode="OBJECT")
        m = o.modifiers.new("Shell", "SOLIDIFY")
        m.thickness = 0.06
        bake(o)
    return o


def tube(pts, r, end_r=1.0):
    cu = bpy.data.curves.new("tube", "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = r
    cu.bevel_resolution = 4
    cu.use_fill_caps = True
    sp = cu.splines.new("BEZIER")
    sp.bezier_points.add(len(pts) - 1)
    for bp, p in zip(sp.bezier_points, pts):
        bp.co = p
        bp.handle_left_type = bp.handle_right_type = "AUTO"
    sp.bezier_points[0].radius = end_r
    sp.bezier_points[-1].radius = end_r
    o = bpy.data.objects.new("tube", cu)
    bpy.context.collection.objects.link(o)
    select_only(o)
    bpy.ops.object.convert(target="MESH")
    return bake(bpy.context.active_object)


def join(objs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    return bpy.context.active_object

# ---------------------------------------------------------------- items (anchor at origin)


HEAD = 0.62  # half-width of the head the hats are sized for


def item_headband():
    ring = cyl(HEAD + 0.04, 0.24, (0, 0, -0.3), verts=40)
    select_only(ring)
    m = ring.modifiers.new("Hole", "BOOLEAN")
    bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=HEAD - 0.02, depth=1, location=(0, 0, -0.3))
    cutter = bpy.context.active_object
    m.object = cutter
    bake(ring)
    bpy.data.objects.remove(cutter)
    knot = sphere(0.11, (0, HEAD + 0.06, -0.3), scale=(1.2, 0.8, 1))
    tails = [box((0.1, 0.03, 0.38), (s * 0.09, HEAD + 0.09, -0.55), rot=(math.radians(-14), 0, math.radians(s * 14)), r=0.01)
             for s in (-1, 1)]
    return join([ring, knot] + tails)


def item_cap(backwards=True):
    crown = dome(HEAD + 0.06, 0.5, -0.2)
    brim_y = (HEAD + 0.3) * (1 if backwards else -1)
    brim = box((0.95, 0.65, 0.07), (0, brim_y, -0.2), r=0.03)
    button = sphere(0.07, (0, 0, 0.3))
    return join([crown, brim, button])


def item_beanie():
    crown = dome(HEAD + 0.06, 0.6, -0.15)
    band = cyl(HEAD + 0.09, 0.22, (0, 0, -0.22), verts=40)
    pom = sphere(0.2, (0, 0, 0.5))
    return join([crown, band, pom])


def item_safari_hat():
    crown = dome(HEAD + 0.05, 0.55, -0.12)
    brim = cyl(1.05, 0.06, (0, 0, -0.14), verts=48, bev=0.02)
    band = cyl(HEAD + 0.08, 0.12, (0, 0, -0.06), verts=40)
    return join([crown, brim, band])


def item_medic_cap():
    hat = cyl(HEAD - 0.02, 0.42, (0, 0, -0.02), verts=40, bev=0.04)
    return hat


def item_medic_cross():
    return join([box((0.3, 0.06, 0.1), (0, 0, 0), r=0.01), box((0.1, 0.06, 0.3), (0, 0, 0), r=0.01)])


def item_army_helmet():
    shell = dome(HEAD + 0.12, 0.6, -0.25)
    rim = cyl(HEAD + 0.2, 0.08, (0, 0, -0.27), verts=48)
    strap = box((0.08, 0.06, 0.5), (HEAD + 0.05, -0.1, -0.55), r=0.01)
    return join([shell, rim, strap])


def item_zoo_cap():
    crown = dome(HEAD + 0.06, 0.45, -0.18)
    brim = box((1.0, 0.7, 0.07), (0, -(HEAD + 0.3), -0.18), r=0.03)
    return join([crown, brim])


def item_officer_cap():
    band = cyl(HEAD + 0.04, 0.3, (0, 0, -0.12), verts=40)
    top = cyl(HEAD + 0.24, 0.16, (0, -0.06, 0.14), verts=40, bev=0.05)
    brim = box((0.9, 0.5, 0.06), (0, -(HEAD + 0.18), -0.2), rot=(math.radians(-12), 0, 0), r=0.03)
    return join([band, top, brim])


def item_officer_badge():
    return cyl(0.13, 0.05, (0, 0, 0), rot=(math.radians(90), 0, 0), verts=6, bev=0.01)


def item_banana_hat():
    pts = [(0.75, 0.0, -0.2), (0.6, -0.05, 0.45), (0, -0.1, 0.75), (-0.6, -0.05, 0.45), (-0.75, 0.0, -0.2)]
    return tube(pts, 0.32, end_r=0.45)


def item_slingshot():
    handle = cyl(0.07, 0.6, (0, 0, -0.1))
    prongs = [tube([(0, 0, 0.18), (s * 0.12, 0, 0.4), (s * 0.22, -0.05, 0.6)], 0.06) for s in (-1, 1)]
    band = box((0.46, 0.04, 0.05), (0, -0.05, 0.6), r=0.01)
    return join([handle] + prongs + [band])


def item_axe_handle():
    return cyl(0.08, 2.6, (0, 0, 0.9), verts=12)


def item_axe_head():
    blade = box((0.12, 0.85, 0.6), (0, -0.4, 2.0), r=0.03)
    back = box((0.2, 0.3, 0.35), (0, 0.05, 2.0), r=0.03)
    return join([blade, back])


def item_rifle_stock():
    stock = box((0.18, 0.9, 0.3), (0, 0.55, -0.05), r=0.05)
    grip = box((0.14, 0.18, 0.35), (0, 0.05, -0.2), rot=(math.radians(-15), 0, 0), r=0.04)
    fore = box((0.18, 0.9, 0.18), (0, -0.55, 0.05), r=0.04)
    return join([stock, grip, fore])


def item_rifle_barrel():
    barrel = cyl(0.05, 2.1, (0, -1.0, 0.16), rot=(math.radians(90), 0, 0), verts=12)
    scope = cyl(0.08, 0.6, (0, -0.2, 0.32), rot=(math.radians(90), 0, 0), verts=16)
    return join([barrel, scope])


def item_medkit():
    case = box((0.85, 0.35, 0.6), (0, -0.05, -0.4), r=0.06)
    handle = box((0.4, 0.08, 0.14), (0, -0.05, -0.04), r=0.03)
    return join([case, handle])


def item_big_banana():
    pts = [(0, 0, 0), (0, -0.5, 0.6), (0, -0.4, 1.3), (0, -0.1, 1.7)]
    return tube(pts, 0.22, end_r=0.45)


def item_grenade():
    body = sphere(0.24, (0, 0, 0.05), scale=(1, 1, 1.15))
    cap = cyl(0.09, 0.12, (0, 0, 0.32))
    lever = box((0.05, 0.2, 0.3), (0, 0.14, 0.22), r=0.01)
    return join([body, cap, lever])


def item_netgun():
    barrel = cyl(0.13, 1.2, (0, -0.5, 0.1), rot=(math.radians(90), 0, 0), verts=16)
    grip = box((0.16, 0.22, 0.45), (0, 0.05, -0.15), rot=(math.radians(-12), 0, 0), r=0.04)
    tank = cyl(0.17, 0.5, (0, 0.2, 0.25), rot=(math.radians(90), 0, 0), verts=16)
    return join([barrel, grip, tank])


def item_netgun_muzzle():
    return cyl(0.32, 0.4, (0, -1.25, 0.1), rot=(math.radians(-90), 0, 0), r2=0.13, verts=16)


def item_megaphone():
    cone = cyl(0.42, 0.9, (0, -0.55, 0.15), rot=(math.radians(90), 0, 0), r2=0.12, verts=24)
    handle = box((0.12, 0.16, 0.4), (0, 0.0, -0.1), r=0.03)
    return join([cone, handle])


def item_hand_wrap():
    o = box((1, 1, 1), (0, 0, 0), r=0.14)
    bands = [box((1.04, 1.04, 0.12), (0, 0, z), r=0.05) for z in (-0.3, 0.0, 0.3)]
    return join([o] + bands)


def item_chevron():
    parts = []
    for k in range(2):
        z = k * 0.16
        for s in (-1, 1):
            parts.append(box((0.26, 0.05, 0.08), (s * 0.1, 0, z - abs(s) * 0.0), rot=(0, math.radians(s * 35), 0), r=0.01))
    return join(parts)


def item_star():
    verts, faces = [], []
    for i in range(10):
        a = math.pi / 2 + i * math.pi / 5
        r = 0.28 if i % 2 == 0 else 0.12
        verts.append((math.cos(a) * r, 0, math.sin(a) * r))
    verts.append((0, -0.06, 0))
    verts.append((0, 0.03, 0))
    for i in range(10):
        faces.append((i, (i + 1) % 10, 10))
        faces.append(((i + 1) % 10, i, 11))
    me = bpy.data.meshes.new("star")
    me.from_pydata(verts, [], faces)
    o = bpy.data.objects.new("star", me)
    bpy.context.collection.objects.link(o)
    return o


def item_pebble():
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.22)
    return bake(bpy.context.active_object)


def item_net():
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1.0, segments=10, ring_count=6)
    o = bpy.context.active_object
    o.scale = (1, 1, 0.55)
    m = o.modifiers.new("Wire", "WIREFRAME")
    m.thickness = 0.06
    return bake(o)


ITEMS = {
    # name: (builder, anchor kind)
    "Headband": (item_headband, "Hat"),
    "Cap": (item_cap, "Hat"),
    "Beanie": (item_beanie, "Hat"),
    "SafariHat": (item_safari_hat, "Hat"),
    "MedicCap": (item_medic_cap, "Hat"),
    "ArmyHelmet": (item_army_helmet, "Hat"),
    "ZooCap": (item_zoo_cap, "Hat"),
    "OfficerCap": (item_officer_cap, "Hat"),
    "BananaHat": (item_banana_hat, "Hat"),
    "Slingshot": (item_slingshot, "Grip"),
    "AxeHandle": (item_axe_handle, "Grip"),
    "AxeHead": (item_axe_head, "Grip"),
    "RifleStock": (item_rifle_stock, "Grip"),
    "RifleBarrel": (item_rifle_barrel, "Grip"),
    "Medkit": (item_medkit, "Grip"),
    "BigBanana": (item_big_banana, "Grip"),
    "Grenade": (item_grenade, "Grip"),
    "NetGun": (item_netgun, "Grip"),
    "NetGunMuzzle": (item_netgun_muzzle, "Grip"),
    "Megaphone": (item_megaphone, "Grip"),
    "HandWrap": (item_hand_wrap, "Hand"),
    "MedicCross": (item_medic_cross, "Badge"),
    "OfficerBadge": (item_officer_badge, "Badge"),
    "Chevron": (item_chevron, "Badge"),
    "Star": (item_star, "Badge"),
    "Pebble": (item_pebble, "Center"),
    "Net": (item_net, "Center"),
}


def to_roblox(v):
    return (v[0], v[2], v[1])


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    lines = ["-- Generated by tools/blender/build_gear.py. Do not edit by hand.",
             "-- Each gear mesh: native Size and Anchor (anchor point relative to the bounds center), Roblox axes.",
             "return {"]
    objs = []
    for i, (name, (fn, kind)) in enumerate(ITEMS.items()):
        o = fn()
        o.name = o.data.name = name
        cs = [Vector(c) for c in o.bound_box]
        mn = Vector((min(c[k] for c in cs) for k in range(3)))
        mx = Vector((max(c[k] for c in cs) for k in range(3)))
        size, center = mx - mn, (mn + mx) / 2
        anchor = -center  # the anchor sits at the origin
        lines.append('\t%s = { Kind = "%s", Size = Vector3.new(%.3f, %.3f, %.3f), Anchor = Vector3.new(%.3f, %.3f, %.3f) },'
                     % (name, kind, size.x, size.z, size.y, *to_roblox(anchor)))
        o.location = ((i % 7) * 3.0, 0, (i // 7) * 3.0)  # lay them out in a grid for the import / preview
        objs.append(o)
    # two markers tell the game whether the importer turned the file around (+Y in Blender is the back)
    for nm, y in (("GearFront", -1.0), ("GearBack", 1.0)):
        bpy.ops.mesh.primitive_cube_add(size=0.05, location=(-3, y, 0))
        mk = bpy.context.active_object
        mk.name = mk.data.name = nm
    lines += ["}", ""]
    with open(os.path.join(RIG_OUT, "Gear.luau"), "w") as f:
        f.write("\n".join(lines))
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.fbx(filepath=os.path.join(OUT, "MenGear.fbx"), use_selection=True, object_types={"MESH"},
                             apply_unit_scale=True, apply_scale_options="FBX_SCALE_ALL", mesh_smooth_type="FACE")
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, "MenGear.glb"), export_format="GLB", use_selection=True)
    print("exported", len(ITEMS), "items to", OUT)


main()
