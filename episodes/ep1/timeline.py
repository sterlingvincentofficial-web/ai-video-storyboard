"""Master timeline for "Sakadung Toilet vs Agent Apple" - Episode 1.

Single source of truth shared by the Blender scene (animation + lip-sync)
and the soundtrack builder, so picture and sound always line up.
All times are in seconds unless a name ends in _F (frames).
"""

FPS = 24
DURATION = 30.0
FRAMES = int(DURATION * FPS)  # 720

BPM = 128
BEAT = 60.0 / BPM          # 0.46875 s
EIGHTH = BEAT / 2

# ---- shot list (start frame, end frame, camera name) -----------------------
SHOTS = [
    (1,   84,  "cam_establish"),   # creepy restroom, lights flicker
    (85,  156, "cam_stall"),       # stall door creaks open, lid rattles
    (157, 215, "cam_toilet_cu"),   # lid flips, head springs out, music kicks in
    (216, 330, "cam_hero_low"),    # low-angle orbit, Sakadung sings
    (331, 405, "cam_entrance"),    # Agent Apple walks in
    (406, 430, "cam_apple_cu"),    # record scratch, Apple glares
    (431, 456, "cam_head_cu"),     # Sakadung: "huh?"
    (457, 536, "cam_ots"),         # over-the-shoulder: aggressive verse, plunger up
    (537, 590, "cam_side"),        # THWOMP, pop, dizzy, plunger tossed
    (591, 612, "cam_chain_cu"),    # hand yanks the flush chain
    (613, 660, "cam_flush_high"),  # whirlpool, "NOOOO"
    (661, 720, "cam_outro"),       # lid slams, Apple poses, plunger bonk, rattle
]

# ---- key story frames --------------------------------------------------------
DOOR_OPEN_F = (100, 130)
LID_RATTLE_1 = [132, 135, 137, 140, 143, 144, 147, 150, 152, 155]
LID_FLIP_F = 165
HEAD_RISE_F = (169, 186)
APPLE_WALK_F = (331, 400)          # doorway -> stand spot
SCRATCH_F = 405
APPLE_ANGRY_F = 414
HUH_F = 434
PLUNGER_RAISE_F = (500, 520)
THRUST_F = (537, 545)              # impact on 545
YANK_F = (558, 566)                # pop on 566
TOSS_F = (568, 576)
APPLE_WALK2_F = (572, 594)
CHAIN_YANK_F = 600
SPIN_DOWN_F = (618, 656)
LID_SLAM_F = 663
APPLE_TURN_F = (668, 684)
GLASSES_F = (686, 698)
PLUNGER_FALL_F = (690, 700)        # bonk on 700
LID_RATTLE_2 = [707, 709, 711, 713, 715]

MUSIC_A = (7.5, SCRATCH_F / FPS)        # 7.5 -> 16.875 (20 beats)
MUSIC_B = (19.0, THRUST_F[1] / FPS)     # 19.0 -> 22.708 (cut by the thwomp)


def _phrase(start, slots, notes, loud=1.0):
    """slots: list of syllables (None = rest, '-' = hold previous) on eighths."""
    out = []
    i = 0
    while i < len(slots):
        syl = slots[i]
        if syl is None or syl == "-":
            i += 1
            continue
        n = 1
        while i + n < len(slots) and slots[i + n] == "-":
            n += 1
        out.append({
            "t": round(start + i * EIGHTH, 4),
            "d": round(n * EIGHTH * 0.92, 4),
            "syl": syl,
            "note": notes[i],
            "loud": loud,
        })
        i += n
    return out


def _bar_start(music_start, bar):
    return music_start + bar * 4 * BEAT


P1 = ["sa", "ka", "dung", None, "sa", "ka", "dung", None]
N1 = [67, 67, 63, 0, 67, 67, 70, 0]
P2 = ["dip", "dip", "ba", "loo", "ba", None, "yeah", "-"]
N2 = [72, 72, 70, 67, 65, 0, 67, 0]
P2b = ["dip", "dip", "ba", "loo", "ba", "ba", "doo", "-"]
N2b = [72, 72, 70, 67, 65, 63, 60, 0]
# Verse B - angrier, higher
PB1 = ["sa", "ka", "dung", "dung", "sa", "ka", "dung", "dung"]
NB1 = [70, 70, 67, 67, 70, 70, 74, 74]
PB2 = ["ap", "ple", "go", "home", "sa", "ka", "dung", "-"]
NB2 = [75, 74, 72, 70, 72, 74, 75, 0]


def vocals():
    a0 = MUSIC_A[0]
    v = []
    # bar 0 = drums intro, vocals from bar 1..4 (bar 4 ends at 16.875 s)
    v += _phrase(_bar_start(a0, 1), P1, N1)
    v += _phrase(_bar_start(a0, 2), P2, N2)
    v += _phrase(_bar_start(a0, 3), P1, N1)
    v += _phrase(_bar_start(a0, 4), P2b, N2b)
    b0 = MUSIC_B[0]
    v += _phrase(_bar_start(b0, 0), PB1, NB1, 1.15)
    v += _phrase(_bar_start(b0, 1), PB2, NB2, 1.15)
    # drop anything that would run past the thwomp
    v = [s for s in v if not (MUSIC_A[1] <= s["t"] < MUSIC_B[0]) and s["t"] < MUSIC_B[1]]
    return v


# Extra mouth moments (non-sung)
MUFFLED = [{"t": 22.78 + i * 0.2, "d": 0.16, "syl": "mm", "note": 62 - i, "loud": 0.8} for i in range(3)]
HUH = {"t": HUH_F / FPS, "d": 0.45, "syl": "huh"}
NOOO = {"t": 25.65, "d": 1.75, "syl": "noo"}

VOCALS = vocals()


def mouth_events():
    ev = [dict(s) for s in VOCALS] + [dict(s) for s in MUFFLED]
    ev.append(dict(HUH))
    ev.append(dict(NOOO))
    return sorted(ev, key=lambda e: e["t"])


def walk_contacts(f0, f1, step_frames=12):
    """Frames where a foot hits the floor during a walk."""
    return list(range(f0 + step_frames // 2, f1, step_frames))
