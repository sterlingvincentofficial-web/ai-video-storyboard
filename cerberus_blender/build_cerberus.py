"""
Voxel Cerberus — procedural Blender build + rig.

Run inside Blender (4.2+):
    blender --background --python build_cerberus.py -- [--out DIR] [--render]
or paste into Blender's Text Editor and press Run Script.

Produces one mesh ("Cerberus_Mesh") rigidly skinned to an armature ("Cerberus_Rig")
with FK spine/necks/heads/jaws/tail, IK legs, and a looping "Cerberus_Idle" action.
Character faces -Y, Z up, feet on Z=0, 1 Blender unit ~= 1 stud.
"""
import bpy, math, random, sys, os
from mathutils import Matrix, Vector, Euler

# ----------------------------------------------------------------------------
# Palette (sRGB hex, sampled from the reference renders)
# ----------------------------------------------------------------------------
PURPLE = ['#211948', '#241b4d', '#1e1743', '#282052', '#1b1440', '#2b2257', '#22194a']
PURPLE_BASE = '#211948'
BROW = '#120d28'
RIDGE = '#1a1340'
RED = '#e04a26'
RED_VAR = ['#e04a26', '#d8421f', '#e85630', '#cc3a1c', '#e2502a']
RED_DARK = '#b02a18'
EAR_IN = '#7a140e'
MOUTH = '#4a0a06'
GUM = '#8c1c14'
TOOTH = '#f4f2ee'
CLAW = '#f6efdc'
EYE = '#f2f2fa'
PUPIL = '#c62c1c'
NOSE = '#100c1e'
NOSE_RIM = '#b02218'
FLAME = ['#c8261a', '#de361c', '#ea4e1e', '#f06a22', '#f48a28', '#f6ae30', '#f8d040', '#fbe88a']

rng = random.Random(1337)


def lin(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    return tuple(((x / 12.92) if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4) for x in c) + (1.0,)


def T(x, y, z):
    return Matrix.Translation((x, y, z))


def R(x=0.0, y=0.0, z=0.0):
    return Euler((math.radians(x), math.radians(y), math.radians(z)), 'XYZ').to_matrix().to_4x4()


def aim(d, up_axis=(0, 0, 1)):
    """Rotation taking local +Z (or given axis) onto direction d."""
    return Vector(up_axis).rotation_difference(Vector(d).normalized()).to_matrix().to_4x4()


# ----------------------------------------------------------------------------
# Mesh builder: everything goes into one mesh; each primitive is rigidly bound
# to one bone (Roblox-style rigid skinning).
# ----------------------------------------------------------------------------
MAT_BODY, MAT_FLAME = 0, 1


class Builder:
    def __init__(self):
        self.verts, self.faces, self.fcol, self.fmat, self.vbone = [], [], [], [], []
        self.offset = Matrix()

    def add(self, vs, fs, col, bone, mat):
        base = len(self.verts)
        self.verts += [self.offset @ v for v in vs]
        self.vbone += [bone] * len(vs)
        c = lin(col)
        for f in fs:
            self.faces.append([base + i for i in f])
            self.fcol.append(c)
            self.fmat.append(mat)

    # axis-aligned box in frame M (size = full extents)
    def box(self, M, size, col, bone, mat=MAT_BODY):
        sx, sy, sz = (s / 2 for s in size)
        loc = [(-sx, -sy, -sz), (sx, -sy, -sz), (sx, sy, -sz), (-sx, sy, -sz),
               (-sx, -sy, sz), (sx, -sy, sz), (sx, sy, sz), (-sx, sy, sz)]
        vs = [M @ Vector(p) for p in loc]
        fs = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (2, 3, 7, 6), (3, 0, 4, 7), (1, 2, 6, 5)]
        self.add(vs, fs, col, bone, mat)

    # truncated pyramid: base (bw,bd) at z=0, top (tw,td) at z=h shifted by toff
    def frustum(self, M, bw, bd, tw, td, h, toff, col, bone, mat=MAT_BODY):
        ox, oy = toff
        loc = [(-bw / 2, -bd / 2, 0), (bw / 2, -bd / 2, 0), (bw / 2, bd / 2, 0), (-bw / 2, bd / 2, 0),
               (ox - tw / 2, oy - td / 2, h), (ox + tw / 2, oy - td / 2, h),
               (ox + tw / 2, oy + td / 2, h), (ox - tw / 2, oy + td / 2, h)]
        vs = [M @ Vector(p) for p in loc]
        fs = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (2, 3, 7, 6), (3, 0, 4, 7), (1, 2, 6, 5)]
        self.add(vs, fs, col, bone, mat)

    # triangular tooth: base edge along X at z=0, tip at z=-h, thickness d along Y
    def tooth(self, M, w, h, d, col, bone):
        loc = [(-w / 2, -d / 2, 0), (w / 2, -d / 2, 0), (0, -d / 2 * 0.3, -h),
               (-w / 2, d / 2, 0), (w / 2, d / 2, 0), (0, d / 2 * 0.3, -h)]
        vs = [M @ Vector(p) for p in loc]
        fs = [(0, 2, 1), (3, 4, 5), (0, 1, 4, 3), (1, 2, 5, 4), (2, 0, 3, 5)]
        self.add(vs, fs, col, bone, MAT_BODY)

    # cube with a lighter inset square on every face (the flame / tile look)
    def tile_cube(self, M, s, col, inner, bone, mat=MAT_FLAME, k=0.56):
        self.box(M, (s, s, s), col, bone, mat)
        e = s * 1.012
        i = s * k
        self.box(M, (i, i, e), inner, bone, mat)
        self.box(M, (i, e, i), inner, bone, mat)
        self.box(M, (e, i, i), inner, bone, mat)

    # voxel "panel" detailing: small grid-snapped plates on the faces of a box
    def greeble(self, M, size, bone, palette, density=2.6, skip=('-z',), grid=0.1):
        sx, sy, sz = size
        faces = {
            '+x': (Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1)), sx, sy, sz),
            '-x': (Vector((-1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1)), sx, sy, sz),
            '+y': (Vector((0, 1, 0)), Vector((1, 0, 0)), Vector((0, 0, 1)), sy, sx, sz),
            '-y': (Vector((0, -1, 0)), Vector((1, 0, 0)), Vector((0, 0, 1)), sy, sx, sz),
            '+z': (Vector((0, 0, 1)), Vector((1, 0, 0)), Vector((0, 1, 0)), sz, sx, sy),
            '-z': (Vector((0, 0, -1)), Vector((1, 0, 0)), Vector((0, 1, 0)), sz, sx, sy),
        }
        for key, (n, u, v, dn, du, dv) in faces.items():
            if key in skip:
                continue
            count = int(du * dv * density + rng.random())
            for _ in range(count):
                w = min(du * 0.7, grid * rng.choice((2, 2, 3, 3, 4, 5, 6)))
                h = min(dv * 0.7, grid * rng.choice((2, 2, 3, 3, 4, 5)))
                pu = round(rng.uniform(-(du - w) / 2 + 0.04, (du - w) / 2 - 0.04) / grid) * grid
                pv = round(rng.uniform(-(dv - h) / 2 + 0.04, (dv - h) / 2 - 0.04) / grid) * grid
                depth = rng.choice((0.03, 0.04, 0.05, 0.06))
                c = n * (dn / 2 + depth / 2 - 0.012) + u * pu + v * pv
                rot = Matrix((u, v, n)).transposed().to_4x4()
                self.box(M @ T(*c) @ rot, (w, h, depth), rng.choice(palette), bone)

    def vbox(self, M, size, bone, palette=PURPLE, col=None, density=2.6, skip=('-z',)):
        """Main voxel block: base box + panel detailing."""
        self.box(M, size, col or palette[0], bone)
        self.greeble(M, size, bone, palette, density, skip)

    def flame_chain(self, M, d, n, s0, bone, shrink=0.88, start=1, jitter=6.0):
        """Chain of tile cubes marching along direction d (in frame M)."""
        d = Vector(d).normalized()
        pos = Vector((0, 0, 0))
        s = s0
        last = len(FLAME) - 1
        for i in range(n):
            t = i / max(1, n - 1)
            ci = min(last, start + round((t ** 1.35) * (last - start)))
            inner = FLAME[min(last, ci + 2)]
            rot = aim(d) @ R(rng.uniform(-jitter, jitter), rng.uniform(-jitter, jitter), rng.uniform(-8, 8))
            self.tile_cube(M @ Matrix.Translation(pos + d * (s / 2)) @ rot, s, FLAME[ci], inner, bone)
            pos += d * (s * 0.8)
            s *= shrink


B = Builder()

# ----------------------------------------------------------------------------
# HEAD (head-local: origin = cranium centre, face toward -Y)
# ----------------------------------------------------------------------------
JAW_OPEN = 26.0
DZ = -0.3          # body height above the legs
OFF = T(0, 0, DZ)

HINGE = Vector((0, -0.75, -0.82))
HEAD_JOINT = Vector((0, 0.45, -0.8))


def build_head(Mh, hb, jb, tuft_big):
    # cranium + skull plates
    B.vbox(Mh, (2.2, 1.9, 1.7), hb, density=2.6, skip=('-z', '-y'))
    B.box(Mh @ T(0, -0.86, 0.87), (0.42, 0.3, 0.12), BROW, hb)               # top notch
    B.box(Mh @ T(0, 0.2, 0.86), (1.3, 1.1, 0.08), PURPLE[3], hb)              # crown plate

    for s in (-1, 1):
        # angry brows: inner end lower
        B.box(Mh @ T(s * 0.56, -0.99, 0.5) @ R(0, -s * 15, 0), (1.06, 0.36, 0.3), BROW, hb)
        # eye white + pupil on the inner side
        B.box(Mh @ T(s * 0.64, -0.965, 0.1), (0.66, 0.1, 0.44), EYE, hb)
        B.box(Mh @ T(s * 0.42, -0.99, 0.15), (0.26, 0.1, 0.3), PUPIL, hb)
        # red cheek plates
        B.box(Mh @ T(s * 1.16, -0.62, -0.42), (0.24, 0.62, 0.9), RED, hb)
        B.box(Mh @ T(s * 0.6, -0.97, -0.62), (0.5, 0.06, 0.3), PURPLE[3], hb)  # face panel
        # ears: red pyramid shell with dark inner face
        B.frustum(Mh @ T(s * 0.7, 0.45, 0.82), 0.62, 0.5, 0.08, 0.08, 1.05, (s * 0.1, 0.12), RED, hb)
        B.frustum(Mh @ T(s * 0.7, 0.33, 0.87), 0.42, 0.34, 0.04, 0.04, 0.85, (s * 0.08, 0.11), EAR_IN, hb)

    # nose bridge ridge between the brows
    B.box(Mh @ T(0, -1.0, 0.1), (0.32, 0.3, 0.7), RIDGE, hb)

    # snout / upper jaw
    snout = Mh @ T(0, -1.5, -0.5)
    B.vbox(snout, (1.8, 1.25, 0.66), hb, density=2.6, skip=('-z', '-y'))
    B.box(Mh @ T(-0.45, -2.13, -0.62), (0.5, 0.06, 0.2), PURPLE[3], hb)      # snout panels
    B.box(Mh @ T(0.5, -2.13, -0.48), (0.4, 0.06, 0.2), PURPLE[4], hb)
    B.box(Mh @ T(0, -1.72, -0.15), (1.06, 0.84, 0.14), BROW, hb)             # dark nose slab
    B.box(Mh @ T(0, -2.13, -0.33), (0.76, 0.1, 0.3), NOSE_RIM, hb)           # nose rim
    B.box(Mh @ T(0, -2.15, -0.33), (0.7, 0.1, 0.24), NOSE, hb)               # nose
    B.box(Mh @ T(0, -1.45, -0.95), (1.6, 1.1, 0.5), MOUTH, hb)               # mouth interior
    B.box(Mh @ T(0, -2.04, -0.86), (1.72, 0.16, 0.14), GUM, hb)              # upper gum
    for s in (-1, 1):
        B.box(Mh @ T(s * 0.85, -1.45, -0.86), (0.14, 1.1, 0.14), GUM, hb)
    for x in (-0.63, -0.21, 0.21, 0.63):                                      # upper fangs
        B.tooth(Mh @ T(x, -2.03, -0.8), 0.42, 0.52, 0.12, TOOTH, hb)
    for s in (-1, 1):
        for y in (-1.66, -1.3, -0.98):
            B.tooth(Mh @ T(s * 0.84, y, -0.8) @ R(0, 0, 90), 0.32, 0.34, 0.1, TOOTH, hb)

    # lower jaw (own bone)
    Mj = Mh @ Matrix.Translation(HINGE) @ R(JAW_OPEN, 0, 0)
    B.vbox(Mj @ T(0, -0.68, -0.26), (1.62, 1.3, 0.42), jb, density=3.2, skip=())
    B.box(Mj @ T(0, -1.2, -0.42), (1.72, 0.3, 0.3), PURPLE[3], jb)          # chin lip
    B.box(Mj @ T(0, -0.66, -0.03), (1.46, 1.16, 0.12), GUM, jb)              # gum
    B.box(Mj @ T(0, -0.6, 0.0), (1.2, 0.9, 0.06), MOUTH, jb)                 # tongue/floor
    for x in (-0.42, 0.0, 0.42):                                              # lower fangs
        B.tooth(Mj @ T(x, -1.22, 0.02) @ R(0, 180, 0), 0.36, 0.4, 0.1, TOOTH, jb)
    for s in (-1, 1):
        for y in (-0.92, -0.58):
            B.tooth(Mj @ T(s * 0.64, y, 0.02) @ R(0, 180, 90), 0.28, 0.28, 0.1, TOOTH, jb)

    # flame tuft between the ears
    for x in (-0.36, 0.0, 0.36):
        B.tile_cube(Mh @ T(x, 0.35, 0.98) @ R(0, 0, rng.uniform(-6, 6)), 0.44, FLAME[0], FLAME[2], hb)
    tb = Mh @ T(0, 0.35, 1.18)
    B.flame_chain(tb, (0, 0.12 if tuft_big else 0.5, 1), 6 if tuft_big else 4, 0.42, hb, start=1)
    for s in (-1, 1):
        B.flame_chain(tb @ T(s * 0.32, 0.1, 0), (s * 0.28, 0.45, 1), 4 if tuft_big else 3, 0.36, hb, start=1)
        B.flame_chain(tb @ T(s * 0.3, 0.5, -0.1), (s * 0.4, 0.9, 0.7), 3, 0.32, hb, start=1)
    B.flame_chain(tb @ T(0, 0.55, -0.1), (0, 0.9, 0.7), 4, 0.36, hb, start=1)
    return Mj


# ----------------------------------------------------------------------------
# BODY
# ----------------------------------------------------------------------------
B.offset = OFF
B.vbox(T(0, -1.6, 2.95), (2.6, 1.6, 2.2), 'chest', density=2.0)                 # chest
B.vbox(T(0, -0.2, 2.97), (2.4, 1.6, 1.86), 'chest', density=2.0)                 # mid torso
B.vbox(T(0, 1.35, 3.0), (2.5, 1.7, 1.9), 'hips', density=2.0)                    # hips
B.vbox(T(0, 2.25, 3.05), (2.1, 0.5, 1.5), 'hips', density=2.0)                   # rump
B.box(T(0, -2.43, 2.45), (1.4, 0.12, 1.15), RED, 'chest')                        # red chest plate
B.box(T(0, -1.8, 1.86), (1.5, 1.0, 0.12), RED_DARK, 'chest')                     # belly red
for s in (-1, 1):
    B.vbox(T(s * 1.28, -1.55, 2.8), (0.6, 1.3, 1.35), 'chest', density=2.6)      # shoulders
    B.vbox(T(s * 1.28, 1.4, 2.9), (0.62, 1.6, 1.6), 'hips', density=2.6)         # haunches
    B.box(T(s * 1.6, 1.4, 2.95), (0.1, 0.9, 0.9), PURPLE[5], 'hips')

# ----------------------------------------------------------------------------
# LEGS  (front legs bend back at the elbow, back legs forward at the knee)
# ----------------------------------------------------------------------------
B.offset = Matrix()
LEGS = {}
for s, side in ((1, 'L'), (-1, 'R')):
    for front in (True, False):
        x, y = s * 0.95, (-1.6 if front else 1.45)
        up, lo, ft = (('upper_arm', 'forearm', 'paw') if front else ('thigh', 'shin', 'foot'))
        up, lo, ft = (f'{up}.{side}', f'{lo}.{side}', f'{ft}.{side}')
        bend = 0.06 if front else -0.06
        LEGS[(side, front)] = dict(x=x, y=y, up=up, lo=lo, ft=ft, bend=bend)
        B.vbox(T(x, y, 1.78), (1.0 if not front else 0.95, 1.15 if not front else 0.95, 1.05), up, density=2.6)
        B.vbox(T(x, y, 0.96), (0.88, 0.88, 0.9), lo, RED_VAR, density=2.6)
        B.box(T(x, y, 0.56), (0.98, 0.98, 0.2), RED_DARK, lo)                     # ankle cuff
        B.vbox(T(x, y - 0.14, 0.24), (1.04, 1.18, 0.48), ft, RED_VAR, density=2.5, skip=('-z',))
        for cx in (-0.33, 0.0, 0.33):                                             # claws
            B.box(T(x + cx, y - 0.86, 0.17) @ R(-12, 0, 0), (0.25, 0.34, 0.34), CLAW, ft)
            B.box(T(x + cx, y - 0.95, 0.17) @ R(-12, 0, 0), (0.2, 0.18, 0.3), TOOTH, ft)

# ----------------------------------------------------------------------------
# NECKS + HEADS
# ----------------------------------------------------------------------------
HEAD_SCALE = 0.96
HEADS = {
    'C': dict(M=OFF @ T(0, -3.0, 4.3) @ R(-3, 0, 0) @ Matrix.Scale(HEAD_SCALE, 4), tuft=True),
    'L': dict(M=OFF @ T(2.25, -2.6, 3.38) @ R(0, 0, 44) @ R(-6, 0, 0) @ Matrix.Scale(HEAD_SCALE, 4), tuft=False),
    'R': dict(M=OFF @ T(-2.25, -2.6, 3.38) @ R(0, 0, -44) @ R(-6, 0, 0) @ Matrix.Scale(HEAD_SCALE, 4), tuft=False),
}
NECK_BASE = {'C': Vector((0, -1.95, 3.7 + DZ)), 'L': Vector((1.05, -1.9, 3.4 + DZ)), 'R': Vector((-1.05, -1.9, 3.4 + DZ))}
for k, h in HEADS.items():
    h['jaw'] = build_head(h['M'], f'head.{k}', f'jaw.{k}', h['tuft'])
    joint = h['M'] @ HEAD_JOINT
    base = NECK_BASE[k]
    d = joint - base
    Mn = Matrix.Translation((base + joint) / 2) @ aim(d, (0, 1, 0))
    B.vbox(Mn, (1.3, d.length + 0.7, 1.25), f'neck.{k}', density=2.2, skip=())
    h['joint'], h['base'] = joint, base

# ----------------------------------------------------------------------------
# FLAME MANE along the spine
# ----------------------------------------------------------------------------
B.offset = OFF
FANS = [(-1.7, 1.0), (-0.85, 1.15), (0.0, 1.2), (0.85, 1.15), (1.7, 0.95)]
for y, k in FANS:
    bone = 'chest' if y < 0.0 else 'hips'
    base = T(0, y, 3.9)
    for x in (-0.3, 0.3):
        B.tile_cube(base @ T(x, 0, 0.12) @ R(0, 0, rng.uniform(-8, 8)), 0.5, FLAME[0], FLAME[2], bone)
    for ang, n, s0 in ((0, 6, 0.46), (-38, 5, 0.42), (38, 5, 0.42), (-72, 4, 0.38), (72, 4, 0.38)):
        a = math.radians(ang + rng.uniform(-5, 5))
        d = Vector((math.sin(a) * 1.1, 0.85, math.cos(a)))
        nn = max(2, round(n * k))
        B.flame_chain(base @ T(math.sin(a) * 0.3, 0, 0.3), d, nn, s0 * (0.9 + 0.15 * k), bone, start=1)

# ----------------------------------------------------------------------------
# TAIL (3 segments curling up, flame fan at the tip)
# ----------------------------------------------------------------------------
TAIL = []
p = Vector((0, 2.3, 3.45 + DZ))
B.offset = Matrix()
for i, (ang, ln, th) in enumerate(((22, 1.15, 0.95), (34, 1.05, 0.8), (46, 0.95, 0.66))):
    d = Vector((0, math.cos(math.radians(ang)), math.sin(math.radians(ang))))
    q = p + d * ln
    TAIL.append((f'tail_{i + 1}', p.copy(), q.copy()))
    Mt = Matrix.Translation((p + q) / 2) @ aim(d, (0, 1, 0))
    B.vbox(Mt, (th, ln + 0.35, th), f'tail_{i + 1}', density=3.0, skip=())
    # small flames on top of the tail
    up = (aim(d, (0, 1, 0)).to_3x3() @ Vector((0, 0, 1)))
    for j in (-0.2, 0.2):
        Mf = Matrix.Translation((p + q) / 2 + d * j + up * (th / 2))
        B.flame_chain(Mf, up + d * 0.6, 3, 0.3, f'tail_{i + 1}', start=1)
    p = q
tip_dir = d
TAIL.append(('tail_tip', p.copy(), (p + tip_dir * 0.8).copy()))
Mtip = Matrix.Translation(p)
B.tile_cube(Mtip @ aim(tip_dir), 0.62, FLAME[2], FLAME[6], 'tail_tip')            # glowing core
B.tile_cube(Mtip @ Matrix.Translation(tip_dir * 0.3) @ aim(tip_dir), 0.52, FLAME[4], FLAME[7], 'tail_tip')
basis = aim(tip_dir).to_3x3()
u, v = basis @ Vector((1, 0, 0)), basis @ Vector((0, 1, 0))
B.flame_chain(Mtip, tip_dir, 6, 0.5, 'tail_tip', start=1)
for i in range(7):
    phi = 2 * math.pi * i / 7 + 0.3
    dd = tip_dir + 0.75 * (math.cos(phi) * u + math.sin(phi) * v)
    B.flame_chain(Mtip, dd, rng.choice((5, 5, 6)), 0.48, 'tail_tip', start=1)

# ----------------------------------------------------------------------------
# Create mesh object
# ----------------------------------------------------------------------------
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
for coll in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials, bpy.data.actions, bpy.data.cameras,
             bpy.data.lights):
    for d_ in list(coll):
        coll.remove(d_)

me = bpy.data.meshes.new('Cerberus_Mesh')
me.from_pydata([tuple(v) for v in B.verts], [], B.faces)
me.validate()
me.update()
me.polygons.foreach_set('material_index', B.fmat)
col_attr = me.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
loop_cols = []
for poly, c in zip(me.polygons, B.fcol):
    loop_cols.extend(c * poly.loop_total)
col_attr.data.foreach_set('color', loop_cols)
me.color_attributes.active_color = col_attr
me.color_attributes.render_color_index = 0

# per-face 0..1 UVs (ready for texture painting / baking)
uv = me.uv_layers.new(name='UVMap')
quad_uv = [(0, 0), (1, 0), (1, 1), (0, 1)]
tri_uv = [(0, 0), (1, 0), (0.5, 1)]
uvs = []
for poly in me.polygons:
    pattern = quad_uv if poly.loop_total == 4 else tri_uv
    uvs.extend(c for xy in pattern[:poly.loop_total] for c in xy)
uv.data.foreach_set('uv', uvs)

import bmesh
bm = bmesh.new()
bm.from_mesh(me)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bm.to_mesh(me)
bm.free()

obj = bpy.data.objects.new('Cerberus_Mesh', me)
bpy.context.scene.collection.objects.link(obj)


def make_mat(name, emit):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    attr = nt.nodes.new('ShaderNodeVertexColor')
    attr.layer_name = 'Col'
    attr.location = (-400, 200)
    nt.links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.55
    bsdf.inputs['Specular IOR Level'].default_value = 0.35
    if emit:
        nt.links.new(attr.outputs['Color'], bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = emit
    return m


me.materials.append(make_mat('Cerberus_Body', 0.0))
me.materials.append(make_mat('Cerberus_Flame', 0.18))

bev = obj.modifiers.new('Bevel', 'BEVEL')
bev.width = 0.018
bev.segments = 2
bev.limit_method = 'ANGLE'
bev.harden_normals = False

# ----------------------------------------------------------------------------
# Armature
# ----------------------------------------------------------------------------
arm = bpy.data.armatures.new('Cerberus_Rig')
rig = bpy.data.objects.new('Cerberus_Rig', arm)
bpy.context.scene.collection.objects.link(rig)
rig.show_in_front = True
arm.display_type = 'OCTAHEDRAL'
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
eb = arm.edit_bones


def bone(name, head, tail, parent=None, connect=False, deform=True, roll_to=None):
    b = eb.new(name)
    b.head, b.tail = Vector(head), Vector(tail)
    if roll_to is not None:
        b.align_roll(Vector(roll_to))
    if parent:
        b.parent = eb[parent]
        b.use_connect = connect
    b.use_deform = deform
    return b


bone('root', (0, 0, 0), (0, 1.6, 0), deform=False)
bone('hips', (0, 1.4, 3.0 + DZ), (0, 0.0, 3.0 + DZ), 'root', roll_to=(0, 0, 1))
bone('chest', (0, 0.0, 3.0 + DZ), (0, -1.7, 3.2 + DZ), 'hips', connect=True, roll_to=(0, 0, 1))
for k, h in HEADS.items():
    Mh = h['M']
    fwd = Mh.to_3x3() @ Vector((0, -1, 0))
    upv = Mh.to_3x3() @ Vector((0, 0, 1))
    bone(f'neck.{k}', h['base'], h['joint'], 'chest', roll_to=(0, 0, 1))
    bone(f'head.{k}', h['joint'], Mh @ Vector((0, 0.45, 1.0)), f'neck.{k}', connect=True, roll_to=fwd)
    hinge_w = Mh @ HINGE
    bone(f'jaw.{k}', hinge_w, h['jaw'] @ Vector((0, -1.3, 0)), f'head.{k}', roll_to=upv)
prev = 'hips'
for name, a, b_ in TAIL:
    bone(name, a, b_, prev, connect=(prev != 'hips'), roll_to=(1, 0, 0))
    prev = name
for (side, front), L in LEGS.items():
    x, y, bend = L['x'], L['y'], L['bend']
    parent = 'chest' if front else 'hips'
    top = (x, y, 2.3)
    knee = (x, y + bend, 1.38)
    ankle = (x, y, 0.5)
    toe = (x, y - 0.75, 0.3)
    bone(L['up'], top, knee, parent, roll_to=(0, -1, 0))
    bone(L['lo'], knee, ankle, L['up'], connect=True, roll_to=(0, -1, 0))
    bone(L['ft'], ankle, toe, L['lo'], connect=True, roll_to=(0, 0, 1))
    bone(f'IK_{L["ft"]}', ankle, toe, 'root', deform=False, roll_to=(0, 0, 1))
    pole_y = y + (1.6 if front else -1.6)
    bone(f'pole_{L["lo"]}', (x, pole_y, 1.38), (x, pole_y, 1.68), 'root', deform=False)
bpy.ops.object.mode_set(mode='OBJECT')

# bone collections
deform_c = arm.collections.new('Deform')
ctrl_c = arm.collections.new('Controls')
for b in arm.bones:
    (deform_c if b.use_deform else ctrl_c).assign(b)

# IK constraints + feet copy rotation
IK_INFO = []
for (side, front), L in LEGS.items():
    pb = rig.pose.bones[L['lo']]
    ik = pb.constraints.new('IK')
    ik.target, ik.subtarget = rig, f'IK_{L["ft"]}'
    ik.pole_target, ik.pole_subtarget = rig, f'pole_{L["lo"]}'
    ik.chain_count = 2
    cr = rig.pose.bones[L['ft']].constraints.new('COPY_ROTATION')
    cr.target, cr.subtarget = rig, f'IK_{L["ft"]}'
    IK_INFO.append((ik, L))

# tune pole angles so the rest pose is unchanged by IK
def ik_err(L):
    e = 0.0
    for n in (L['up'], L['lo']):
        pm, rm = rig.pose.bones[n].matrix, arm.bones[n].matrix_local
        e += pm.to_quaternion().rotation_difference(rm.to_quaternion()).angle
        e += (pm.translation - rm.translation).length
    return e


for ik, L in IK_INFO:
    best = (1e9, 0.0)
    for step, span in ((5.0, None), (0.5, 6.0), (0.05, 0.6)):
        lo, hi = (-180.0, 180.0) if span is None else (best[1] - span, best[1] + span)
        deg = lo
        while deg <= hi:
            ik.pole_angle = math.radians(deg)
            bpy.context.view_layer.update()
            best = min(best, (ik_err(L), deg))
            deg += step
    ik.pole_angle = math.radians(best[1])
    print(f'IK {L["lo"]}: pole_angle={best[1]:.2f} rest_err={best[0]:.5f}')

# skin: rigid vertex groups
groups = {}
for i, bn in enumerate(B.vbone):
    groups.setdefault(bn, []).append(i)
for bn, idx in groups.items():
    vg = obj.vertex_groups.new(name=bn)
    vg.add(idx, 1.0, 'REPLACE')
obj.parent = rig
am = obj.modifiers.new('Armature', 'ARMATURE')
am.object = rig

# ----------------------------------------------------------------------------
# Idle animation (60f loop). Rest pose = frame 1 pose.
# ----------------------------------------------------------------------------
scn = bpy.context.scene
scn.frame_start, scn.frame_end = 1, 60
scn.render.fps = 30
rig.animation_data_create()
act = bpy.data.actions.new('Cerberus_Idle')
act.use_fake_user = True
rig.animation_data.action = act
for pb in rig.pose.bones:
    pb.rotation_mode = 'XYZ'


def wave(pbname, path, axis, amp, phase=0.0, period=60):
    pb = rig.pose.bones[pbname]
    for f in range(1, period + 2, 5):
        val = amp * math.sin(2 * math.pi * (f - 1) / period + phase) - amp * math.sin(phase)
        vec = getattr(pb, path)
        vec[axis] = val
        pb.keyframe_insert(path, index=axis, frame=f)
    vec = getattr(pb, path)
    vec[axis] = 0.0


wave('chest', 'location', 1, 0.03)                       # breathing (bone Y = along spine)
wave('chest', 'rotation_euler', 0, math.radians(1.5))
for k, ph in (('C', 0.0), ('L', 1.3), ('R', 2.6)):
    wave(f'neck.{k}', 'rotation_euler', 2, math.radians(5), ph)
    wave(f'head.{k}', 'rotation_euler', 0, math.radians(4), ph + 0.5)
    wave(f'jaw.{k}', 'rotation_euler', 0, math.radians(6), ph + 1.0, period=30)
for i, n in enumerate(('tail_1', 'tail_2', 'tail_3', 'tail_tip')):
    wave(n, 'rotation_euler', 2, math.radians(7 + 3 * i), -0.6 * i)
for fc in act.fcurves:
    fc.modifiers.new('CYCLES')
    for kp in fc.keyframe_points:
        kp.interpolation = 'BEZIER'
scn.frame_set(1)

# ----------------------------------------------------------------------------
# Preview stage (floor, lights, cameras matching the reference shots)
# ----------------------------------------------------------------------------
stage = bpy.data.collections.new('Preview_Stage')
scn.collection.children.link(stage)

fl_me = bpy.data.meshes.new('Floor')
S = 60
fl_me.from_pydata([(-S, -S, 0), (S, -S, 0), (S, S, 0), (-S, S, 0)], [], [(0, 1, 2, 3)])
floor = bpy.data.objects.new('Baseplate', fl_me)
stage.objects.link(floor)
fm = bpy.data.materials.new('Baseplate')
fm.use_nodes = True
nt = fm.node_tree
bs = nt.nodes['Principled BSDF']
tc = nt.nodes.new('ShaderNodeTexCoord')
br = nt.nodes.new('ShaderNodeTexBrick')
nt.links.new(tc.outputs['Object'], br.inputs['Vector'])
br.inputs['Scale'].default_value = 0.5
br.offset = 0.0
br.squash = 1.0
br.inputs['Mortar Size'].default_value = 0.035
br.inputs['Brick Width'].default_value = 1.0
br.inputs['Row Height'].default_value = 0.5
br.inputs['Color1'].default_value = lin('#7a7d97')
br.inputs['Color2'].default_value = lin('#787b95')
br.inputs['Mortar'].default_value = lin('#55576c')
nt.links.new(br.outputs['Color'], bs.inputs['Base Color'])
bs.inputs['Roughness'].default_value = 0.8
fl_me.materials.append(fm)

sun_d = bpy.data.lights.new('Sun', 'SUN')
sun_d.energy = 3.2
sun_d.angle = math.radians(3)
sun = bpy.data.objects.new('Sun', sun_d)
sun.rotation_euler = (math.radians(38), math.radians(-24), math.radians(-35))
stage.objects.link(sun)

world = scn.world or bpy.data.worlds.new('World')
scn.world = world
world.use_nodes = True
bg = world.node_tree.nodes['Background']
bg.inputs['Color'].default_value = lin('#b4c4e6')
bg.inputs['Strength'].default_value = 0.75


def cam(name, loc, target, lens):
    cd = bpy.data.cameras.new(name)
    cd.lens = lens
    c = bpy.data.objects.new(name, cd)
    c.location = loc
    c.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    stage.objects.link(c)
    return c


CAMS = {
    'three_quarter': cam('Cam_ThreeQuarter', (12.0, -17.0, 9.5), (0.4, -0.6, 2.2), 50),
    'rear_top': cam('Cam_RearTop', (-12.0, 16.0, 15.5), (0.0, 0.4, 2.2), 50),
    'front': cam('Cam_Front', (0, -22.0, 9.0), (0, -1.0, 2.9), 50),
}
scn.camera = CAMS['front']
rig.select_set(True)
bpy.context.view_layer.objects.active = rig

# ----------------------------------------------------------------------------
# CLI: save / export / render
# ----------------------------------------------------------------------------
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
out = argv[argv.index('--out') + 1] if '--out' in argv else None
print(f'Cerberus: {len(B.verts)} verts, {len(B.faces)} faces, bones={len(arm.bones)}')
if out:
    os.makedirs(out, exist_ok=True)
    if '--render' in argv:
        scn.render.engine = 'CYCLES'
        scn.cycles.device = 'CPU'
        scn.cycles.samples = int(argv[argv.index('--samples') + 1]) if '--samples' in argv else 48
        scn.cycles.use_denoising = True
        scn.render.resolution_x, scn.render.resolution_y = 1179, 800
        scn.render.resolution_percentage = int(argv[argv.index('--pct') + 1]) if '--pct' in argv else 60
        scn.view_settings.view_transform = 'Standard'
        for key, c in CAMS.items():
            scn.camera = c
            scn.render.filepath = os.path.join(out, f'render_{key}.png')
            bpy.ops.render.render(write_still=True)
        scn.camera = CAMS['front']
    if '--export' in argv:
        # Game-ready copy: no bevel, split into Body + Flames (each < 20k tris for Roblox),
        # both skinned to the same rig.
        game = obj.copy()
        game.data = obj.data.copy()
        game.name = 'Cerberus_Game'
        scn.collection.objects.link(game)
        game.modifiers.remove(game.modifiers['Bevel'])
        bpy.ops.object.select_all(action='DESELECT')
        game.select_set(True)
        bpy.context.view_layer.objects.active = game
        bpy.ops.mesh.separate(type='MATERIAL')
        parts = [o for o in scn.objects if o.name.startswith('Cerberus_Game')]
        for o in parts:
            o.name = 'Cerberus_Flames' if o.data.materials[0].name == 'Cerberus_Flame' or \
                all(p_.material_index == 1 for p_ in o.data.polygons[:1]) else 'Cerberus_Body'
            o.data.name = o.name
            unused = [vg for vg in o.vertex_groups
                      if not any(g.group == vg.index for v in o.data.vertices for g in v.groups)]
            for vg in unused:
                o.vertex_groups.remove(vg)
        bpy.ops.object.select_all(action='DESELECT')
        for o in parts:
            o.select_set(True)
        rig.select_set(True)
        bpy.context.view_layer.objects.active = rig
        bpy.ops.export_scene.fbx(filepath=os.path.join(out, 'Cerberus.fbx'), use_selection=True,
                                 object_types={'ARMATURE', 'MESH'}, add_leaf_bones=False,
                                 bake_anim=True, bake_anim_use_all_actions=True,
                                 bake_anim_use_nla_strips=False, bake_anim_force_startend_keying=True,
                                 mesh_smooth_type='FACE', use_mesh_modifiers=True,
                                 colors_type='SRGB', axis_forward='-Z', axis_up='Y')
        bpy.ops.export_scene.gltf(filepath=os.path.join(out, 'Cerberus.glb'), export_format='GLB',
                                  use_selection=True, export_animations=True, export_apply=True,
                                  export_vertex_color='ACTIVE')
        for o in parts:
            bpy.data.meshes.remove(o.data)
        rig.animation_data.action = act
        scn.frame_set(1)
    if '--save' in argv:
        scn.render.engine = 'BLENDER_EEVEE_NEXT'
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, 'Cerberus.blend'))
