"""Builds, animates and renders "Sakadung Toilet vs Agent Apple" - Episode 1.

Run with a Python that has the `bpy` module (Blender 5.x as a module):
    python scene.py --stills 100,200,300      # quick look renders
    python scene.py --range 1 720             # render the animation frames
    python scene.py --save-only               # just write the .blend file
"""
import argparse
import math
import os
import sys

import bpy
from mathutils import Euler, Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import timeline as T  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
PI = math.pi

# ----------------------------------------------------------------------------
# small math helpers
# ----------------------------------------------------------------------------

def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def lerp(a, b, t):
    return a + (b - a) * t


def vlerp(a, b, t):
    return Vector(a).lerp(Vector(b), t)


def smooth(t):
    t = clamp(t)
    return t * t * (3 - 2 * t)


def ease_out_back(t, s=1.9):
    t = clamp(t) - 1
    return t * t * ((s + 1) * t + s) + 1


def prog(f, f0, f1):
    return clamp((f - f0) / float(f1 - f0))


def spring(t, freq=3.0, decay=4.0):
    """Damped oscillation, 1 at t=0 settling to 0. t in seconds."""
    if t < 0:
        return 1.0
    return math.exp(-decay * t) * math.cos(2 * PI * freq * t)


def hash01(n):
    x = math.sin(n * 12.9898 + 78.233) * 43758.5453
    return x - math.floor(x)


def shake(f, amp, speed=1.0, seed=0.0):
    t = f / T.FPS * speed
    return Vector((
        amp * (math.sin(t * 2.1 + seed) * 0.6 + math.sin(t * 5.3 + seed * 2) * 0.4),
        amp * (math.sin(t * 1.7 + seed * 3) * 0.6 + math.sin(t * 4.1 + seed) * 0.4),
        amp * (math.sin(t * 2.7 + seed * 5) * 0.6 + math.sin(t * 6.2 + seed * 4) * 0.4),
    ))


# ----------------------------------------------------------------------------
# scene + materials
# ----------------------------------------------------------------------------

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.fps = T.FPS
    sc.frame_start, sc.frame_end = 1, T.FRAMES
    return sc


def principled(m):
    return next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")


def new_mat(name, color, rough=0.5, metal=0.0, coat=0.0, emit=None, strength=0.0, sss=0.0):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    b = principled(m)
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    b.inputs["Coat Weight"].default_value = coat
    if sss:
        b.inputs["Subsurface Weight"].default_value = sss
        b.inputs["Subsurface Radius"].default_value = (0.4, 0.15, 0.08)
        b.inputs["Subsurface Scale"].default_value = 0.03
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = strength
    return m


def mix_rgba(nt, blend="MULTIPLY"):
    mx = nt.nodes.new("ShaderNodeMix")
    mx.data_type = "RGBA"
    mx.blend_type = blend
    fac = mx.inputs[0]
    a = [s for s in mx.inputs if s.type == "RGBA"][0]
    b = [s for s in mx.inputs if s.type == "RGBA"][1]
    out = [s for s in mx.outputs if s.type == "RGBA"][0]
    return mx, fac, a, b, out


def grime_mat(name, base_socket_src, nt, b, amount, scale=2.5):
    """Multiply a dirty noise layer over whatever feeds base color."""
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = 8
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[0].color = (0.28, 0.24, 0.16, 1)
    ramp.color_ramp.elements[1].position = 0.62
    ramp.color_ramp.elements[1].color = (1, 1, 1, 1)
    nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    mx, fac, a, bb, out = mix_rgba(nt)
    fac.default_value = amount
    nt.links.new(base_socket_src, a)
    nt.links.new(ramp.outputs["Color"], bb)
    nt.links.new(out, b.inputs["Base Color"])


def tile_mat(name, c1, c2, mortar, tile, axes=("x", "y"), grime=0.5, rough=0.25):
    m = new_mat(name, c1, rough=rough)
    nt = m.node_tree
    b = principled(m)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    comb = nt.nodes.new("ShaderNodeCombineXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs[0])
    idx = {"x": 0, "y": 1, "z": 2}
    nt.links.new(sep.outputs[idx[axes[0]]], comb.inputs[0])
    nt.links.new(sep.outputs[idx[axes[1]]], comb.inputs[1])
    br = nt.nodes.new("ShaderNodeTexBrick")
    br.offset = 0.0
    br.inputs["Color1"].default_value = (*c1, 1)
    br.inputs["Color2"].default_value = (*c2, 1)
    br.inputs["Mortar"].default_value = (*mortar, 1)
    br.inputs["Scale"].default_value = 1.0 / tile
    br.inputs["Mortar Size"].default_value = 0.02
    br.inputs["Brick Width"].default_value = 1.0
    br.inputs["Row Height"].default_value = 1.0
    nt.links.new(comb.outputs[0], br.inputs["Vector"])
    grime_mat(name, br.outputs["Color"], nt, b, grime)
    # grout is rough and recessed
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs["To Min"].default_value = rough
    mr.inputs["To Max"].default_value = 0.85
    nt.links.new(br.outputs["Fac"], mr.inputs["Value"])
    nt.links.new(mr.outputs["Result"], b.inputs["Roughness"])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.35
    inv = nt.nodes.new("ShaderNodeMath")
    inv.operation = "SUBTRACT"
    inv.inputs[0].default_value = 1.0
    nt.links.new(br.outputs["Fac"], inv.inputs[1])
    nt.links.new(inv.outputs[0], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m


def paint_mat(name, color, grime=0.6, scale=1.5):
    m = new_mat(name, color, rough=0.7)
    nt = m.node_tree
    b = principled(m)
    rgb = nt.nodes.new("ShaderNodeRGB")
    rgb.outputs[0].default_value = (*color, 1)
    grime_mat(name, rgb.outputs[0], nt, b, grime, scale)
    return m


def apple_skin_mat():
    m = new_mat("apple_skin", (0.55, 0.02, 0.02), rough=0.3, coat=0.6)
    nt = m.node_tree
    b = principled(m)
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 6.0
    noise.inputs["Detail"].default_value = 4
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.4
    ramp.color_ramp.elements[0].color = (0.62, 0.03, 0.02, 1)
    ramp.color_ramp.elements[1].position = 0.75
    ramp.color_ramp.elements[1].color = (0.75, 0.25, 0.04, 1)
    nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
    return m


def whirl_mat():
    """Toilet water with an animatable spiral (value node 'whirl_time')."""
    m = new_mat("water", (0.1, 0.28, 0.3), rough=0.05)
    nt = m.node_tree
    b = principled(m)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    grad = nt.nodes.new("ShaderNodeTexGradient")
    grad.gradient_type = "RADIAL"
    nt.links.new(tc.outputs["Object"], grad.inputs["Vector"])
    length = nt.nodes.new("ShaderNodeVectorMath")
    length.operation = "LENGTH"
    nt.links.new(tc.outputs["Object"], length.inputs[0])
    t = nt.nodes.new("ShaderNodeValue")
    t.name = "whirl_time"
    t.outputs[0].default_value = 0.0
    # spiral = angle*3 + dist*k + time
    m1 = nt.nodes.new("ShaderNodeMath"); m1.operation = "MULTIPLY"; m1.inputs[1].default_value = 3.0
    m2 = nt.nodes.new("ShaderNodeMath"); m2.operation = "MULTIPLY"; m2.inputs[1].default_value = 4.0
    a1 = nt.nodes.new("ShaderNodeMath"); a1.operation = "ADD"
    a2 = nt.nodes.new("ShaderNodeMath"); a2.operation = "ADD"
    fr = nt.nodes.new("ShaderNodeMath"); fr.operation = "FRACT"
    nt.links.new(grad.outputs["Fac"], m1.inputs[0])
    nt.links.new(length.outputs["Value"], m2.inputs[0])
    nt.links.new(m1.outputs[0], a1.inputs[0])
    nt.links.new(m2.outputs[0], a1.inputs[1])
    nt.links.new(a1.outputs[0], a2.inputs[0])
    nt.links.new(t.outputs[0], a2.inputs[1])
    nt.links.new(a2.outputs[0], fr.inputs[0])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.45
    ramp.color_ramp.elements[0].color = (0.05, 0.15, 0.17, 1)
    ramp.color_ramp.elements[1].position = 0.55
    ramp.color_ramp.elements[1].color = (0.16, 0.34, 0.36, 1)
    nt.links.new(fr.outputs[0], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
    return m, t


# ----------------------------------------------------------------------------
# object helpers
# ----------------------------------------------------------------------------

def link(o):
    bpy.context.scene.collection.objects.link(o)
    return o


def empty(name, parent=None, loc=(0, 0, 0), rot=(0, 0, 0)):
    o = link(bpy.data.objects.new(name, None))
    o.empty_display_size = 0.1
    o.parent = parent
    o.location = loc
    o.rotation_euler = rot
    return o


def shade_smooth(o):
    try:
        o.data.shade_smooth()
    except Exception:
        for p in o.data.polygons:
            p.use_smooth = True


def prim(kind, name, mat=None, parent=None, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1),
         smooth=True, bevel=0.0, subsurf=0, **kw):
    getattr(bpy.ops.mesh, f"primitive_{kind}_add")(**kw)
    o = bpy.context.active_object
    o.name = name
    o.parent = parent
    o.location = loc
    o.rotation_euler = rot
    o.scale = scale
    if mat:
        o.data.materials.append(mat)
    if smooth:
        shade_smooth(o)
    if bevel:
        md = o.modifiers.new("bevel", "BEVEL")
        md.width = bevel
        md.segments = 3
        md.limit_method = "ANGLE"
    if subsurf:
        md = o.modifiers.new("subsurf", "SUBSURF")
        md.levels = subsurf
        md.render_levels = subsurf
    return o


def box(name, x0, x1, y0, y1, z0, z1, mat=None, bevel=0.0, parent=None):
    """Axis-aligned box whose object coordinates equal world coordinates."""
    me = bpy.data.meshes.new(name)
    v = [(x, y, z) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)]
    f = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    me.from_pydata(v, [], f)
    me.update()
    o = link(bpy.data.objects.new(name, me))
    o.parent = parent
    if mat:
        me.materials.append(mat)
    if bevel:
        md = o.modifiers.new("bevel", "BEVEL")
        md.width = bevel
        md.segments = 2
    return o


def text_obj(name, body, size, mat, parent=None, loc=(0, 0, 0), rot=(0, 0, 0)):
    bpy.ops.object.text_add()
    o = bpy.context.active_object
    o.name = name
    o.data.body = body
    o.data.size = size
    o.data.align_x = "CENTER"
    o.data.align_y = "CENTER"
    o.data.extrude = 0.002
    o.data.materials.append(mat)
    o.parent = parent
    o.location = loc
    o.rotation_euler = rot
    return o


# ----------------------------------------------------------------------------
# build: restroom set
# ----------------------------------------------------------------------------

def build_room(M):
    floor = tile_mat("floor_tiles", (0.42, 0.4, 0.34), (0.36, 0.34, 0.29), (0.08, 0.07, 0.05), 0.3,
                     ("x", "y"), grime=0.9)
    wall_t_xz = tile_mat("wall_tiles_xz", (0.62, 0.72, 0.68), (0.58, 0.68, 0.64), (0.25, 0.25, 0.22), 0.15,
                         ("x", "z"), grime=0.6, rough=0.15)
    wall_t_yz = tile_mat("wall_tiles_yz", (0.62, 0.72, 0.68), (0.58, 0.68, 0.64), (0.25, 0.25, 0.22), 0.15,
                         ("y", "z"), grime=0.6, rough=0.15)
    paint = paint_mat("wall_paint", (0.42, 0.5, 0.38), grime=0.75)
    ceil = paint_mat("ceiling", (0.5, 0.5, 0.47), grime=0.5)
    stall = paint_mat("stall_paint", (0.18, 0.3, 0.38), grime=0.55, scale=3.0)
    chrome = new_mat("chrome", (0.8, 0.8, 0.8), rough=0.15, metal=1.0)
    M.update(stall=stall, chrome=chrome)

    box("floor", -3.0, 3.0, -7.5, 3.0, -0.05, 0.0, floor)
    box("ceiling", -3.0, 3.0, -7.5, 3.0, 3.2, 3.3, ceil)
    # back wall
    box("back_low", -3.0, 3.0, 3.0, 3.1, 0.0, 1.4, wall_t_xz)
    box("back_high", -3.0, 3.0, 3.0, 3.1, 1.4, 3.2, paint)
    # side walls
    for nm, x0, x1 in (("left", -3.1, -3.0), ("right", 3.0, 3.1)):
        box(nm + "_low", x0, x1, -4.6, 3.0, 0.0, 1.4, wall_t_yz)
        box(nm + "_high", x0, x1, -4.6, 3.0, 1.4, 3.2, paint)
    # front wall with doorway (x -0.85..0.25, z < 2.2)
    box("front_l_low", -3.0, -0.85, -4.6, -4.5, 0.0, 1.4, wall_t_xz)
    box("front_l_high", -3.0, -0.85, -4.6, -4.5, 1.4, 3.2, paint)
    box("front_r_low", 0.25, 3.0, -4.6, -4.5, 0.0, 1.4, wall_t_xz)
    box("front_r_high", 0.25, 3.0, -4.6, -4.5, 1.4, 3.2, paint)
    box("front_top", -0.85, 0.25, -4.6, -4.5, 2.2, 3.2, paint)
    box("door_frame", -0.9, 0.3, -4.62, -4.48, 2.15, 2.25, chrome)
    # hallway beyond the door
    hall = paint_mat("hall_paint", (0.45, 0.38, 0.3), grime=0.5)
    box("hall_l", -1.6, -1.5, -7.5, -4.6, 0.0, 3.2, hall)
    box("hall_r", 0.9, 1.0, -7.5, -4.6, 0.0, 3.2, hall)
    box("hall_end", -1.6, 1.0, -7.6, -7.5, 0.0, 3.2, hall)

    # stalls: partitions at x = -1.9, -0.55, 0.55, 1.9 ; front at y = 1.4
    for i, x in enumerate((-1.9, -0.55, 0.55, 1.9)):
        box(f"partition_{i}", x - 0.02, x + 0.02, 1.4, 3.0, 0.25, 2.0, stall, bevel=0.01)
        box(f"pilaster_{i}", x - 0.06, x + 0.06, 1.37, 1.43, 0.0, 2.0, stall, bevel=0.01)
        box(f"rail_{i}", x - 0.06, x + 0.06, 1.38, 1.42, 2.0, 2.06, chrome)
    for i, x in enumerate((-2.95, 2.95)):
        box(f"pilaster_end_{i}", x - 0.05, x + 0.05, 1.37, 1.43, 0.0, 2.0, stall, bevel=0.01)
    box("head_rail", -3.0, 3.0, 1.38, 1.42, 2.0, 2.04, chrome)
    # side stall doors (closed) + one "out of order" sign
    box("door_left", -2.89, -0.61, 1.39, 1.42, 0.3, 1.95, stall, bevel=0.01)
    box("door_right", 0.61, 1.84, 1.39, 1.42, 0.3, 1.95, stall, bevel=0.01)
    box("door_far_right", 1.96, 2.89, 1.39, 1.42, 0.3, 1.95, stall, bevel=0.01)
    paper = new_mat("paper", (0.85, 0.82, 0.7), rough=0.9)
    red_ink = new_mat("red_ink", (0.5, 0.02, 0.02), rough=0.6)
    box("sign", -2.05, -1.45, 1.375, 1.385, 1.2, 1.5, paper)
    text_obj("sign_txt", "OUT OF\nORDER", 0.1, red_ink, loc=(-1.75, 1.372, 1.35), rot=(PI / 2, 0, 0))
    # centre stall door, hinged at x=-0.55 (opens outwards, -y)
    hinge = empty("door_hinge", loc=(-0.55, 1.405, 0.0))
    d = box("door_center", 0.03, 1.07, -0.015, 0.015, 0.3, 1.95, stall, bevel=0.01, parent=hinge)
    box("door_knob", 0.95, 1.0, -0.06, -0.015, 1.0, 1.06, chrome, parent=hinge)
    M["door_hinge"] = hinge

    # sinks + mirror on the left wall
    porcelain = M["porcelain"]
    for i, y in enumerate((-2.6, -1.2)):
        prim("cube", f"sink_{i}", porcelain, loc=(-2.78, y, 0.85), scale=(0.22, 0.3, 0.08), bevel=0.04)
        prim("cylinder", f"tap_{i}", chrome, loc=(-2.92, y, 0.98), scale=(0.02, 0.02, 0.07),
             vertices=16)
    mirror = new_mat("mirror", (0.9, 0.9, 0.9), rough=0.03, metal=1.0)
    box("mirror", -2.99, -2.97, -3.1, -0.7, 1.25, 2.05, mirror)
    box("mirror_frame", -3.0, -2.98, -3.15, -0.65, 1.2, 2.1, chrome)
    # trash can + a puddle
    bin_m = new_mat("bin", (0.25, 0.27, 0.27), rough=0.35, metal=0.8)
    prim("cylinder", "trash", bin_m, loc=(2.6, -2.0, 0.3), scale=(0.2, 0.2, 0.3), vertices=24)
    puddle = new_mat("puddle", (0.2, 0.19, 0.15), rough=0.04)
    prim("cylinder", "puddle", puddle, loc=(0.6, -1.1, 0.002), scale=(0.5, 0.35, 0.002), vertices=32)
    # hand dryer
    prim("cube", "dryer", chrome, loc=(2.9, -0.5, 1.2), scale=(0.1, 0.15, 0.13), bevel=0.03)

    # light fixtures (emissive boxes) - fixture 1 flickers
    fx_mats = []
    for i, y in enumerate((1.0, -2.4)):
        fm = new_mat(f"fixture_{i}", (1, 1, 1), emit=(0.85, 1.0, 0.9), strength=12.0)
        fx_mats.append(fm)
        box(f"fixture_{i}", -0.7, 0.7, y - 0.12, y + 0.12, 3.12, 3.2, fm)
    M["fixture_mats"] = fx_mats


def build_lights(M):
    sc = bpy.context.scene
    world = bpy.data.worlds.new("world")
    sc.world = world
    try:
        world.use_nodes = True
    except Exception:
        pass
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.012, 0.014, 0.013, 1)

    def area(name, loc, size, energy, color, rot=(0, 0, 0)):
        ld = bpy.data.lights.new(name, "AREA")
        ld.shape = "RECTANGLE"
        ld.size, ld.size_y = size
        ld.energy = energy
        ld.color = color
        o = link(bpy.data.objects.new(name, ld))
        o.location = loc
        o.rotation_euler = rot
        return o

    M["light_stall"] = area("light_stall", (0, 1.0, 3.1), (1.4, 0.24), 420, (0.88, 1.0, 0.9))
    M["light_entry"] = area("light_entry", (0, -2.4, 3.1), (1.4, 0.24), 380, (0.88, 1.0, 0.9))
    area("light_hall", (-0.3, -6.3, 3.1), (1.0, 1.0), 260, (1.0, 0.72, 0.45))
    pd = bpy.data.lights.new("stall_fill", "POINT")
    pd.energy = 35
    pd.color = (1.0, 0.95, 0.85)
    pd.shadow_soft_size = 0.4
    o = link(bpy.data.objects.new("stall_fill", pd))
    o.location = (0.0, 1.9, 2.3)
    M["stall_fill"] = o
    # a soft fill from the camera side so faces don't go black
    fd = bpy.data.lights.new("front_fill", "AREA")
    fd.size = 2.5
    fd.energy = 60
    fd.color = (0.8, 0.9, 1.0)
    o = link(bpy.data.objects.new("front_fill", fd))
    o.location = (0.8, -0.6, 1.6)
    o.rotation_euler = (math.radians(80), 0, math.radians(20))


# ----------------------------------------------------------------------------
# build: toilet (with high pull-chain cistern)
# ----------------------------------------------------------------------------

def build_toilet(M):
    porcelain = M["porcelain"]
    black = new_mat("seat_black", (0.02, 0.02, 0.02), rough=0.25, coat=0.5)
    iron = new_mat("cast_iron", (0.04, 0.09, 0.06), rough=0.35, metal=0.7)
    brass = new_mat("brass", (0.6, 0.45, 0.2), rough=0.25, metal=1.0)
    wood = new_mat("wood", (0.25, 0.12, 0.05), rough=0.5)
    water, whirl_node = whirl_mat()
    M.update(wood=wood, brass=brass, whirl_node=whirl_node)

    root = empty("toilet", loc=(0, 2.55, 0))
    prim("cylinder", "pedestal", porcelain, root, loc=(0, 0.0, 0.13), scale=(0.16, 0.2, 0.13), vertices=32)
    prim("cylinder", "foot", porcelain, root, loc=(0, 0.0, 0.015), scale=(0.21, 0.26, 0.015), vertices=32)
    bowl = prim("cone", "bowl", porcelain, root, loc=(0, -0.05, 0.3), scale=(1, 1.3, 1),
                vertices=40, radius1=0.16, radius2=0.24, depth=0.3, end_fill_type="NOTHING")
    md = bowl.modifiers.new("solid", "SOLIDIFY")
    md.thickness = 0.025
    prim("torus", "rim", porcelain, root, loc=(0, -0.05, 0.45), scale=(1, 1.3, 1),
         major_radius=0.235, minor_radius=0.03, major_segments=48, minor_segments=12)
    prim("cylinder", "water", water, root, loc=(0, -0.05, 0.40), scale=(0.215, 0.215 * 1.3, 0.005),
         vertices=48)
    prim("torus", "seat", black, root, loc=(0, -0.05, 0.49), scale=(1, 1.3, 0.6),
         major_radius=0.215, minor_radius=0.025, major_segments=48, minor_segments=10)
    lid_hinge = empty("lid_hinge", root, loc=(0, 0.24, 0.51))
    prim("cylinder", "lid", black, lid_hinge, loc=(0, -0.29, 0.0), scale=(0.25, 0.25 * 1.3, 0.014),
         vertices=48, bevel=0.008)
    prim("cylinder", "hinge_bar", M["chrome"], root, loc=(0, 0.25, 0.505), rot=(0, PI / 2, 0),
         scale=(0.018, 0.018, 0.12), vertices=12)
    # high cistern, pipe, lever, chain
    prim("cube", "cistern", iron, None, loc=(0, 2.88, 2.05), scale=(0.3, 0.11, 0.16), bevel=0.03)
    prim("cube", "cistern_lid", iron, None, loc=(0, 2.87, 2.23), scale=(0.33, 0.13, 0.02), bevel=0.01)
    prim("cylinder", "pipe", M["chrome"], None, loc=(0, 2.92, 1.2), scale=(0.025, 0.025, 0.7),
         vertices=16)
    prim("cylinder", "pipe_elbow", M["chrome"], None, loc=(0, 2.86, 0.5), rot=(PI / 2, 0, 0),
         scale=(0.03, 0.03, 0.07), vertices=16)
    prim("cylinder", "lever", brass, None, loc=(0.25, 2.69, 2.0), rot=(PI / 2, 0, 0),
         scale=(0.012, 0.012, 0.12), vertices=12)
    chain = prim("cylinder", "chain", brass, None, scale=(0.008, 0.008, 0.5), vertices=8)
    handle = empty("chain_handle")
    prim("cylinder", "chain_grip", wood, handle, loc=(0, 0, -0.06), scale=(0.025, 0.025, 0.06),
         vertices=16, bevel=0.01)
    M.update(toilet=root, lid_hinge=lid_hinge, chain=chain, chain_handle=handle)
    M["chain_top"] = Vector((0.25, 2.58, 1.99))
    M["chain_rest"] = Vector((0.25, 2.58, 1.33))


# ----------------------------------------------------------------------------
# build: Sakadung (the singing toilet head)
# ----------------------------------------------------------------------------

def build_sakadung(M):
    skin = new_mat("sak_skin", (0.8, 0.47, 0.33), rough=0.45, sss=0.15)
    white = new_mat("eye_white", (0.9, 0.9, 0.88), rough=0.15, coat=0.5)
    black = new_mat("pupil", (0.01, 0.01, 0.01), rough=0.1, coat=1.0)
    brow = new_mat("brow", (0.05, 0.03, 0.02), rough=0.8)
    mouth = new_mat("mouth", (0.12, 0.01, 0.015), rough=0.6)
    head = empty("sak_head")
    prim("uv_sphere", "sak_skull", skin, head, scale=(0.17, 0.162, 0.195),
         segments=48, ring_count=24)
    eyes = []
    for side, x in (("L", 0.062), ("R", -0.062)):
        e = prim("uv_sphere", f"sak_eye_{side}", white, head, loc=(x, -0.128, 0.045),
                 scale=(0.045, 0.045, 0.05), segments=24, ring_count=12)
        # pupil is a child so rotating the eye moves it
        p = prim("uv_sphere", f"sak_pupil_{side}", black, e, loc=(0, -0.8, 0), scale=(0.45, 0.3, 0.45),
                 segments=16, ring_count=8)
        eyes.append(e)
        prim("cube", f"sak_ear_{side}", skin, head, loc=(x * 2.75, 0.0, 0.0), scale=(0.02, 0.035, 0.05),
             subsurf=2)
    brows = []
    for side, x in (("L", 0.062), ("R", -0.062)):
        bpiv = empty(f"sak_brow_{side}", head, loc=(x, -0.152, 0.112))
        prim("cube", f"sak_brow_mesh_{side}", brow, bpiv, scale=(0.045, 0.012, 0.014), bevel=0.006)
        brows.append(bpiv)
    prim("uv_sphere", "sak_nose", skin, head, loc=(0, -0.17, -0.005), scale=(0.032, 0.045, 0.034),
         segments=24, ring_count=12)
    m = prim("uv_sphere", "sak_mouth", mouth, head, loc=(0, -0.138, -0.085), scale=(0.065, 0.04, 0.01),
             segments=24, ring_count=12)
    prim("torus", "sak_curl", brow, head, loc=(0, -0.02, 0.2), rot=(PI / 2, 0, 0),
         major_radius=0.03, minor_radius=0.009)
    # neck = bevelled bezier curve, keyed every frame
    cu = bpy.data.curves.new("sak_neck", "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = 0.065
    cu.bevel_resolution = 4
    cu.use_fill_caps = True
    sp = cu.splines.new("BEZIER")
    sp.bezier_points.add(2)
    for p in sp.bezier_points:
        p.handle_left_type = p.handle_right_type = "FREE"
    neck = link(bpy.data.objects.new("sak_neck", cu))
    cu.materials.append(skin)
    M.update(sak_head=head, sak_eyes=eyes, sak_brows=brows, sak_mouth=m, sak_neck=neck)


# ----------------------------------------------------------------------------
# build: Agent Apple
# ----------------------------------------------------------------------------

def build_apple(M):
    suit = new_mat("suit", (0.025, 0.03, 0.07), rough=0.6)
    shirt = new_mat("shirt", (0.85, 0.85, 0.85), rough=0.6)
    tie = new_mat("tie", (0.45, 0.02, 0.02), rough=0.4)
    shoe = new_mat("shoe", (0.01, 0.01, 0.01), rough=0.15, coat=1.0)
    glove = new_mat("glove", (0.9, 0.9, 0.88), rough=0.5)
    glass = new_mat("shades", (0.0, 0.0, 0.0), rough=0.03, coat=1.0)
    brown = new_mat("stem", (0.18, 0.09, 0.03), rough=0.7)
    leaf_m = new_mat("leaf", (0.08, 0.3, 0.04), rough=0.4, sss=0.2)
    skin = apple_skin_mat()

    root = empty("apple")
    hips = empty("apple_hips", root, loc=(0, 0, 0.0))
    legs = []
    for side, x in (("L", 0.1), ("R", -0.1)):
        piv = empty(f"apple_leg_{side}", hips, loc=(x, 0, 0.86))
        prim("cylinder", f"apple_leg_mesh_{side}", suit, piv, loc=(0, 0, -0.41), scale=(0.075, 0.075, 0.41),
             vertices=20)
        prim("cube", f"apple_shoe_{side}", shoe, piv, loc=(0, -0.05, -0.82), scale=(0.065, 0.14, 0.045),
             bevel=0.03)
        legs.append(piv)
    torso = empty("apple_torso", hips, loc=(0, 0, 0.86))
    prim("cylinder", "apple_body", suit, torso, loc=(0, 0, 0.3), scale=(0.22, 0.15, 0.31), vertices=32)
    prim("uv_sphere", "apple_shoulders", suit, torso, loc=(0, 0, 0.58), scale=(0.24, 0.155, 0.09),
         segments=32, ring_count=12)
    prim("cube", "apple_shirt", shirt, torso, loc=(0, -0.143, 0.5), scale=(0.06, 0.012, 0.12))
    prim("cube", "apple_tie", tie, torso, loc=(0, -0.153, 0.46), scale=(0.022, 0.01, 0.13), bevel=0.005)
    prim("cylinder", "apple_collar", shirt, torso, loc=(0, 0, 0.66), scale=(0.1, 0.1, 0.035), vertices=24)
    arms, hands = [], []
    for side, x in (("L", 0.27), ("R", -0.27)):
        sh = empty(f"apple_arm_{side}", torso, loc=(x, 0, 0.55))
        prim("cylinder", f"apple_arm_mesh_{side}", suit, sh, loc=(0, 0, -0.29), scale=(0.058, 0.058, 0.29),
             vertices=20)
        prim("uv_sphere", f"apple_glove_{side}", glove, sh, loc=(0, 0, -0.62), scale=(0.075, 0.075, 0.08),
             segments=20, ring_count=10)
        hand = empty(f"apple_hand_{side}", sh, loc=(0, 0, -0.62))
        arms.append(sh)
        hands.append(hand)
    head = empty("apple_head", torso, loc=(0, 0, 0.67))
    ap = prim("uv_sphere", "apple_fruit", skin, head, loc=(0, 0, 0.3), scale=(1, 1, 0.92),
              segments=64, ring_count=32, radius=0.3)
    # dimples at the top and bottom of the apple
    for v in ap.data.vertices:
        r2 = v.co.x ** 2 + v.co.y ** 2
        k = math.exp(-r2 / (0.11 ** 2))
        if v.co.z > 0:
            v.co.z -= 0.075 * k
        else:
            v.co.z += 0.04 * k
    prim("cylinder", "apple_stem", brown, head, loc=(0.01, 0, 0.6), rot=(0, 0.25, 0),
         scale=(0.016, 0.016, 0.07), vertices=12)
    leaf_piv = empty("apple_leaf", head, loc=(0.025, 0, 0.6))
    prim("uv_sphere", "apple_leaf_mesh", leaf_m, leaf_piv, loc=(0.085, 0, 0.02), rot=(0, -0.35, 0.3),
         scale=(0.09, 0.04, 0.008), segments=24, ring_count=12)
    shades = empty("apple_shades", head, loc=(0, -0.275, 0.33))
    for side, x in (("L", 0.095), ("R", -0.095)):
        prim("cylinder", f"apple_lens_{side}", glass, shades, loc=(x, -0.005, 0), rot=(PI / 2, 0, x * 1.5),
             scale=(0.085, 0.06, 0.012), vertices=32, bevel=0.004)
    prim("cube", "apple_bridge", glass, shades, loc=(0, -0.012, 0.015), scale=(0.03, 0.006, 0.008))
    brows = []
    for side, x in (("L", 0.095), ("R", -0.095)):
        bp = empty(f"apple_brow_{side}", head, loc=(x, -0.27, 0.43))
        prim("cube", f"apple_brow_mesh_{side}", brown, bp, scale=(0.055, 0.012, 0.012), bevel=0.005)
        brows.append(bp)
    prim("cube", "apple_mouth", brown, head, loc=(0.025, -0.288, 0.17), rot=(0, 0.15, 0.12),
         scale=(0.045, 0.008, 0.007), bevel=0.003)
    M.update(apple=root, apple_hips=hips, apple_legs=legs, apple_torso=torso, apple_arms=arms,
             apple_hands=hands, apple_head=head, apple_leaf=leaf_piv, apple_shades=shades,
             apple_brows=brows)


def build_plunger(M):
    rubber = new_mat("rubber", (0.45, 0.015, 0.015), rough=0.45, coat=0.3)
    root = empty("plunger")
    root.rotation_mode = "QUATERNION"
    prim("cylinder", "plunger_stick", M["wood"], root, loc=(0, 0, 0.175), scale=(0.018, 0.018, 0.375),
         vertices=16)
    cup = prim("cone", "plunger_cup", rubber, root, loc=(0, 0, 0.6), vertices=32, radius1=0.04,
               radius2=0.11, depth=0.09, end_fill_type="NOTHING")
    md = cup.modifiers.new("solid", "SOLIDIFY")
    md.thickness = 0.012
    M["plunger"] = root


def build_droplets(M):
    water = new_mat("droplet", (0.5, 0.75, 0.8), rough=0.02)
    drops = []
    for i in range(10):
        d = prim("uv_sphere", f"drop_{i}", water, None, segments=12, ring_count=6, radius=0.018)
        drops.append(d)
    M["drops"] = drops


# ----------------------------------------------------------------------------
# keyframe helpers
# ----------------------------------------------------------------------------

def key(obj, path, value, f):
    setattr(obj, path, value)
    obj.keyframe_insert(path, frame=f)


def key_socket(sock, value, f):
    sock.default_value = value
    sock.keyframe_insert("default_value", frame=f)


def key_hidden(obj, hidden, f):
    obj.hide_render = hidden
    obj.keyframe_insert("hide_render", frame=f)
    for c in obj.children_recursive:
        c.hide_render = hidden
        c.keyframe_insert("hide_render", frame=f)


# ----------------------------------------------------------------------------
# animation: per-frame state functions
# ----------------------------------------------------------------------------

MOUTH = T.mouth_events()
VOWEL = {"sa": (1.0, 1.0), "ka": (1.0, 0.95), "ba": (1.0, 1.0), "ap": (1.05, 0.9), "dung": (0.85, 0.75),
         "huh": (0.9, 0.85), "dip": (1.3, 0.45), "ple": (1.15, 0.55), "loo": (0.65, 0.95),
         "doo": (0.65, 1.0), "go": (0.7, 0.9), "home": (0.7, 0.85), "noo": (0.6, 1.3), "yeah": (1.1, 0.95),
         "mm": (1.0, 0.0)}


def mouth_at(t):
    open_, width = 0.0, 1.0
    for e in MOUTH:
        if e["t"] - 0.03 <= t <= e["t"] + e["d"] + 0.06:
            w, h = VOWEL.get(e["syl"], (1.0, 1.0))
            a = clamp((t - e["t"] + 0.03) / 0.05)
            r = clamp((e["t"] + e["d"] + 0.06 - t) / 0.08)
            env = min(a, r) * (0.85 + 0.15 * math.cos(t * 40))
            o = env * h * e.get("loud", 1.0)
            if o > open_:
                open_, width = o, lerp(1.0, w, env)
    return open_, width


SING_BASE = Vector((0, 2.5, 1.25))
LEAN = Vector((0, 1.56, 1.30))
DROOP = Vector((-0.2, 2.52, 0.95))
WATER = Vector((0, 2.5, 0.40))


def music_beat(t):
    """Returns (phase in beats, on) for the bob, while music plays."""
    for a, b in (T.MUSIC_A, T.MUSIC_B):
        if a <= t < b:
            return (t - a) / T.BEAT, True
    return 0.0, False


def sakadung_state(f):
    t = f / T.FPS
    s = {"pos": Vector((0, 2.5, 0.1)), "rot": Vector((0, 0, 0)), "scale": 1.0, "hidden": False,
         "brow_z": 0.0, "brow_rot": 0.0, "look": (0.0, 0.0), "mouth": mouth_at(t)}
    r0, r1 = T.HEAD_RISE_F
    if f < r0 or f >= T.SPIN_DOWN_F[1]:
        s["hidden"] = True
        s["scale"] = 0.01
        return s
    beat, on = music_beat(t)
    bob = Vector((0, 0, 0.05 * abs(math.sin(PI * beat)))) if on else Vector()
    sway = Vector((0.12 * math.sin(PI * beat), 0, 0.0)) if on else Vector()
    nod = 0.1 * math.sin(2 * PI * beat) if on else 0.0
    if f < r1 + 1:  # spring up out of the bowl
        k = ease_out_back(prog(f, r0, r1 - 4), 2.4)
        s["pos"] = vlerp((0, 2.5, 0.1), SING_BASE, k)
        s["scale"] = lerp(0.3, 1.0, clamp((f - r0) / 3.0))
        s["rot"] = Vector((0, 0, 0.6 * (1 - k)))
        s["brow_z"] = 0.02
        return s
    if f < T.SCRATCH_F:  # verse A
        s["pos"] = SING_BASE + bob
        s["rot"] = Vector((nod, sway.x, 0.08 * math.sin(PI * beat / 2)))
        s["brow_z"] = 0.015 * abs(math.sin(PI * beat))
        s["look"] = (0.0, 0.1 * math.sin(t * 2))
        return s
    if f < T.MUSIC_B[0] * T.FPS:  # freeze, notice Apple, "huh?"
        s["pos"] = SING_BASE
        k = prog(f, T.SCRATCH_F, T.SCRATCH_F + 6)
        s["rot"] = Vector((0.1 * k, 0, -0.12 * k))
        s["look"] = (0.25 * k, -0.15 * k)
        s["brow_z"] = 0.03 * prog(f, T.HUH_F - 2, T.HUH_F + 2)
        return s
    if f < T.THRUST_F[1]:  # verse B: leans out at Apple, angry
        k = smooth(prog(f, 457, 500))
        s["pos"] = vlerp(SING_BASE, LEAN, k) + bob * 0.6
        s["rot"] = Vector((nod * 0.7 - 0.15 * k, sway.x * 0.6, 0))
        s["brow_rot"] = 0.35
        s["brow_z"] = -0.012
        s["look"] = (0.0, -0.1)
        return s
    if f < T.YANK_F[1]:  # plunger stuck on the face
        hit = (f - T.THRUST_F[1]) / T.FPS
        pull = smooth(prog(f, T.YANK_F[0], T.YANK_F[1]))
        s["pos"] = LEAN + Vector((0, 0.06 * (1 - spring(hit, 3, 6)), 0)) + Vector((0, -0.18 * pull, 0.08 * pull))
        s["rot"] = Vector((0, 0, 0.25 * math.sin(f * 1.7) * (1 - pull)))
        s["brow_z"] = 0.03
        s["look"] = (0.0, 0.0)
        return s
    if f < T.SPIN_DOWN_F[0]:  # POP! snaps back, dizzy
        dt = (f - T.YANK_F[1]) / T.FPS
        k = smooth(prog(f, T.YANK_F[1], T.YANK_F[1] + 10))
        base = vlerp(LEAN + Vector((0, -0.18, 0.08)), DROOP, k)
        wob = spring(dt, 2.5, 2.5)
        s["pos"] = base + Vector((0.06 * wob, 0.0, 0.03 * wob))
        s["rot"] = Vector((0.25, 0.35 * math.sin(dt * 7), 0.3 * math.sin(dt * 5)))
        ang = dt * 14
        s["look"] = (0.35 * math.cos(ang), 0.35 * math.sin(ang))
        s["brow_z"] = 0.02
        s["brow_rot"] = -0.25
        return s
    # flushed: spin and shrink into the bowl
    k = prog(f, T.SPIN_DOWN_F[0], T.SPIN_DOWN_F[1])
    sp = k * k
    s["pos"] = vlerp(DROOP, (0, 2.5, 0.12), sp)
    s["rot"] = Vector((0.2, 0, 22 * sp))
    s["scale"] = lerp(1.0, 0.45, sp)
    s["look"] = (0.4 * math.cos(f), 0.4 * math.sin(f))
    s["brow_z"] = 0.035
    return s


APPLE_STAND = Vector((-0.27, -2.0, 0))
APPLE_FRONT = Vector((-0.27, 0.0, 0))
APPLE_CHAIN = Vector((-0.02, 1.94, 0))


def walk_cycle(f, f0, f1, a, b):
    k = prog(f, f0, f1)
    pos = vlerp(a, b, k)
    walking = f0 <= f < f1
    ph = 2 * PI * (f - f0) / 24.0
    swing = 0.45 * math.sin(ph) if walking else 0.0
    bob = 0.03 * abs(math.sin(ph)) if walking else 0.0
    return pos, swing, bob


def apple_state(f):
    s = {"pos": Vector((-0.3, -5.6, 0)), "rz": PI, "legs": (0.0, 0.0), "arms": [0.05, 0.05],
         "arm_out": [-0.08, 0.08], "torso_rx": 0.0, "head_rz": 0.0, "brow_rot": 0.0, "brow_z": 0.0,
         "leaf": 0.0, "head_squash": 1.0, "shades_z": 0.0, "bob": 0.0}
    w0, w1 = T.APPLE_WALK_F
    if f < 457:
        pos, sw, bob = walk_cycle(f, w0, w1, (-0.3, -5.4, 0), APPLE_STAND)
    elif f < T.APPLE_WALK2_F[0]:
        pos, sw, bob = walk_cycle(f, 457, 490, APPLE_STAND, APPLE_FRONT)
    else:
        pos, sw, bob = walk_cycle(f, *T.APPLE_WALK2_F, APPLE_FRONT + Vector((0, -0.05, 0)), APPLE_CHAIN)
    s["pos"], s["bob"] = pos, bob
    s["legs"] = (sw, -sw)
    s["arms"] = [0.05 - 0.6 * sw, 0.05 + 0.35 * sw]           # left swings fully, right holds plunger
    # angry glare from the scratch onwards
    ang = smooth(prog(f, T.APPLE_ANGRY_F, T.APPLE_ANGRY_F + 4))
    s["brow_rot"] = 0.4 * ang
    s["brow_z"] = -0.015 * ang
    s["leaf"] = 0.5 * math.sin((f - 418) * 1.3) * math.exp(-max(0, f - 418) / 6.0) if f >= 418 else 0.0
    # raise plunger, thrust, yank, toss
    if T.PLUNGER_RAISE_F[0] <= f < T.TOSS_F[0]:
        k = smooth(prog(f, *T.PLUNGER_RAISE_F))
        s["arms"][1] = lerp(0.05, PI / 2, k)
        s["arm_out"][1] = lerp(0.08, 0.0, k)
    if T.THRUST_F[0] <= f < T.APPLE_WALK2_F[0]:
        lunge = smooth(prog(f, *T.THRUST_F))
        back = smooth(prog(f, *T.YANK_F))
        s["pos"] = APPLE_FRONT + Vector((0, 0.1 * lunge - 0.15 * back, 0))
        s["torso_rx"] = 0.12 * lunge - 0.12 * back
    if T.TOSS_F[0] <= f < T.TOSS_F[1] + 4:
        k = smooth(prog(f, *T.TOSS_F))
        s["arms"][1] = lerp(PI / 2, 3.3, k) if f < T.TOSS_F[1] else lerp(3.3, 0.05, prog(f, T.TOSS_F[1], T.TOSS_F[1] + 4))
    # chain pull
    if f >= T.APPLE_WALK2_F[1]:
        reach = smooth(prog(f, 592, 597))
        pull = smooth(prog(f, T.CHAIN_YANK_F - 2, T.CHAIN_YANK_F + 2)) - smooth(prog(f, 606, 610))
        rel = smooth(prog(f, 612, 618))
        a = lerp(0.05, math.radians(80), reach) - math.radians(25) * pull
        s["arms"][1] = lerp(a, 0.05, rel)
        s["arm_out"][1] = 0.0
        s["torso_rx"] = 0.1 * reach * (1 - rel) + 0.12 * smooth(prog(f, 625, 640))
    # turn to camera, push shades up, bonk
    if f >= T.APPLE_TURN_F[0]:
        s["rz"] = lerp(PI, 2 * PI, smooth(prog(f, *T.APPLE_TURN_F)))
        s["torso_rx"] = 0.0
        g = prog(f, *T.GLASSES_F)
        up = math.sin(PI * g)
        s["arms"][1] = lerp(0.05, 2.55, up)
        s["arm_out"][1] = lerp(0.0, 0.32, up)
        s["shades_z"] = 0.02 * smooth(prog(f, 691, 694)) * (1 - smooth(prog(f, 696, 699)))
        dt = (f - T.PLUNGER_FALL_F[1]) / T.FPS
        if dt >= 0:
            s["head_squash"] = 1.0 - 0.15 * spring(dt, 4, 5)
            s["brow_rot"] = lerp(0.4, -0.2, smooth(prog(f, 702, 706)))
            s["brow_z"] = 0.02 * smooth(prog(f, 702, 706))
        if f >= 709:
            s["head_rz"] = 0.5 * smooth(prog(f, 709, 714))
    return s


def chain_handle_pos(f, hand_world):
    rest = Vector((0.25, 2.58, 1.33))
    if 595 <= f < 612 and hand_world is not None:
        return hand_world + Vector((0, 0, 0.04))
    if f >= 612:
        dt = (f - 612) / T.FPS
        return rest + Vector((0, 0.06 * spring(dt, 1.5, 2.0), 0))
    return rest


def flicker(f):
    for a, b in ((14, 30), (95, 104), (405, 412), (622, 652), (698, 703)):
        if a <= f <= b:
            return 0.12 if hash01(f // 2 + a) < 0.45 else 1.0
    return 1.0


# ----------------------------------------------------------------------------
# cameras
# ----------------------------------------------------------------------------

def camera_plan(f, M, sak, app):
    """Returns {cam_name: (eye, target, lens, roll)} for the shot containing f."""
    t = f / T.FPS
    for (a, b, name) in T.SHOTS:
        if a <= f <= b:
            k = prog(f, a, b)
            break
    head = sak["pos"]
    apple_head = app["pos"] + Vector((0, 0, 1.83))
    if name == "cam_establish":
        eye = vlerp((1.5, -4.2, 1.6), (0.9, -2.9, 1.5), smooth(k)) + shake(f, 0.015)
        return name, eye, (0, 2.2, 0.55), 18, 0.0
    if name == "cam_stall":
        eye = vlerp((0.95, -0.55, 1.35), (0.72, -0.2, 1.25), k) + shake(f, 0.01, 1.3, 2)
        return name, eye, (0.0, 2.3, 0.75), 28, 0.0
    if name == "cam_toilet_cu":
        rise = smooth(prog(f, T.HEAD_RISE_F[0], T.HEAD_RISE_F[1]))
        jolt = shake(f, 0.03 * clamp(1 - (f - 169) / 10.0) if f >= 169 else 0.0, 8, 1)
        eye = Vector((0.12, 1.3, lerp(0.85, 1.05, rise))) + jolt
        return name, eye, (0, 2.5, lerp(0.5, 1.15, rise)), 24, 0.0
    if name == "cam_hero_low":
        ang = lerp(-0.45, 0.45, smooth(k))
        eye = Vector((0.9 * math.sin(ang), 2.5 - 0.9 * math.cos(ang), 0.55))
        return name, eye, (0, 2.5, 1.22), 20, 0.05 * math.sin(t * 3)
    if name == "cam_entrance":
        tgt = app["pos"] + Vector((0, 0, 1.35))
        eye = Vector((0.85, -1.05, 1.3)) + shake(f, 0.01, 1, 4)
        return name, eye, tgt, 26, 0.0
    if name == "cam_apple_cu":
        eye = vlerp(apple_head + Vector((0.12, 1.05, 0.02)), apple_head + Vector((0.08, 0.8, 0.0)), smooth(k))
        return name, eye, apple_head + Vector((0, 0, 0.02)), 35, 0.0
    if name == "cam_head_cu":
        eye = vlerp((0.1, 1.75, 1.3), (0.07, 1.85, 1.28), k)
        return name, eye, head + Vector((0, 0, 0.02)), 35, 0.0
    if name == "cam_ots":
        eye = app["pos"] + Vector((0.62, -0.95, 2.0)) + shake(f, 0.012, 1.5, 6)
        return name, eye, head, 26, 0.0
    if name == "cam_side":
        eye = Vector((1.55, -0.55, 1.5)) + shake(f, 0.02 if 545 <= f < 552 else 0.006, 6, 7)
        return name, eye, (-0.05, 1.0, 1.3), 22, 0.0
    if name == "cam_chain_cu":
        return name, Vector((0.5, 2.22, 1.48)), (0.2, 2.6, 1.32), 28, 0.0
    if name == "cam_flush_high":
        eye = Vector((0.4, 2.3, 2.25)) + shake(f, 0.015, 3, 8)
        return name, eye, (0.0, 2.45, 0.45), 28, 0.1
    # outro
    eye = vlerp((0.12, 0.3, 1.6), (0.1, 0.45, 1.62), smooth(k))
    return name, eye, (-0.02, 1.94, 1.75), 26, 0.0


# ----------------------------------------------------------------------------
# bake everything
# ----------------------------------------------------------------------------

def bake(M):
    sc = bpy.context.scene
    cams = {}
    for (_, _, name) in T.SHOTS:
        cd = bpy.data.cameras.new(name)
        cd.sensor_width = 36
        cd.clip_start = 0.02
        cams[name] = link(bpy.data.objects.new(name, cd))
    for (a, _, name) in T.SHOTS:
        mk = sc.timeline_markers.new(name, frame=a)
        mk.camera = cams[name]
    sc.camera = cams[T.SHOTS[0][2]]

    head, neck = M["sak_head"], M["sak_neck"]
    pts = neck.data.splines[0].bezier_points
    apple = M["apple"]
    lid, door = M["lid_hinge"], M["door_hinge"]
    whirl = M["whirl_node"].outputs[0]
    prev_hidden = None
    drops = M["drops"]
    import random
    rnd = random.Random(7)
    vel = [Vector((rnd.uniform(-1, 1), rnd.uniform(-1.2, 0.4), rnd.uniform(2.0, 3.4))) for _ in drops]

    for f in range(1, T.FRAMES + 1):
        sak = sakadung_state(f)
        app = apple_state(f)
        # --- Sakadung
        key(head, "location", sak["pos"], f)
        key(head, "rotation_euler", Euler(sak["rot"]), f)
        sc_ = sak["scale"]
        key(head, "scale", (sc_, sc_, sc_), f)
        if sak["hidden"] != prev_hidden:
            key_hidden(head, sak["hidden"], f)
            key_hidden(neck, sak["hidden"], f)
            prev_hidden = sak["hidden"]
        o, w = sak["mouth"]
        key(M["sak_mouth"], "scale", (0.065 * w, 0.04, 0.008 + 0.06 * o), f)
        for i, b in enumerate(M["sak_brows"]):
            sgn = 1 if i == 0 else -1
            key(b, "location", (b.location.x, -0.152, 0.112 + sak["brow_z"]), f)
            key(b, "rotation_euler", (0, sgn * sak["brow_rot"], 0), f)
        lx, ly = sak["look"]
        for e in M["sak_eyes"]:
            key(e, "rotation_euler", (lx, 0, ly), f)
        # neck from the water up under the chin
        top = sak["pos"] + Vector((0, 0.02, -0.15 * sak["scale"]))
        base = WATER + Vector((0, 0, -0.08))
        L = (top - base).length
        mid = (base + top) / 2 + Vector((0.04 * math.sin(f * 0.13), 0, 0))
        co = [base, mid, top]
        hl = [base - Vector((0, 0, L / 4)), mid - (top - base) / 4, top - Vector((0, 0, L / 5)) - (top - base) * 0.1]
        hr = [base + Vector((0, 0, L / 3)), mid + (top - base) / 4, top + Vector((0, 0, L / 5))]
        for p, c, a, b in zip(pts, co, hl, hr):
            p.co, p.handle_left, p.handle_right = c, a, b
            p.keyframe_insert("co", frame=f)
            p.keyframe_insert("handle_left", frame=f)
            p.keyframe_insert("handle_right", frame=f)
        # --- Agent Apple
        key(apple, "location", app["pos"], f)
        key(apple, "rotation_euler", (0, 0, app["rz"]), f)
        key(M["apple_hips"], "location", (0, 0, app["bob"]), f)
        for leg, a in zip(M["apple_legs"], app["legs"]):
            key(leg, "rotation_euler", (-a, 0, 0), f)
        for arm, a, out in zip(M["apple_arms"], app["arms"], app["arm_out"]):
            key(arm, "rotation_euler", (-a, out, 0), f)
        key(M["apple_torso"], "rotation_euler", (app["torso_rx"], 0, 0), f)
        key(M["apple_head"], "rotation_euler", (0, 0, app["head_rz"]), f)
        hs = app["head_squash"]
        key(M["apple_head"], "scale", (1 / math.sqrt(hs), 1 / math.sqrt(hs), hs), f)
        key(M["apple_leaf"], "rotation_euler", (0, app["leaf"], 0), f)
        key(M["apple_shades"], "location", (0, -0.275, 0.33 + app["shades_z"]), f)
        for i, b in enumerate(M["apple_brows"]):
            sgn = -1 if i == 0 else 1
            key(b, "location", (b.location.x, -0.27, 0.43 + app["brow_z"]), f)
            key(b, "rotation_euler", (0, sgn * app["brow_rot"], 0), f)
        # --- lid + door
        lr = 0.0
        if f in T.LID_RATTLE_1 or f in T.LID_RATTLE_2:
            lr = -0.13
        elif (f - 1) in T.LID_RATTLE_1 or (f - 1) in T.LID_RATTLE_2:
            lr = -0.05
        if T.LID_FLIP_F - 1 <= f < T.LID_SLAM_F:
            dt = (f - T.LID_FLIP_F) / T.FPS
            lr = -1.72 * clamp((f - T.LID_FLIP_F + 1) / 3.0) + (0.12 * spring(dt, 4, 6) if dt > 0 else 0)
            if f >= T.LID_SLAM_F - 2:
                lr = -1.72 * (1 - (f - T.LID_SLAM_F + 2) / 2.0)
        elif T.LID_SLAM_F <= f < T.LID_SLAM_F + 6:
            lr = -0.08 * abs(spring((f - T.LID_SLAM_F) / T.FPS, 5, 6))
        key(lid, "rotation_euler", (lr, 0, 0), f)
        d = -1.75 * smooth(prog(f, *T.DOOR_OPEN_F)) ** 1.5
        if f > T.DOOR_OPEN_F[1]:
            d += 0.05 * spring((f - T.DOOR_OPEN_F[1]) / T.FPS, 1.2, 2.5)
        key(door, "rotation_euler", (0, 0, d), f)
        # --- water whirl
        wt = 0.0
        if f >= T.CHAIN_YANK_F:
            dt = (f - T.CHAIN_YANK_F) / T.FPS
            wt = -2.5 * dt * dt - 1.0 * dt
        key_socket(whirl, wt, f)
        # --- lights
        fl = flicker(f)
        key(M["light_stall"].data, "energy", 420 * fl, f)
        key_socket(principled(M["fixture_mats"][0]).inputs["Emission Strength"], 12.0 * fl, f)
        # --- splash droplets on the head rise
        for dr, v in zip(drops, vel):
            dt = (f - T.HEAD_RISE_F[0]) / T.FPS
            if 0 <= dt < 0.75:
                p = WATER + v * dt + Vector((0, 0, -4.9 * dt * dt))
                key(dr, "location", p, f)
                key(dr, "scale", (1, 1, 1), f)
            else:
                key(dr, "location", (0, 2.5, 0.2), f)
                key(dr, "scale", (0.001, 0.001, 0.001), f)
        # --- cameras: key the active shot camera
        name, eye, tgt, lens, roll = camera_plan(f, M, sak, app)
        cam = cams[name]
        key(cam, "location", Vector(eye), f)
        e = Vector(tgt) - Vector(eye)
        q = e.to_track_quat("-Z", "Y") @ Euler((0, 0, roll)).to_quaternion()
        key(cam, "rotation_euler", q.to_euler(), f)
        cam.data.lens = lens
        cam.data.keyframe_insert("lens", frame=f)

    # second pass: plunger + chain need evaluated hand matrices
    dg = bpy.context.evaluated_depsgraph_get()
    hand = M["apple_hands"][1]
    plunger = M["plunger"]
    chain, handle = M["chain"], M["chain_handle"]
    grip = Matrix.Rotation(PI, 4, "X")
    toss_p0 = toss_v = None
    for f in range(1, T.FRAMES + 1):
        sc.frame_set(f)
        hw = hand.evaluated_get(dg).matrix_world.copy()
        if f <= T.TOSS_F[1] - 2:
            mw = hw @ grip
        elif f < T.PLUNGER_FALL_F[0]:
            if toss_p0 is None:
                toss_p0 = hw.translation.copy()
                toss_v = Vector((0.6, -2.0, 5.0))
            dt = (f - (T.TOSS_F[1] - 2)) / T.FPS
            p = toss_p0 + toss_v * dt + Vector((0, 0, -4.9 * dt * dt))
            if p.z > 3.4 or f > 600:
                p = Vector((5, 5, -5))
            mw = Matrix.Translation(p) @ Matrix.Rotation(PI + dt * 14, 4, "X")
        else:
            hd = M["apple_head"].evaluated_get(dg).matrix_world.copy()
            stuck = hd @ Matrix.Translation((0, 0, 0.555 + 0.62)) @ Matrix.Rotation(PI, 4, "X")
            k = prog(f, *T.PLUNGER_FALL_F)
            if k < 1:
                p = stuck.translation + Vector((0, 0, 2.0 * (1 - k * k)))
                mw = Matrix.Translation(p) @ stuck.to_3x3().to_4x4() @ Matrix.Rotation(0.4 * (1 - k), 4, "Y")
            else:
                mw = stuck
        loc, rot, _ = mw.decompose()
        key(plunger, "location", loc, f)
        key(plunger, "rotation_quaternion", rot, f)
        # chain + handle
        hp = chain_handle_pos(f, hw.translation)
        key(handle, "location", hp, f)
        top = M["chain_top"]
        mid = (top + hp) / 2
        d = top - hp
        key(chain, "location", mid, f)
        key(chain, "rotation_euler", d.to_track_quat("Z", "Y").to_euler(), f)
        key(chain, "scale", (0.008, 0.008, d.length / 2), f)
    # SFM-style cheat: hide the stall rails that cross the outro shot
    for nm in ("head_rail", "rail_1", "rail_2"):
        o = bpy.data.objects[nm]
        key_hidden(o, False, 1)
        key_hidden(o, True, T.SHOTS[-1][0])
    sc.frame_set(1)


# ----------------------------------------------------------------------------
# render settings + main
# ----------------------------------------------------------------------------

def render_setup(samples):
    sc = bpy.context.scene
    r = sc.render
    r.engine = "CYCLES"
    r.resolution_x, r.resolution_y = 480, 854
    r.resolution_percentage = 100
    r.use_persistent_data = True
    r.image_settings.file_format = "PNG"
    c = sc.cycles
    c.device = "CPU"
    c.samples = samples
    c.use_adaptive_sampling = True
    c.adaptive_threshold = 0.04
    c.use_denoising = True
    c.max_bounces = 4
    c.diffuse_bounces = 2
    c.glossy_bounces = 2
    c.transmission_bounces = 2
    c.transparent_max_bounces = 4
    c.sample_clamp_indirect = 6.0
    c.caustics_reflective = False
    c.caustics_refractive = False
    vs = sc.view_settings
    vs.view_transform = "AgX"
    for look in ("AgX - Punchy", "Punchy", "AgX - Medium High Contrast"):
        try:
            vs.look = look
            break
        except Exception:
            continue
    vs.exposure = -0.1


def build():
    reset_scene()
    M = {"porcelain": new_mat("porcelain", (0.85, 0.85, 0.82), rough=0.12, coat=0.6)}
    build_room(M)
    build_lights(M)
    build_toilet(M)
    build_sakadung(M)
    build_apple(M)
    build_plunger(M)
    build_droplets(M)
    bake(M)
    return M


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stills", default="")
    ap.add_argument("--range", nargs=2, type=int)
    ap.add_argument("--out", default=os.path.join(HERE, "render"))
    ap.add_argument("--samples", type=int, default=24)
    ap.add_argument("--save-only", action="store_true")
    ap.add_argument("--blend", default=os.path.join(HERE, "sakadung_vs_apple_ep1.blend"))
    args = ap.parse_args()

    build()
    render_setup(args.samples)
    bpy.ops.wm.save_as_mainfile(filepath=args.blend, compress=True)
    if args.save_only:
        return
    sc = bpy.context.scene
    os.makedirs(args.out, exist_ok=True)
    if args.stills:
        for f in [int(x) for x in args.stills.split(",")]:
            sc.frame_set(f)
            sc.render.filepath = os.path.join(args.out, f"still_{f:04d}.png")
            bpy.ops.render.render(write_still=True)
            print("rendered still", f, flush=True)
    if args.range:
        a, b = args.range
        sc.frame_start, sc.frame_end = a, b
        sc.render.filepath = os.path.join(args.out, "f_")
        sc.render.use_overwrite = False
        bpy.ops.render.render(animation=True)


if __name__ == "__main__":
    main()
