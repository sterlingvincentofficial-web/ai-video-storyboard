"""Every enemy variant, shared by enemy_textures.py (Pillow) and build_enemies.py (bpy).

All variants share the approved Monkey construction (soft-edged toy blocks, printed face and
belly, cream hand/foot caps); they differ in proportions, colors, face expression and extras.
Sizes are studs at in-game scale 1 (the game can scale a variant further, see Enemies.luau).
"""

MONKEY_BODY = {
    "leg": (1.0, 1.0, 2.0),       # width, depth, height
    "torso": (2.0, 1.25, 2.0),
    "arm": (0.95, 0.95, 1.9),
    "head": (2.3, 1.9, 1.9),
    "hand_cap": 0.62,
    "foot_cap": 0.5,
    "ear_r": 0.43,
    "radius": 0.12,
    "head_radius": 0.24,
}

GORILLA_BODY = {
    "leg": (1.35, 1.35, 1.6),
    "torso": (3.4, 2.2, 2.6),
    "arm": (1.55, 1.55, 3.9),
    "head": (2.2, 2.0, 1.9),
    "hand_cap": 0.8,
    "foot_cap": 0.5,
    "ear_r": 0.34,
    "radius": 0.18,
    "head_radius": 0.3,
}

CREAM = (250, 246, 182)
INK = (32, 30, 24)


def body(base, **over):
    b = dict(base)
    b.update(over)
    return b


VARIANTS = {
    # ---------------------------------------------------------------- monkeys
    "Monkey": {
        "body": MONKEY_BODY,
        "fur": (116, 80, 58), "cream": CREAM, "face": "happy",
    },
    "Speedy": {  # the dark monkey from the concept art: quick, cocky
        "body": body(MONKEY_BODY, leg=(0.9, 0.9, 2.1), torso=(1.8, 1.1, 1.9), arm=(0.85, 0.85, 1.9)),
        "fur": (54, 54, 62), "cream": CREAM, "face": "smirk",
        "extras": ["headband"], "colors": {"headband": (220, 40, 40)},
    },
    "Chucker": {  # throws bananas from range
        "body": MONKEY_BODY,
        "fur": (178, 112, 54), "cream": CREAM, "face": "goofy",
        "extras": ["banana_hand"], "colors": {"banana": (255, 214, 40), "banana_tip": (70, 48, 26)},
    },
    "Brute": {  # armored tank
        "body": body(MONKEY_BODY, torso=(2.5, 1.5, 2.2), arm=(1.15, 1.15, 2.0), leg=(1.2, 1.2, 1.9),
                     head=(2.4, 2.0, 1.9)),
        "fur": (92, 58, 40), "cream": (236, 222, 160), "face": "angry",
        "extras": ["helmet"], "colors": {"metal": (150, 156, 164)},
    },
    "Baby": {  # tiny, comes in swarms
        "body": body(MONKEY_BODY, leg=(0.7, 0.7, 0.9), torso=(1.4, 1.0, 1.2), arm=(0.62, 0.62, 1.15),
                     head=(2.2, 1.9, 1.85), hand_cap=0.38, foot_cap=0.3, ear_r=0.4, radius=0.1),
        "fur": (156, 106, 70), "cream": (255, 240, 196), "face": "cute",
        "extras": ["diaper"], "colors": {"diaper": (245, 245, 240)},
    },
    "Ninja": {  # leaps over the front line
        "body": body(MONKEY_BODY, torso=(1.9, 1.15, 1.95)),
        "fur": (98, 78, 64), "cream": CREAM, "face": "ninja",
        "extras": ["ninja_band"], "colors": {"mask": (30, 30, 36), "scarf": (200, 36, 46)},
    },
    # ---------------------------------------------------------------- gorilla bosses
    "Silverback": {
        "body": GORILLA_BODY, "gorilla": True,
        "fur": (48, 48, 54), "cream": (122, 122, 130), "face": "gorilla_angry", "back": "silver",
        "colors": {"silver": (176, 180, 188)},
    },
    "RockThrower": {
        "body": GORILLA_BODY, "gorilla": True,
        "fur": (98, 86, 76), "cream": (140, 132, 124), "face": "gorilla_roar",
        "extras": ["boulder"], "colors": {"rock": (128, 132, 128), "rock_dark": (96, 100, 98)},
    },
    "Berserker": {
        "body": body(GORILLA_BODY, arm=(1.65, 1.65, 4.0)), "gorilla": True,
        "fur": (112, 42, 36), "cream": (150, 110, 104), "face": "gorilla_rage",
        "extras": ["spikes"], "colors": {"spike_tip": (226, 222, 210)},
    },
    "Alpha": {
        "body": GORILLA_BODY, "gorilla": True,
        "fur": (34, 32, 38), "cream": (112, 110, 120), "face": "gorilla_smug",
        "extras": ["crown", "cape"], "colors": {"gold": (250, 196, 40), "gem": (220, 40, 60), "cape": (176, 30, 40)},
    },
    "Titan": {  # THE Gorilla, wave 100
        "body": body(GORILLA_BODY, torso=(3.8, 2.4, 2.8), arm=(1.75, 1.75, 4.1), head=(2.4, 2.1, 2.0)),
        "gorilla": True,
        "fur": (26, 24, 30), "cream": (96, 92, 104), "face": "gorilla_titan",
        "extras": ["gold_armor", "crown"], "colors": {"gold": (250, 196, 40), "gem": (60, 200, 255)},
    },
}

# Swatch slots in the atlas for flat colors (fur, cream, ink + each variant's extras).
BASE_SWATCHES = ["fur", "cream", "ink", "white", "skin_dark"]


def swatches(variant):
    """Ordered swatch names for a variant (max 16)."""
    names = list(BASE_SWATCHES) + sorted(VARIANTS[variant].get("colors", {}).keys())
    assert len(names) <= 16, variant
    return names


def swatch_color(variant, name):
    v = VARIANTS[variant]
    if name == "fur":
        return v["fur"]
    if name == "cream":
        return v["cream"]
    if name == "ink":
        return INK
    if name == "white":
        return (250, 250, 250)
    if name == "skin_dark":
        c = v["cream"]
        return (int(c[0] * 0.7), int(c[1] * 0.7), int(c[2] * 0.7))
    return v["colors"][name]


def swatch_uv(variant, name):
    """UV (center of the swatch square) in the bottom-left quarter of the atlas (4x4 grid)."""
    i = swatches(variant).index(name)
    col, row = i % 4, i // 4
    return ((col + 0.5) / 8, (row + 0.5) / 8)
