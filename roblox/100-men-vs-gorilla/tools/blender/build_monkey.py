"""Builds the Monkey enemy mesh with Blender (bpy), matching the reference monkeys:
a classic R6 body (2x2x1 torso, 1x2x1 limbs, sharp boxes) in wood-grain brown, pale yellow
hand/foot caps, classic rounded Roblox head with a printed monkey face, pale side ears and a
long smooth tail that hooks over.

Run (texture first, it needs Pillow):
  python3 tools/blender/monkey_texture.py
  python tools/blender/build_monkey.py        (needs `pip install bpy`)
Out:
  assets/monkey/Monkey.fbx   -> Studio: File > Import 3D (one MeshPart per body part, texture embedded)
  assets/monkey/Monkey.glb   -> used by tools/preview for screenshots
  src/shared/RigData/Monkey.luau -> part sizes + joint pivots so the game can rig it
Modelled in studs, Blender Z-up, facing -Y.
"""

import math
import os

import bpy
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "assets", "monkey")
RIG_OUT = os.path.join(ROOT, "src", "shared", "RigData")
ATLAS = os.path.join(OUT, "MonkeyAtlas.png")

# Atlas tiles (u0, v0, u1, v1), see monkey_texture.py
TILES = {
    "fur": (0.0, 0.0, 0.5, 1.0),
    "face": (0.5, 0.5, 1.0, 1.0),
    "tip": (0.5, 0.25, 0.75, 0.5),
    "ear": (0.75, 0.25, 1.0, 0.5),
}
PAD = 0.008

# head (must match monkey_texture.py so the face lands right)
HEAD_HALF_W = 0.62
HEAD_BOTTOM, HEAD_TOP = 4.0, 5.25

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
    """Drops any default UVs a primitive came with, so ours is the only (active) map."""
    while me.uv_layers:
        me.uv_layers.remove(me.uv_layers[0])
    return me.uv_layers.new(name="UVMap")


def tile_uv(u, v, tile):
    u0, v0, u1, v1 = TILES[tile]
    u = min(max(u, 0.0), 1.0)
    v = min(max(v, 0.0), 1.0)
    return (u0 + PAD + u * (u1 - u0 - 2 * PAD), v0 + PAD + v * (v1 - v0 - 2 * PAD))


def box_project(o, tile_for_face):
    """Box-projects every face into a tile, normalised over the object's bounds, with v along Z
    on the side faces so the fur grain runs down the limbs."""
    me = o.data
    uv = fresh_uv(me)
    xs = [v.co.x for v in me.vertices]
    ys = [v.co.y for v in me.vertices]
    zs = [v.co.z for v in me.vertices]
    mn, mx = Vector((min(xs), min(ys), min(zs))), Vector((max(xs), max(ys), max(zs)))
    span = Vector([max(mx[i] - mn[i], 1e-6) for i in range(3)])
    for poly in me.polygons:
        n = poly.normal
        tile = tile_for_face(poly)
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            rel = Vector([(co[i] - mn[i]) / span[i] for i in range(3)])
            if abs(n.z) > max(abs(n.x), abs(n.y)):
                a, b = rel.x, rel.y
            elif abs(n.x) > abs(n.y):
                a, b = rel.y, rel.z
            else:
                a, b = rel.x, rel.z
            uv.data[li].uv = tile_uv(a, b, tile)


def rbox(name, size, center, bevel=0.035):
    """A Roblox-style box: sharp, with a hairline bevel to catch light."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    bake(o)
    m = o.modifiers.new("Bevel", "BEVEL")
    m.width, m.segments = bevel, 2
    bake(o)
    return o


def limb(name, center, cap_height=0.32):
    """1x2x1 fur limb with a pale yellow cap on its bottom end (hands/feet)."""
    cx, cy, cz = center
    fur = rbox(name + "Fur", (1, 1, 2 - cap_height), (cx, cy, cz + cap_height / 2))
    box_project(fur, lambda p: "fur")
    cap = rbox(name + "Cap", (1.0, 1.0, cap_height), (cx, cy, cz - 1 + cap_height / 2))
    box_project(cap, lambda p: "tip")
    return [fur, cap]


def classic_head(name, center):
    """Roblox's classic head: a cylinder with rounded top/bottom edges."""
    cx, cy, cz = center
    r, h, k = HEAD_HALF_W, HEAD_TOP - HEAD_BOTTOM, 0.24
    prof = [(0.0, -h / 2)]
    for i in range(9):
        a = -math.pi / 2 + i / 8 * math.pi / 2
        prof.append((r - k + math.cos(a) * k, -h / 2 + k + math.sin(a) * k))
    for i in range(9):
        a = i / 8 * math.pi / 2
        prof.append((r - k + math.cos(a) * k, h / 2 - k + math.sin(a) * k))
    prof.append((0.0, h / 2))
    segs = 48
    verts, faces = [], []
    for s in range(segs):
        t = s / segs * math.tau
        for (pr, pz) in prof:
            verts.append((cx + math.cos(t) * pr, cy + math.sin(t) * pr, cz + pz))
    n = len(prof)
    for s in range(segs):
        s2 = (s + 1) % segs
        for i in range(n - 1):
            faces.append((s * n + i, s2 * n + i, s2 * n + i + 1, s * n + i + 1))
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    bpy.ops.object.select_all(action="DESELECT")
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    select_only(o)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.remove_doubles(threshold=1e-5)
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    for p in o.data.polygons:
        p.use_smooth = True
    # UVs: the front (-Y) half shows the printed face, everything else is fur
    uv = fresh_uv(o.data)
    for poly in o.data.polygons:
        front = poly.normal.y < -0.1 or (poly.center.y - cy) < -0.25
        for li in poly.loop_indices:
            co = o.data.vertices[o.data.loops[li].vertex_index].co
            a = (co.x - cx + HEAD_HALF_W) / (2 * HEAD_HALF_W)
            b = (co.z - HEAD_BOTTOM) / (HEAD_TOP - HEAD_BOTTOM)
            if front:
                uv.data[li].uv = tile_uv(a, b, "face")
            else:
                ang = (math.atan2(co.y - cy, co.x - cx) / math.tau) % 1.0
                uv.data[li].uv = tile_uv(ang, b, "fur")
    return o


def ear(name, center, side):
    """Flat round ear on the side of the head (pale disc with a brown rim)."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.28, depth=0.14, location=center,
                                        rotation=(0, math.radians(90), 0))
    o = bpy.context.active_object
    o.name = name
    bake(o)
    m = o.modifiers.new("Bevel", "BEVEL")
    m.width, m.segments = 0.04, 2
    bake(o)
    uv = fresh_uv(o.data)
    for poly in o.data.polygons:
        flat = abs(poly.normal.x) > 0.9
        for li in poly.loop_indices:
            co = o.data.vertices[o.data.loops[li].vertex_index].co
            a = (co.y - center[1]) / 0.6 + 0.5
            b = (co.z - center[2]) / 0.6 + 0.5
            uv.data[li].uv = tile_uv(a, b, "ear" if flat else "fur")
        poly.use_smooth = not flat
    return o


def tail(name, points, radius):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = radius
    cu.bevel_resolution = 5
    cu.use_fill_caps = True
    sp = cu.splines.new("BEZIER")
    sp.bezier_points.add(len(points) - 1)
    for bp, p in zip(sp.bezier_points, points):
        bp.co = p
        bp.handle_left_type = bp.handle_right_type = "AUTO"
    sp.bezier_points[-1].radius = 0.7
    sp.resolution_u = 14
    o = bpy.data.objects.new(name, cu)
    bpy.context.collection.objects.link(o)
    select_only(o)
    bpy.ops.object.convert(target="MESH")
    o = bpy.context.active_object
    for p in o.data.polygons:
        p.use_smooth = True
    # fur grain along the tail: spread loops by height
    uv = fresh_uv(o.data)
    zs = [v.co.z for v in o.data.vertices]
    ys = [v.co.y for v in o.data.vertices]
    for poly in o.data.polygons:
        for li in poly.loop_indices:
            co = o.data.vertices[o.data.loops[li].vertex_index].co
            uv.data[li].uv = tile_uv((co.y - min(ys)) / (max(ys) - min(ys)), (co.z - min(zs)) / (max(zs) - min(zs)),
                                     "fur")
    return o


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

# ---------------------------------------------------------------- the monkey (R6 layout)


def build():
    parts, pivots = {}, {}
    for side, x in (("Left", -0.5), ("Right", 0.5)):
        pivots[side + "Leg"] = (x, 0, 2.0)
        parts[side + "Leg"] = join(side + "Leg", limb(side + "Leg", (x, 0, 1.0)), pivots[side + "Leg"])
    torso = rbox("TorsoFur", (2, 1, 2), (0, 0, 3.0))
    box_project(torso, lambda p: "fur")
    pivots["Torso"] = (0, 0, 3.0)
    parts["Torso"] = join("Torso", [torso], pivots["Torso"])
    for side, x in (("Left", -1.5), ("Right", 1.5)):
        pivots[side + "Arm"] = (x, 0, 3.5)
        parts[side + "Arm"] = join(side + "Arm", limb(side + "Arm", (x, 0, 3.0)), pivots[side + "Arm"])
    head = classic_head("HeadMesh", (0, 0, (HEAD_BOTTOM + HEAD_TOP) / 2))
    ears = [ear("EarL", (-0.66, 0.02, 4.78), -1), ear("EarR", (0.66, 0.02, 4.78), 1)]
    pivots["Head"] = (0, 0, 4.0)
    parts["Head"] = join("Head", [head] + ears, pivots["Head"])
    # tail: out of the lower back, back and up in a big arc, hooking over at the end (+Y = back)
    pts = [(0, 0.45, 2.35), (0, 1.05, 2.1), (0, 1.75, 2.45), (0, 2.15, 3.3), (0, 2.1, 4.3), (0, 1.7, 5.0),
           (0, 1.15, 5.15), (0, 0.85, 4.75)]
    pivots["Tail"] = (0, 0.45, 2.35)
    parts["Tail"] = join("Tail", [tail("TailMesh", pts, 0.14)], pivots["Tail"])
    return parts, pivots


def material():
    mat = bpy.data.materials.new("MonkeyAtlas")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(ATLAS)
    tex.interpolation = "Linear"
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.85
    return mat


def to_roblox(v):
    """Blender (X right, Y back, Z up; model faces -Y) -> Roblox (X right, Y up, -Z forward)."""
    return (v[0], v[2], v[1])


def write_rig_data(parts, pivots):
    corners_all = [p.matrix_world @ Vector(c) for p in parts.values() for c in p.bound_box]
    lines = [
        "-- Generated by tools/blender/build_monkey.py. Do not edit by hand.",
        "-- Rest-pose layout of the imported Monkey mesh, in studs, relative to the feet (Roblox axes).",
        "return {",
        "\tHeight = %.3f," % max(c.z for c in corners_all),
        "\tParts = {",
    ]
    for name, o in parts.items():
        cs = [o.matrix_world @ Vector(c) for c in o.bound_box]
        mn = Vector((min(c[i] for c in cs) for i in range(3)))
        mx = Vector((max(c[i] for c in cs) for i in range(3)))
        size = mx - mn
        lines.append("\t\t%s = { Size = Vector3.new(%.3f, %.3f, %.3f), Center = Vector3.new(%.3f, %.3f, %.3f), "
                     "Pivot = Vector3.new(%.3f, %.3f, %.3f) }," % (
                         name, size.x, size.z, size.y, *to_roblox((mn + mx) / 2), *to_roblox(pivots[name])))
    lines += ["\t},", "}", ""]
    with open(os.path.join(RIG_OUT, "Monkey.luau"), "w") as f:
        f.write("\n".join(lines))


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    os.makedirs(RIG_OUT, exist_ok=True)
    parts, pivots = build()
    mat = material()
    for o in parts.values():
        o.data.materials.clear()
        o.data.materials.append(mat)
    write_rig_data(parts, pivots)
    print("triangles:", {n: sum(len(p.vertices) - 2 for p in o.data.polygons) for n, o in parts.items()})
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.fbx(filepath=os.path.join(OUT, "Monkey.fbx"), use_selection=True, object_types={"MESH"},
                             apply_unit_scale=True, apply_scale_options="FBX_SCALE_ALL", path_mode="COPY",
                             embed_textures=True, mesh_smooth_type="FACE")
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, "Monkey.glb"), export_format="GLB", use_selection=True)
    print("exported", OUT)


main()
