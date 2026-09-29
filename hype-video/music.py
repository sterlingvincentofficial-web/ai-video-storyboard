"""Original trap instrumental for the US Nationals MW hype video.

140 BPM, F minor, 35 bars (= 60.0 s). Everything is synthesized from scratch,
so there are no samples, no lyrics, and no copyright issues.
Writes assets/soundtrack.wav and timeline.js (hit times the visuals sync to).
"""
import json
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

SR = 44100
BPM = 140
BEAT = 60 / BPM
BAR = BEAT * 4
STEP = BEAT / 4
NBARS = 35
DUR = NBARS * BAR
N = int(DUR * SR) + SR * 2
rng = np.random.default_rng(7)

L = np.zeros(N); R = np.zeros(N)          # dry bus
VL = np.zeros(N); VR = np.zeros(N)        # reverb send bus
SUB = np.zeros(N)                          # mono low end (808 + kick)
hits = {"kick": [], "snare": [], "hat": [], "impact": [], "clank": [], "stab": []}


def t_of(bar, step=0):
    return bar * BAR + step * STEP


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def filt(x, kind, f, order=2):
    if isinstance(f, (list, tuple)):
        sos = butter(order, [f[0] / (SR / 2), f[1] / (SR / 2)], btype=kind, output="sos")
    else:
        sos = butter(order, f / (SR / 2), btype=kind, output="sos")
    return sosfilt(sos, x)


def env_exp(n, decay):
    return np.exp(-np.arange(n) / SR / decay)


def add(sig, t, gain=1.0, pan=0.0, send=0.0, bus=None):
    i = int(round(t * SR))
    if i >= N:
        return
    sig = sig[: N - i]
    if bus is not None:
        bus[i:i + len(sig)] += sig * gain
        return
    gl = gain * np.sqrt(0.5 * (1 - pan)); gr = gain * np.sqrt(0.5 * (1 + pan))
    L[i:i + len(sig)] += sig * gl; R[i:i + len(sig)] += sig * gr
    if send:
        VL[i:i + len(sig)] += sig * gl * send; VR[i:i + len(sig)] += sig * gr * send


# ---------------------------------------------------------------- instruments
def kick():
    n = int(0.45 * SR); tt = np.arange(n) / SR
    f = 45 + 140 * np.exp(-tt / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * env_exp(n, 0.16)
    click = filt(rng.standard_normal(n), "highpass", 2500) * env_exp(n, 0.004) * 0.5
    return np.tanh(2.2 * (body + click)) * 0.9


def bass808(freq, dur, glide_from=None):
    n = int(dur * SR); tt = np.arange(n) / SR
    f = np.full(n, freq)
    if glide_from:
        f = freq + (glide_from - freq) * np.exp(-tt / 0.06)
    else:
        f = freq * (1 + 0.6 * np.exp(-tt / 0.02))
    ph = 2 * np.pi * np.cumsum(f) / SR
    amp = np.exp(-tt / 1.4)
    rel = min(n, int(0.03 * SR)); amp[-rel:] *= np.linspace(1, 0, rel)
    x = np.sin(ph) * amp
    return np.tanh(3.0 * x) * 0.75  # saturation -> harmonics audible on phones


def snare():
    n = int(0.35 * SR)
    noise = filt(rng.standard_normal(n), "bandpass", (1500, 9000)) * env_exp(n, 0.09)
    tt = np.arange(n) / SR
    tone = np.sin(2 * np.pi * 190 * tt) * env_exp(n, 0.05)
    return np.tanh(1.6 * (noise * 0.9 + tone * 0.6))


def clap():
    n = int(0.4 * SR); out = np.zeros(n)
    base = filt(rng.standard_normal(n), "bandpass", (900, 5000))
    for k, off in enumerate([0, 0.011, 0.022, 0.03]):
        i = int(off * SR)
        d = 0.012 if k < 3 else 0.14
        out[i:] += base[: n - i] * env_exp(n - i, d)
    return out * 0.8


def hat(open_=False):
    n = int((0.35 if open_ else 0.06) * SR)
    x = filt(rng.standard_normal(n), "highpass", 7500, 4)
    return x * env_exp(n, 0.12 if open_ else 0.018)


def bell(freq, dur=1.6):
    n = int(dur * SR); tt = np.arange(n) / SR
    idx = 3.2 * np.exp(-tt / 0.25)
    mod = np.sin(2 * np.pi * freq * 3.5 * tt) * idx
    car = np.sin(2 * np.pi * freq * tt + mod)
    car += 0.25 * np.sin(2 * np.pi * freq * 2 * tt) * np.exp(-tt / 0.15)
    return car * env_exp(n, 0.55) * 0.5


def supersaw(freqs, dur, cutoff, voices=5, detune=0.012):
    n = int(dur * SR); tt = np.arange(n) / SR
    x = np.zeros(n)
    for f in freqs:
        for v in range(voices):
            d = 1 + detune * (v - (voices - 1) / 2) / ((voices - 1) / 2)
            ph0 = rng.random()
            x += 2 * ((f * d * tt + ph0) % 1.0) - 1
    x /= voices * len(freqs)
    return filt(x, "lowpass", cutoff, 2)


def pad(freqs, dur, cutoff=1200):
    x = supersaw(freqs, dur, cutoff)
    n = len(x); a = int(0.25 * SR); r = int(0.4 * SR)
    e = np.ones(n); e[:a] = np.linspace(0, 1, a); e[-r:] *= np.linspace(1, 0, r)
    return x * e


def stab(freqs, dur=0.45):
    n = int(dur * SR); tt = np.arange(n) / SR
    x = np.zeros(n)
    for f in freqs:
        for d in (0.994, 1.0, 1.006):
            x += 2 * ((f * d * tt) % 1.0) - 1
            x += 0.6 * np.sign(np.sin(2 * np.pi * f * d * 0.5 * tt))
    x /= 3 * len(freqs)
    # brassy filter envelope: crossfade a dark and a bright filtered copy
    dark = filt(x, "lowpass", 600, 1); bright = filt(x, "lowpass", 5800, 1)
    out = dark + (bright - dark) * np.exp(-tt / 0.09)
    out = filt(out, "lowpass", 5000)
    return np.tanh(1.5 * out) * env_exp(n, 0.22)


def impact(big=1.0):
    n = int(2.6 * SR); tt = np.arange(n) / SR
    f = 28 + 70 * np.exp(-tt / 0.12)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(n, 0.9)
    crash = filt(rng.standard_normal(n), "highpass", 1800) * env_exp(n, 0.7) * 0.35
    thud = filt(rng.standard_normal(n), "lowpass", 400) * env_exp(n, 0.08) * 0.8
    return np.tanh(1.8 * big * (boom + thud)) * 0.9, crash


def bat_crack():
    n = int(0.25 * SR); tt = np.arange(n) / SR
    snap = filt(rng.standard_normal(n), "bandpass", (1800, 8000)) * env_exp(n, 0.006) * 1.4
    ping = (np.sin(2 * np.pi * 2350 * tt) + 0.6 * np.sin(2 * np.pi * 3900 * tt)) * env_exp(n, 0.035) * 0.5
    wood = np.sin(2 * np.pi * 620 * tt) * env_exp(n, 0.02) * 0.6
    return np.tanh(2 * (snap + ping + wood))


def clank():
    """Stadium light breaker slamming on."""
    n = int(1.8 * SR); tt = np.arange(n) / SR
    thump = np.sin(2 * np.pi * (40 + 60 * np.exp(-tt / 0.05)) * tt) * env_exp(n, 0.25)
    metal = sum(np.sin(2 * np.pi * f * tt) * env_exp(n, d)
                for f, d in [(211, 0.5), (563, 0.35), (1187, 0.25), (1743, 0.18), (2911, 0.1)])
    click = filt(rng.standard_normal(n), "highpass", 3000) * env_exp(n, 0.01)
    return np.tanh(1.3 * thump + 0.18 * metal + 0.7 * click) * 0.8


def whoosh(dur, rising=True):
    n = int(dur * SR); x = rng.standard_normal(n); out = np.zeros(n); chunk = 1024
    for s in range(0, n, chunk):
        p = s / n
        fc = 300 * (30 ** p) if rising else 300 * (30 ** (1 - p))
        out[s:s + chunk] = filt(x[s:s + chunk], "bandpass", (fc, min(fc * 2.5, 18000)), 1)
    e = np.linspace(0, 1, n) ** 2.2 if rising else np.linspace(1, 0, n) ** 1.5
    return out * e


def riser(dur):
    n = int(dur * SR); tt = np.arange(n) / SR
    f = 110 * 8 ** (tt / dur)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.25
    return (whoosh(dur) * 0.8 + tone * (tt / dur) ** 2)


def crowd(dur):
    n = int(dur * SR)
    x = filt(rng.standard_normal(n), "bandpass", (250, 2800), 2)
    mod = filt(rng.standard_normal(n), "lowpass", 3, 1)
    mod = 0.6 + 0.4 * mod / (np.abs(mod).max() + 1e-9)
    return x * mod


# ---------------------------------------------------------------- harmony
# 4-bar loop: Fm | Db | Bbm | C   (i - VI - iv - V)
CHORDS = [
    (41, [53, 56, 60]),   # F  : F3 Ab3 C4
    (37, [53, 56, 61]),   # Db : F3 Ab3 Db4
    (34, [53, 58, 61]),   # Bbm: F3 Bb3 Db4
    (36, [52, 55, 60]),   # C  : E3 G3 C4
]
BELL = [
    [77, 80, 84, 80, 77, 80, 79, 75],
    [73, 77, 80, 77, 73, 77, 80, 82],
    [70, 73, 77, 73, 70, 73, 77, 79],
    [72, 76, 79, 76, 72, 76, 79, 80],
]
KICKS = {"A": [0, 7, 10], "B": [0, 3, 10, 14], "C": [0, 10, 11]}

# section map
INTRO = range(0, 4); BUILD = range(4, 6)
BREAK = range(27, 29); OUTRO = range(33, 35)


def full_drums(bar):
    return bar not in INTRO and bar not in BUILD and bar not in BREAK and bar not in OUTRO


# ---- intro: crowd bed, stadium-light clanks, filtered pad & bell
add(crowd(12 * BAR) * np.concatenate([np.linspace(0, 1, int(2 * SR)), np.ones(int(12 * BAR * SR) - int(2 * SR))]),
    0, gain=0.10, send=0.3)
for b in range(4):
    add(clank(), t_of(b), gain=0.9, send=0.5, pan=[-0.5, 0.5, -0.25, 0.25][b])
    hits["clank"].append(t_of(b))

for b in range(NBARS):
    root, chord = CHORDS[b % 4]
    if b in OUTRO and b != 33:
        continue
    cutoff = 500 + 250 * b if b < 6 else (900 if b in BREAK else 2200)
    g = 0.22 if b < 6 else (0.3 if b in BREAK else 0.2)
    dur = BAR * (2.5 if b == 33 else 1.02)
    add(pad([mtof(m) for m in chord] + [mtof(chord[0] + 12)], dur, cutoff), t_of(b), gain=g, send=0.5)
    # bell arp (skip in first two bars so the lights own them)
    if b >= 2 and b not in OUTRO:
        for k, m in enumerate(BELL[b % 4]):
            vel = 0.55 if k % 2 else 0.8
            add(bell(mtof(m)), t_of(b, k * 2), gain=0.16 * vel, pan=0.3 * np.sin(k), send=0.6)

# ---- build (bars 4-5): hats in, snare roll, riser, windup into the pitch
for b in BUILD:
    for s in range(0, 16, 2):
        add(hat(), t_of(b, s), gain=0.22)
roll_t = t_of(4)
k = 0
while roll_t < t_of(6) - STEP:
    p = (roll_t - t_of(4)) / (2 * BAR)
    add(snare(), roll_t, gain=0.12 + 0.35 * p, send=0.2)
    roll_t += STEP * (2 if p < 0.5 else (1 if p < 0.85 else 0.5))
add(riser(2 * BAR - STEP * 2), t_of(4), gain=0.45, send=0.4)
add(whoosh(BAR * 0.9), t_of(5, 2), gain=0.5)   # the pitch flying in

# ---- drops: ball impact at bar 6, return from breakdown at bar 29, final hit at 33
for tb, big in [(6, 1.0), (8, 0.6), (18, 0.6), (29, 1.0), (33, 1.1)]:
    boom, crash = impact(big)
    add(boom, t_of(tb), gain=0.8, bus=SUB)
    add(crash, t_of(tb), gain=0.9 * big, send=0.8)
    hits["impact"].append(t_of(tb))
add(bat_crack(), t_of(6), gain=0.9, send=0.5)
add(whoosh(BEAT * 1.5, rising=False), t_of(6), gain=0.3)
add(crowd(5 * BAR) * np.linspace(1, 0, int(5 * BAR * SR)) ** 1.5, t_of(6), gain=0.22, send=0.4)  # crowd roar
add(crowd(4 * BAR) * np.linspace(1, 0, int(4 * BAR * SR)) ** 1.5, t_of(29), gain=0.22, send=0.4)

# ---- main groove
for b in range(NBARS):
    if not full_drums(b):
        continue
    root, chord = CHORDS[b % 4]
    pat = KICKS["A" if b % 4 in (0, 2) else ("B" if b % 4 == 1 else "C")]
    # kicks + 808 (808 sustains until next kick)
    for i, s in enumerate(pat):
        add(kick(), t_of(b, s), gain=0.75, bus=SUB)
        hits["kick"].append(t_of(b, s))
        nxt = pat[i + 1] if i + 1 < len(pat) else 16
        glide = mtof(root + 12) if (s == 14) else None
        note = root + (12 if s == 14 else 0)
        add(bass808(mtof(note), (nxt - s) * STEP + 0.02, glide_from=glide), t_of(b, s), gain=0.85, bus=SUB)
    # snare + clap on beat 3 (half-time)
    add(snare(), t_of(b, 8), gain=0.5, send=0.25)
    add(clap(), t_of(b, 8), gain=0.45, send=0.35, pan=0.1)
    hits["snare"].append(t_of(b, 8))
    if b % 2 == 1:  # ghost snare pickup
        add(snare(), t_of(b, 15), gain=0.14)
    # hats: 8ths with 16th fills; triplet roll every 2nd bar on last beat
    roll = (b % 2 == 1)
    for s in range(16):
        if roll and s >= 12:
            continue
        if s % 2 == 0 or s in (5, 11):
            add(hat(), t_of(b, s), gain=0.26 if s % 4 == 0 else 0.18, pan=0.25)
    if roll:
        n_roll = 6 if b % 4 == 1 else 8
        for j in range(n_roll):
            add(hat(), t_of(b, 12) + j * (4 * STEP / n_roll), gain=0.12 + 0.12 * j / n_roll, pan=0.25)
    if b % 4 == 3:
        add(hat(True), t_of(b, 6), gain=0.12, pan=-0.3, send=0.2)

# brass stabs: logo drop and the NATTY BOYZ finale
for b in list(range(6, 8)) + list(range(29, 33)):
    root, chord = CHORDS[b % 4]
    fr = [mtof(m + 12) for m in chord]
    for s in (0, 3, 6):
        add(stab(fr), t_of(b, s), gain=0.33, send=0.35)
        hits["stab"].append(t_of(b, s))

# ---- breakdown (27-28): sustained 808, heartbeat kicks, riser, silence, then drop
add(bass808(mtof(41), 2 * BAR * 0.95), t_of(27), gain=0.8, bus=SUB)
for s in (0, 3, 8, 11):
    add(kick(), t_of(27, s), gain=0.5, bus=SUB)
    add(kick(), t_of(28, s), gain=0.55, bus=SUB) if s < 8 else None
add(riser(BAR * 0.75), t_of(28), gain=0.55, send=0.4)
add(bat_crack(), t_of(28), gain=0.5, send=0.6)
# gap in the last beat of bar 28 -> "WHO ARE WE?"

# ---- outro (33-34): final stab + pad ring out
root, chord = CHORDS[33 % 4]
add(stab([mtof(m + 12) for m in CHORDS[0][1]], 0.9), t_of(33), gain=0.4, send=0.7)
add(bass808(mtof(41), BAR * 1.6), t_of(33), gain=0.8, bus=SUB)
add(kick(), t_of(33), gain=0.8, bus=SUB)

# ---------------------------------------------------------------- mixdown
def make_ir(sec=2.2):
    n = int(sec * SR)
    e = np.exp(-np.arange(n) / SR / (sec / 5))
    irl = filt(rng.standard_normal(n), "lowpass", 6000) * e
    irr = filt(rng.standard_normal(n), "lowpass", 6000) * e
    return irl / np.abs(irl).sum() * 60, irr / np.abs(irr).sum() * 60


irl, irr = make_ir()
wetL = fftconvolve(filt(VL, "highpass", 250), irl)[:N]
wetR = fftconvolve(filt(VR, "highpass", 250), irr)[:N]

# sidechain: duck the music under kicks/808 hits
duck = np.ones(N)
for kt in hits["kick"] + hits["impact"]:
    i = int(kt * SR); n = min(int(0.22 * SR), N - i)
    duck[i:i + n] = np.minimum(duck[i:i + n], 1 - 0.45 * np.exp(-np.arange(n) / SR / 0.07))

sub = filt(SUB, "lowpass", 9000)
mixL = (L + wetL * 0.35) * duck + sub
mixR = (R + wetR * 0.35) * duck + sub
mix = np.stack([mixL, mixR], 1)[: int(DUR * SR)]

# fade tail, gentle glue, limit
fade = int(1.2 * SR); mix[-fade:] *= np.linspace(1, 0, fade)[:, None]
mix = mix / np.percentile(np.abs(mix), 99.95) * 0.8
mix = np.tanh(mix * 1.25) / np.tanh(1.25)
mix = mix / np.abs(mix).max() * 0.93

pcm = (mix * 32767).astype(np.int16)
import wave
with wave.open("assets/soundtrack.wav", "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())

for k in hits:
    hits[k] = sorted(round(x, 4) for x in hits[k])
with open("timeline.js", "w") as f:
    f.write("window.TL=" + json.dumps({"bpm": BPM, "bars": NBARS, **hits}) + ";\n")

rms = np.sqrt((mix ** 2).mean())
print(f"wrote {DUR:.2f}s  rms={20*np.log10(rms):.1f} dBFS  kicks={len(hits['kick'])}")
