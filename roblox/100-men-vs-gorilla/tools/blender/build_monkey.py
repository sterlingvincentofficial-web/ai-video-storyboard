"""Builds the Monkey enemy as a real textured mesh with Blender (bpy).

Output (in assets/monkey/):
  Monkey.fbx         -> import into Studio (File > Import 3D), one MeshPart per body part
  Monkey.glb         -> same model, used by tools/preview for screenshots
  MonkeyAtlas.png    -> the single texture every part shares (embedded in the FBX too)
  ../../src/shared/RigData/Monkey.luau -> part sizes + joint pivots so the game can rig it

Modelled in studs, Blender Z-up, facing -Y. Run:
  python tools/blender/build_monkey.py        (needs `pip install bpy`)
"""

import math
import os

import bpy
import numpy as np
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "assets", "monkey")
RIG_OUT = os.path.join(ROOT, "src", "shared", "RigData")
os.makedirs(OUT, exist_ok=True)
os.makedirs(RIG_OUT, exist_ok=True)

ATLAS_SIZE = 1024

# Atlas tiles (u0, v0, u1, v1). Fur gets the big tile so the grain stays crisp.
TILES = {
    "fur": (0.0, 0.0, 0.62, 1.0),
    "fur_dark": (0.62, 0.62, 1.0, 1.0),
    "face": (0.62, 0.30, 1.0, 0.62),
    "tip": (0.62, 0.12, 0.81, 0.30),
    "ink": (0.81, 0.12, 1.0, 0.30),
    "white": (0.62, 0.0, 0.81, 0.12),
    "mouth": (0.81, 0.0, 1.0, 0.12),
}

COLORS = {
    "fur": (108, 68, 38),
    "fur_dark": (82, 50, 28),
    "face": (230, 205, 150),
    "tip": (236, 214, 108),
    "ink": (22, 16, 14),
    "white": (250, 250, 250),
    "mouth": (70, 30, 24),
}

# ---------------------------------------------------------------- texture atlas


def make_atlas(path):
    rng = np.random.default_rng(3)
    S = ATLAS_SIZE
    img = np.zeros((S, S, 3), dtype=np.float32)

    def noise(h, w, sx, sy):
        """Smooth value noise stretched by (sx, sy) so fur grain runs one way."""
        gh, gw = max(2, int(h / sy)), max(2, int(w / sx))
        g = rng.random((gh + 1, gw + 1)).astype(np.float32)
        ys = np.linspace(0, gh, h, endpoint=False)
        xs = np.linspace(0, gw, w, endpoint=False)
        y0, x0 = ys.astype(int), xs.astype(int)
        fy, fx = (ys - y0)[:, None], (xs - x0)[None, :]
        fy, fx = fy * fy * (3 - 2 * fy), fx * fx * (3 - 2 * fx)
        a, b = g[y0][:, x0], g[y0][:, x0 + 1]
        c, d = g[y0 + 1][:, x0], g[y0 + 1][:, x0 + 1]
        return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy

    for name, (u0, v0, u1, v1) in TILES.items():
        x0, x1 = int(u0 * S), int(u1 * S)
        y0, y1 = int((1 - v1) * S), int((1 - v0) * S)  # image rows go top-down
        h, w = y1 - y0, x1 - x0
        base = np.array(COLORS[name], dtype=np.float32) / 255
        if name.startswith("fur"):
            grain = 0.55 * noise(h, w, 3, 40) + 0.3 * noise(h, w, 1.5, 14) + 0.15 * rng.random((h, w))
            shade = 0.82 + 0.36 * grain
        elif name in ("face", "tip"):
            shade = 0.94 + 0.1 * noise(h, w, 30, 30) + 0.03 * rng.random((h, w))
        else:
            shade = np.ones((h, w), dtype=np.float32)
        img[y0:y1, x0:x1] = np.clip(base[None, None, :] * shade[:, :, None], 0, 1)

    im = bpy.data.images.new("MonkeyAtlas", S, S, alpha=False)
    rgba = np.concatenate([img[::-1], np.ones((S, S, 1), dtype=np.float32)], axis=2)  # Blender rows go bottom-up
    im.pixels.foreach_set(rgba.ravel())
    im.filepath_raw = path
    im.file_format = "PNG"
    im.save()
    return im

# ---------------------------------------------------------------- modelling helpers


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def finish(obj, tile, bevel=0.0, subdiv=0, smooth=True):
    """Bevel / subdivide, UV-unwrap and squeeze the UVs into the given atlas tile."""
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    if bevel:
        m = obj.modifiers.new("Bevel", "BEVEL")
        m.width, m.segments, m.limit_method = bevel, 4, "NONE"
    if subdiv:
        m = obj.modifiers.new("Sub", "SUBSURF")
        m.levels = m.render_levels = subdiv
    for m in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")
    u0, v0, u1, v1 = TILES[tile]
    pad = 0.01
    for loop in obj.data.uv_layers.active.data:
        u, v = loop.uv
        loop.uv = (u0 + pad + u * (u1 - u0 - 2 * pad), v0 + pad + v * (v1 - v0 - 2 * pad))
    if smooth:
        for p in obj.data.polygons:
            p.use_smooth = True
    obj.select_set(False)
    return obj


def box(name, size, loc, tile, bevel=0.12, taper=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    if taper:  # narrow the top or bottom face: taper=(top_scale, bottom_scale)
        bpy.ops.object.transform_apply(scale=True)
        for v in o.data.vertices:
            v.co.x *= taper[0] if v.co.z > 0 else taper[1]
            v.co.y *= taper[0] if v.co.z > 0 else taper[1]
    return finish(o, tile, bevel=bevel)


def ball(name, radius, loc, tile, scale=(1, 1, 1), segments=32):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, location=loc, segments=segments, ring_count=segments // 2)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    return finish(o, tile)


def tube(name, points, radius, tile, taper_end=0.75):
    """Smooth round tube through `points` (for the tail)."""
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = radius
    cu.bevel_resolution = 6
    cu.use_fill_caps = True
    sp = cu.splines.new("BEZIER")
    sp.bezier_points.add(len(points) - 1)
    for bp, p in zip(sp.bezier_points, points):
        bp.co = p
        bp.handle_left_type = bp.handle_right_type = "AUTO"
    sp.bezier_points[-1].radius = taper_end
    sp.resolution_u = 16
    o = bpy.data.objects.new(name, cu)
    bpy.context.collection.objects.link(o)
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.convert(target="MESH")
    o = bpy.context.active_object
    o.select_set(False)
    return finish(o, tile)


def join(name, objs, pivot):
    """Joins sub-objects into one body part, origin at its joint pivot."""
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = name
    o.data.name = name
    bpy.context.scene.cursor.location = pivot
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    o.select_set(False)
    return o

def bake_rotation(o, euler):
    """Rotates about the object origin and bakes it into the mesh, so the part imports unrotated."""
    o.rotation_euler = euler
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    o.select_set(False)

# ---------------------------------------------------------------- the monkey
# Proportions follow the reference monkeys: chunky rounded-block limbs with pale tips,
# round head with a heart-shaped tan face, side ears, long curled tail. ~3.6 studs tall.


def build():
    parts = {}
    pivots = {}

    # legs (hip pivot at top of each leg)
    for side, x in (("Left", -0.33), ("Right", 0.33)):
        leg = box(side + "LegFur", (0.52, 0.56, 0.78), (x, 0, 0.66), "fur", bevel=0.14)
        foot = box(side + "Foot", (0.56, 0.7, 0.3), (x, -0.07, 0.15), "tip", bevel=0.12)
        pivots[side + "Leg"] = (x, 0, 1.0)
        parts[side + "Leg"] = join(side + "Leg", [leg, foot], pivots[side + "Leg"])

    # torso: slightly pear shaped, tan belly
    torso = box("TorsoFur", (1.25, 0.78, 1.2), (0, 0, 1.6), "fur", bevel=0.24, taper=(0.86, 1.0))
    belly = ball("Belly", 0.34, (0, -0.33, 1.5), "face", scale=(1.1, 0.42, 1.25))
    pivots["Torso"] = (0, 0, 1.6)
    parts["Torso"] = join("Torso", [torso, belly], pivots["Torso"])

    # arms hang from the shoulders, long like a monkey's
    for side, x in (("Left", -0.74), ("Right", 0.74)):
        sh = ball(side + "Shoulder", 0.27, (x * 0.93, 0, 2.02), "fur")
        arm = box(side + "ArmFur", (0.42, 0.44, 1.2), (x, 0, 1.5), "fur", bevel=0.13)
        hand = box(side + "Hand", (0.46, 0.48, 0.3), (x, 0, 0.83), "tip", bevel=0.12)
        pivots[side + "Arm"] = (x * 0.93, 0, 2.02)
        parts[side + "Arm"] = join(side + "Arm", [sh, arm, hand], pivots[side + "Arm"])
        bake_rotation(parts[side + "Arm"], (0, math.radians(-7 if x < 0 else 7), 0))

    # head
    hz = 2.72
    skull = ball("Skull", 0.6, (0, 0, hz), "fur", scale=(1.06, 1.0, 0.98))
    brow = ball("Brow", 0.5, (0, -0.2, hz + 0.18), "fur_dark", scale=(1.0, 0.75, 0.42))
    face_l = ball("FaceL", 0.27, (-0.17, -0.42, hz + 0.05), "face", scale=(1.0, 0.55, 1.15))
    face_r = ball("FaceR", 0.27, (0.17, -0.42, hz + 0.05), "face", scale=(1.0, 0.55, 1.15))
    muzzle = ball("Muzzle", 0.33, (0, -0.5, hz - 0.2), "face", scale=(1.15, 0.7, 0.8))
    eyes = []
    for x in (-0.16, 0.16):
        eyes.append(ball("Eye", 0.095, (x, -0.6, hz + 0.08), "ink", scale=(1, 0.6, 1.2), segments=20))
        eyes.append(ball("Glint", 0.03, (x + 0.035, -0.655, hz + 0.13), "white", segments=12))
    nostrils = [ball("Nostril", 0.035, (x, -0.74, hz - 0.12), "ink", segments=12) for x in (-0.06, 0.06)]
    mouth = ball("Mouth", 0.11, (0, -0.72, hz - 0.3), "mouth", scale=(1.3, 0.3, 0.3), segments=20)
    ears = []
    for x in (-0.64, 0.64):
        ears.append(ball("Ear", 0.22, (x, -0.02, hz + 0.08), "fur", scale=(0.5, 1.0, 1.0)))
        ears.append(ball("EarIn", 0.14, (x * 1.06, -0.06, hz + 0.08), "face", scale=(0.35, 0.9, 0.9)))
    pivots["Head"] = (0, 0, 2.18)
    parts["Head"] = join("Head", [skull, brow, face_l, face_r, muzzle, mouth] + eyes + nostrils + ears,
                         pivots["Head"])

    # tail: out of the lower back, sweeping up behind the head and curling over
    pts = [(0, 0.3, 1.2), (0, 0.75, 1.0), (0, 1.15, 1.25), (0, 1.3, 1.85), (0, 1.15, 2.6), (0, 0.8, 3.15),
           (0, 0.35, 3.3), (0, 0.15, 3.0), (0, 0.35, 2.8)]
    pivots["Tail"] = (0, 0.3, 1.2)
    parts["Tail"] = join("Tail", [tube("TailTube", pts, 0.12, "fur", taper_end=0.6)], pivots["Tail"])
    return parts, pivots


def material(atlas):
    mat = bpy.data.materials.new("MonkeyAtlas")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = atlas
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.8
    return mat


def to_roblox(v):
    """Blender (X right, Y back, Z up; model faces -Y) -> Roblox (X right, Y up, -Z forward)."""
    return (v[0], v[2], v[1])


def write_rig_data(parts, pivots):
    lines = [
        "-- Generated by tools/blender/build_monkey.py. Do not edit by hand.",
        "-- Rest-pose layout of the imported Monkey mesh, in studs, relative to the feet (Roblox axes).",
        "return {",
        "\tHeight = %.3f," % max(to_roblox(o.matrix_world @ Vector(c))[1] for o in parts.values()
                                for c in o.bound_box),
        "\tParts = {",
    ]
    for name, o in parts.items():
        corners = [o.matrix_world @ Vector(c) for c in o.bound_box]
        mn = Vector((min(c[i] for c in corners) for i in range(3)))
        mx = Vector((max(c[i] for c in corners) for i in range(3)))
        size = mx - mn
        center = to_roblox((mn + mx) / 2)
        pivot = to_roblox(pivots[name])
        lines.append("\t\t%s = { Size = Vector3.new(%.3f, %.3f, %.3f), Center = Vector3.new(%.3f, %.3f, %.3f), "
                     "Pivot = Vector3.new(%.3f, %.3f, %.3f) }," % (
                         name, size.x, size.z, size.y, *center, *pivot))
    lines += ["\t},", "}", ""]
    with open(os.path.join(RIG_OUT, "Monkey.luau"), "w") as f:
        f.write("\n".join(lines))


def main():
    clear_scene()
    atlas = make_atlas(os.path.join(OUT, "MonkeyAtlas.png"))
    parts, pivots = build()
    mat = material(atlas)
    for o in parts.values():
        o.data.materials.clear()
        o.data.materials.append(mat)
    write_rig_data(parts, pivots)
    tris = {n: sum(len(p.vertices) - 2 for p in o.data.polygons) for n, o in parts.items()}
    print("triangles:", tris)

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.fbx(filepath=os.path.join(OUT, "Monkey.fbx"), use_selection=True,
                             object_types={"MESH"}, apply_unit_scale=True, apply_scale_options="FBX_SCALE_ALL",
                             path_mode="COPY", embed_textures=True, mesh_smooth_type="FACE")
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, "Monkey.glb"), export_format="GLB", use_selection=True)
    print("exported", OUT)


main()
