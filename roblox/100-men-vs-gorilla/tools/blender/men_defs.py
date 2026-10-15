"""The army, shared by men_textures.py (Pillow) and build_men.py (bpy).

Built like the approved monkeys: soft-edged toy blocks, a big printed face, printed shirt
fronts/backs, chunky hats and hair, and weapons put together from studded bricks (like the
reference game's brick banana). Limbs are split at the elbows and knees and the torso at the
waist, so the R15-named combat animations (tools/anim/unit_anims.json) drive them directly.

Each unit has 3 levels: L1 plain gear, L2 steel gear + a chevron on the sleeve, L3 gold gear +
a gold star on the chest (+ the in-game sparkle aura). Sizes are studs.
"""

MAN_BODY = {
    "upper_leg": (0.9, 0.95, 1.0),    # width, depth, height
    "lower_leg": (0.9, 0.95, 0.95),
    "boot": 0.42,                      # boot cap height (part of the lower leg)
    "hips": (1.9, 1.15, 0.5),
    "chest": (2.0, 1.2, 1.6),
    "upper_arm": (0.85, 0.85, 1.05),
    "lower_arm": (0.82, 0.82, 1.05),
    "hand": 0.5,                       # hand cap height (part of the lower arm)
    "head": (2.5, 2.05, 2.25),         # bobble head, like the monkeys
    "radius": 0.12,
    "head_radius": 0.36,
}

INK = (32, 30, 24)
WOOD = (140, 92, 54)
WOOD_DARK = (96, 62, 36)
STEEL = (176, 182, 192)
GOLD = (250, 196, 40)
DARK = (52, 54, 60)
SKINS = [(236, 186, 148), (198, 142, 100), (142, 96, 64), (250, 214, 180), (110, 72, 48)]


def gear_colors(level, l1):
    """Gear tint per level: L1 its own colors, L2 steel, L3 gold (accents keep their color)."""
    if level == 1:
        return l1
    metal = STEEL if level == 2 else GOLD
    return {k: (metal if k in ("gear", "gear_metal") else v) for k, v in l1.items()}


# Every unit: body colors, sleeves/legs style, head pieces, face, chest print, weapon.
#   sleeves: "skin" (tank top), "short" (t-shirt), "long"
#   legs: "pants" or "shorts"
#   hands: "skin" or a color key (gloves)
UNITS = {
    "Brawler": {
        "skin": SKINS[0], "shirt": (244, 244, 238), "pants": (46, 78, 132), "belt": (70, 45, 28), "boot": (40, 40, 44),
        "sleeves": "skin", "legs": "pants", "hands": "glove",
        "hair": (34, 28, 24), "hat": "headband", "hat_color": (214, 36, 36),
        "face": "tough", "print": "tank",
        "weapon": "gloves", "gear": {"gear": (214, 36, 36), "glove_cuff": (244, 244, 238)},
    },
    "Slingshot": {
        "skin": SKINS[3], "shirt": (255, 150, 40), "pants": (196, 166, 112), "belt": (120, 84, 50), "boot": (230, 230, 226),
        "sleeves": "short", "legs": "shorts", "hands": "skin",
        "hair": (156, 92, 40), "hat": "cap_back", "hat_color": (40, 110, 220),
        "face": "kid", "print": "stripe",
        "weapon": "slingshot", "gear": {"gear": WOOD, "band": (220, 60, 60), "pebble": (150, 150, 160)},
    },
    "Lumberjack": {
        "skin": SKINS[1], "shirt": (200, 40, 40), "pants": (40, 50, 80), "belt": (60, 40, 26), "boot": (96, 62, 36),
        "sleeves": "long", "legs": "pants", "hands": "skin",
        "hair": (92, 54, 30), "hat": "beanie", "hat_color": (34, 34, 38), "beard": True,
        "face": "jolly", "print": "plaid",
        "weapon": "axe", "gear": {"handle": WOOD, "gear": (186, 192, 204), "gear_metal": (186, 192, 204)},
    },
    "Hunter": {
        "skin": SKINS[2], "shirt": (196, 170, 112), "pants": (96, 104, 64), "belt": (80, 56, 34), "boot": (70, 50, 32),
        "sleeves": "short", "legs": "pants", "hands": "skin",
        "hair": (30, 26, 24), "hat": "safari", "hat_color": (214, 190, 130),
        "face": "squint", "print": "pockets",
        "weapon": "rifle", "gear": {"handle": WOOD, "gear": DARK, "scope": (40, 40, 46)},
    },
    "Medic": {
        "skin": SKINS[4], "shirt": (248, 248, 248), "pants": (150, 200, 230), "belt": (150, 200, 230), "boot": (240, 240, 240),
        "sleeves": "long", "legs": "pants", "hands": "skin",
        "hair": (24, 22, 22), "hat": "medic_cap", "hat_color": (248, 248, 248),
        "face": "kind", "print": "cross",
        "weapon": "medkit", "gear": {"gear": (248, 248, 248), "cross": (220, 40, 40)},
    },
    "Bait": {
        "skin": SKINS[0], "shirt": (255, 214, 40), "pants": (255, 214, 40), "belt": (230, 186, 30), "boot": (96, 66, 34),
        "sleeves": "long", "legs": "pants", "hands": "skin",
        "hair": (34, 28, 24), "hat": "banana_hood", "hat_color": (255, 214, 40),
        "face": "goofy", "print": "banana",
        "weapon": "big_banana", "gear": {"gear": (255, 224, 60), "tip": (90, 62, 32)},
    },
    "Grenadier": {
        "skin": SKINS[1], "shirt": (96, 110, 60), "pants": (80, 92, 50), "belt": (60, 50, 34), "boot": (44, 40, 36),
        "sleeves": "short", "legs": "pants", "hands": "skin",
        "hair": (40, 32, 26), "hat": "helmet", "hat_color": (84, 98, 52),
        "face": "crazy", "print": "bandolier",
        "weapon": "grenade", "gear": {"gear": (76, 96, 52), "pin": (190, 190, 196)},
    },
    "Zookeeper": {
        "skin": SKINS[3], "shirt": (150, 160, 90), "pants": (60, 90, 60), "belt": (90, 64, 40), "boot": (80, 56, 36),
        "sleeves": "short", "legs": "pants", "hands": "skin",
        "hair": (200, 120, 50), "hat": "ranger", "hat_color": (60, 110, 70),
        "face": "focused", "print": "patch",
        "weapon": "net_gun", "gear": {"gear": DARK, "muzzle": (255, 140, 30), "net": (240, 236, 210)},
    },
    "Commander": {
        "skin": SKINS[2], "shirt": (36, 50, 92), "pants": (30, 36, 60), "belt": (24, 24, 28), "boot": (24, 24, 28),
        "sleeves": "long", "legs": "pants", "hands": "glove",
        "hair": (230, 230, 230), "hat": "officer", "hat_color": (36, 50, 92), "mustache": True,
        "face": "stern", "print": "uniform",
        "weapon": "megaphone", "gear": {"gear": (220, 50, 50), "glove": (244, 244, 238), "mouth": (240, 240, 240)},
    },
    # the chopper pilot in the intro (one level only)
    "Pilot": {
        "skin": (245, 205, 48), "shirt": (13, 105, 172), "pants": (164, 189, 71), "belt": (60, 60, 64), "boot": (40, 40, 44),
        "sleeves": "skin", "legs": "pants", "hands": "skin",
        "hair": (40, 32, 26), "hat": "pilot", "hat_color": (88, 102, 56),
        "face": "noob", "print": "none",
        "weapon": None, "gear": {"mic": (40, 40, 44)},
        "levels": 1,
    },
}

BASE_SWATCHES = ["skin", "skin_dark", "ink", "white", "shirt", "pants", "belt", "boot", "hair", "hat", "gold", "steel"]


def variants():
    """(variant name, unit name, level) for every model to build."""
    out = []
    for name, u in UNITS.items():
        for level in range(1, u.get("levels", 3) + 1):
            out.append((f"{name}_L{level}", name, level))
    return out


def colors(unit, level):
    """All flat colors a variant uses, by swatch name."""
    u = UNITS[unit]
    c = {
        "skin": u["skin"],
        "skin_dark": tuple(int(x * 0.78) for x in u["skin"]),
        "ink": INK,
        "white": (250, 250, 250),
        "shirt": u["shirt"],
        "pants": u["pants"],
        "belt": u["belt"],
        "boot": u["boot"],
        "hair": u["hair"],
        "hat": GOLD if (level == 3 and unit == "Bait") else u["hat_color"],
        "gold": GOLD,
        "steel": STEEL,
    }
    for k, v in gear_colors(level, u["gear"]).items():
        c[k] = v
    return c


def swatches(unit, level):
    names = list(BASE_SWATCHES) + sorted(k for k in colors(unit, level) if k not in BASE_SWATCHES)
    assert len(names) <= 16, (unit, names)
    return names


def swatch_uv(unit, level, name):
    """UV (center of the swatch square) in the bottom-left quarter of the atlas (4x4 grid)."""
    i = swatches(unit, level).index(name)
    col, row = i % 4, i // 4
    return ((col + 0.5) / 8, (row + 0.5) / 8)
