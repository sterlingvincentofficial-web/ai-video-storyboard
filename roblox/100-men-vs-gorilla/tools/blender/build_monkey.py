"""Builds the Monkey enemy mesh with Blender (bpy), cloned from the brown monkey concept art:
chunky toy-plastic blocks with soft rounded edges, big rounded-box head with a printed face,
cream disc ears facing forward, printed cream belly, cream hand and foot caps. No tail.

Run (texture first, it needs Pillow):
  python3 tools/blender/monkey_texture.py
  python tools/blender/build_monkey.py        (needs `pip install bpy`)
Out:
  assets/monkey/Monkey.fbx   -> Studio: File > Import 3D (one MeshPart per body part, texture embedded)
  assets/monkey/Monkey.glb   -> used by tools/preview for screenshots
  src/shared/RigData/Monkey.luau -> part sizes + joint pivots so the game can rig it
Modelled in studs, Blender Z-up, facing -Y.
"""

import os

import bpy
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "assets", "monkey")
RIG_OUT = os.path.join(ROOT, "src", "shared", "RigData")
ATLAS = os.path.join(OUT, "MonkeyAtlas.png")

# Atlas tiles (u0, v0, u1, v1), see monkey_texture.py
TILES = {
    "brown": (0.0, 0.0, 0.25, 0.25),
    "cream": (0.25, 0.0, 0.5, 0.25),
    "face": (0.0, 0.5, 0.5, 1.0),
    "belly": (0.5, 0.5, 1.0, 1.0),
}
PAD = 0.004

# Proportions (studs). Head front and torso front must match monkey_texture.py.
LEG = (1.0, 1.0, 2.0)      # x, y(depth), z(height)
TORSO = (2.0, 1.25, 2.0)
ARM = (0.95, 0.95, 1.9)
HEAD = (2.3, 1.9, 1.9)      # width, depth, height
HAND_CAP = 0.62
FOOT_CAP = 0.5
EAR_R, EAR_DEPTH = 0.43, 0.2

LEG_TOP = LEG[2]
TORSO_TOP = LEG_TOP + TORSO[2]

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
    u = min(max(u, 0.0), 1.0)
    v = min(max(v, 0.0), 1.0)
    return (u0 + PAD + u * (u1 - u0 - 2 * PAD), v0 + PAD + v * (v1 - v0 - 2 * PAD))


def soft_box(name, size, center, radius, front_tile=None, tile="brown"):
    """Box with soft rounded edges. Faces looking forward (-Y) get `front_tile`, projected flat
    over the box's front so a print (face/belly) lands where it was painted."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    bake(o)
    m = o.modifiers.new("Bevel", "BEVEL")
    m.width, m.segments, m.limit_method = radius, 5, "NONE"
    bake(o)
    me = o.data
    uv = fresh_uv(me)
    cx, cy, cz = center
    w, _, h = size
    for poly in me.polygons:
        use_front = front_tile and poly.normal.y < -0.55
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            if use_front:
                uv.data[li].uv = tile_uv((co.x - cx) / w + 0.5, (co.z - cz) / h + 0.5, front_tile)
            else:
                uv.data[li].uv = tile_uv(0.5, 0.5, tile)
        poly.use_smooth = True
    return o


def capped_limb(name, size, center, cap):
    """Brown limb with a cream cap on its bottom end (hand / foot)."""
    w, d, h = size
    cx, cy, cz = center
    fur = soft_box(name + "Fur", (w, d, h - cap + 0.05), (cx, cy, cz + cap / 2 + 0.025), 0.12)
    tip = soft_box(name + "Cap", (w, d, cap), (cx, cy, cz - h / 2 + cap / 2), 0.12, tile="cream")
    return [fur, tip]


def ear(name, center):
    """Cream disc facing forward, set on the side of the head."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=EAR_R, depth=EAR_DEPTH, location=center,
                                        rotation=(1.5708, 0, 0))
    o = bpy.context.active_object
    o.name = name
    bake(o)
    m = o.modifiers.new("Bevel", "BEVEL")
    m.width, m.segments, m.limit_method = 0.07, 4, "NONE"
    bake(o)
    uv = fresh_uv(o.data)
    for poly in o.data.polygons:
        for li in poly.loop_indices:
            uv.data[li].uv = tile_uv(0.5, 0.5, "cream")
        poly.use_smooth = True
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

# ---------------------------------------------------------------- the monkey


def build():
    parts, pivots = {}, {}
    for side, x in (("Left", -0.5), ("Right", 0.5)):
        pivots[side + "Leg"] = (x, 0, LEG_TOP)
        parts[side + "Leg"] = join(side + "Leg", capped_limb(side + "Leg", LEG, (x, 0, LEG[2] / 2), FOOT_CAP),
                                   pivots[side + "Leg"])

    torso = soft_box("TorsoMesh", TORSO, (0, 0, LEG_TOP + TORSO[2] / 2), 0.14, front_tile="belly")
    pivots["Torso"] = (0, 0, LEG_TOP + TORSO[2] / 2)
    parts["Torso"] = join("Torso", [torso], pivots["Torso"])

    ax = TORSO[0] / 2 + ARM[0] / 2
    for side, x in (("Left", -ax), ("Right", ax)):
        pivots[side + "Arm"] = (x, 0, TORSO_TOP - 0.45)
        parts[side + "Arm"] = join(side + "Arm", capped_limb(side + "Arm", ARM, (x, 0, TORSO_TOP - ARM[2] / 2),
                                                              HAND_CAP), pivots[side + "Arm"])

    hz = TORSO_TOP + HEAD[2] / 2
    head = soft_box("HeadMesh", HEAD, (0, 0, hz), 0.24, front_tile="face")
    ex = HEAD[0] / 2 + EAR_R * 0.45
    ears = [ear("EarL", (-ex, 0.2, hz + 0.18)), ear("EarR", (ex, 0.2, hz + 0.18))]
    pivots["Head"] = (0, 0, TORSO_TOP)
    parts["Head"] = join("Head", [head] + ears, pivots["Head"])

    # Tiny marker in front of the feet: lets the game tell which way the importer turned the mesh.
    bpy.ops.mesh.primitive_cube_add(size=0.05, location=(0, -1.0, 0.05))
    marker = bpy.context.active_object
    marker.name = marker.data.name = "FrontMarker"
    fresh_uv(marker.data)
    return parts, pivots, marker


def material():
    mat = bpy.data.materials.new("MonkeyAtlas")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(ATLAS)
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.55
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
    parts, pivots, marker = build()
    mat = material()
    for o in list(parts.values()) + [marker]:
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
