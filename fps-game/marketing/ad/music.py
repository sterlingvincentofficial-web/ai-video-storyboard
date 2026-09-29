"""TOONFIRE hype track: original rock music synthesized from scratch with numpy.

150 BPM, E minor. Structure (bars of 1.6 s):
  0-1   intro: filtered palm-muted riff, then drum build + riser
  2     DROP (logo)
  3-12  main riff, world montage (a fill every 2 bars)
  13-16 chorus: open chords + lead guitar, stop hits at the end of bar 16
  17    final chord ring-out (end card)
"""
import numpy as np
from scipy import signal
import wave, sys

SR = 44100
BPM = 150
BEAT = 60 / BPM
BAR = BEAT * 4
E8 = BEAT / 2          # eighth note
S16 = BEAT / 4
TOTAL = 17 * BAR + 4.6
N = int(TOTAL * SR)
rng = np.random.default_rng(7)


def t_of(bar, beat=0.0):
    return bar * BAR + beat * BEAT


def buf():
    return np.zeros(N)


def add(track, start, x, gain=1.0):
    i = int(round(start * SR))
    if i >= N:
        return
    j = min(N, i + len(x))
    if i < 0:
        x = x[-i:]; i = 0
    track[i:j] += x[: j - i] * gain


def tt(dur):
    return np.arange(int(dur * SR)) / SR


def sos_filter(x, kind, f, order=2):
    if kind == 'band':
        sos = signal.butter(order, [f[0] / (SR / 2), f[1] / (SR / 2)], btype='band', output='sos')
    else:
        sos = signal.butter(order, f / (SR / 2), btype=kind, output='sos')
    return signal.sosfilt(sos, x)


def peaking(x, f0, gain_db, q):
    A = 10 ** (gain_db / 40)
    w0 = 2 * np.pi * f0 / SR
    al = np.sin(w0) / (2 * q)
    b = [1 + al * A, -2 * np.cos(w0), 1 - al * A]
    a = [1 + al / A, -2 * np.cos(w0), 1 - al / A]
    return signal.lfilter(np.array(b) / a[0], np.array(a) / a[0], x)


def saw(phase):
    return 2 * (phase % 1.0) - 1


# ---------------------------------------------------------------- notes
NOTE = {'E1': 41.20, 'F#1': 46.25, 'G1': 49.00, 'A1': 55.00, 'B1': 61.74, 'C2': 65.41, 'D2': 73.42, 'E2': 82.41,
        'F#2': 92.50, 'G2': 98.00, 'A2': 110.0, 'B2': 123.47, 'C3': 130.81, 'D3': 146.83, 'E3': 164.81,
        'F#3': 185.0, 'G3': 196.0, 'A3': 220.0, 'B3': 246.94, 'C4': 261.63, 'D4': 293.66, 'E4': 329.63,
        'F#4': 369.99, 'G4': 392.0, 'A4': 440.0, 'B4': 493.88, 'C5': 523.25, 'D5': 587.33, 'E5': 659.25}
CHORD = {  # power chord root / fifth / octave
    'E': ['E2', 'B2', 'E3'], 'G': ['G2', 'D3', 'G3'], 'A': ['A2', 'E3', 'A3'], 'D': ['D3', 'A3', 'D4'],
    'C': ['C3', 'G3', 'C4'], 'B': ['B2', 'F#3', 'B3'], 'F#': ['F#2', 'C#3' if False else 'F#3', 'F#3'],
}
BASS = {'E': 'E1', 'G': 'G1', 'A': 'A1', 'D': 'D2', 'C': 'C2', 'B': 'B1', 'F#': 'F#1'}


# ---------------------------------------------------------------- guitar
def guitar_note(chord, dur, mute, take, accent=1.0):
    """Clean (pre-distortion) power chord; distortion is applied on the whole track."""
    ring = 0.09 if mute else dur + 0.05
    L = ring + (0.02 if mute else 0.25)
    t = tt(L)
    out = np.zeros_like(t)
    for k, n in enumerate(CHORD[chord]):
        f = NOTE[n]
        for d in (-1, 1):
            det = 2 ** ((d * (5 + 2 * take) + rng.normal(0, 1)) / 1200)
            bend = 1 + 0.006 * np.exp(-t / 0.02)          # pick attack pitch bump
            ph = np.cumsum(f * det * bend) / SR + rng.random()
            out += saw(ph) * (1.0 if k < 2 else 0.7)
    if mute:
        env = np.exp(-t / 0.045) * (t < ring) + 0.0
        out = sos_filter(out, 'low', 1400) * env
    else:
        env = np.minimum(1, t / 0.003) * np.exp(-t / 2.4)
        release = np.clip((ring - t) / 0.04, 0, 1)
        out = out * env * release
    pick = rng.normal(0, 1, len(t)) * np.exp(-t / 0.004) * 0.6
    return (out + pick) * accent


def distort(x, drive, take):
    x = sos_filter(x, 'high', 110)
    x = peaking(x, 800, 4, 0.7)
    y = np.tanh(x * drive)
    y = np.tanh(1.6 * y + 0.12 * y * y)            # asymmetric second stage
    # cabinet: scooped mids, presence, steep top cut
    y = sos_filter(y, 'high', 85)
    y = peaking(y, 300, -3, 0.9)
    y = peaking(y, 850, 2.5, 0.8)
    y = peaking(y, 1900, 2.5, 1.2)
    y = sos_filter(y, 'low', 4300 + 300 * take, order=4)
    y = sos_filter(y, 'low', 7000, order=2)
    return y


# ---------------------------------------------------------------- drums
def kick():
    t = tt(0.55)
    f = 48 + 120 * np.exp(-t / 0.028)
    ph = np.cumsum(f) / SR
    body = np.sin(2 * np.pi * ph) * np.exp(-t / 0.3)
    click = sos_filter(rng.normal(0, 1, len(t)), 'high', 1500) * np.exp(-t / 0.004) * 0.5
    return np.tanh((body + click) * 1.6)


def snare(v=1.0):
    t = tt(0.45)
    body = np.sin(2 * np.pi * 186 * t) * np.exp(-t / 0.07) + 0.5 * np.sin(2 * np.pi * 335 * t) * np.exp(-t / 0.045)
    nz = sos_filter(rng.normal(0, 1, len(t)), 'band', (1400, 9500)) * np.exp(-t / 0.15)
    return np.tanh((body * 0.9 + nz * 1.4) * 1.3) * v


METAL = [205.3, 304.4, 369.6, 522.7, 540.0, 800.0]


def metallic(L):
    t = tt(L)
    x = sum(np.sign(np.sin(2 * np.pi * f * 2.6 * t + rng.random() * 6)) for f in METAL)
    return x / len(METAL), t


def hat(open_=False, v=1.0):
    x, t = metallic(0.35 if open_ else 0.08)
    x = x * 0.6 + rng.normal(0, 1, len(t)) * 0.5
    x = sos_filter(x, 'high', 7200)
    return x * np.exp(-t / (0.22 if open_ else 0.022)) * v


def crash(L=2.6):
    x, t = metallic(L)
    x = x * 0.5 + rng.normal(0, 1, len(t)) * 0.8
    x = sos_filter(x, 'high', 3000)
    return x * np.exp(-t / 0.5) * np.minimum(1, t / 0.002)


def tom(f0):
    t = tt(0.5)
    f = f0 * (1 + 0.5 * np.exp(-t / 0.04))
    ph = np.cumsum(f) / SR
    return np.tanh(np.sin(2 * np.pi * ph) * np.exp(-t / 0.22) * 1.4 + rng.normal(0, 1, len(t)) * np.exp(-t / 0.01) * 0.2)


def boom(L=2.2):
    t = tt(L)
    f = 28 + 55 * np.exp(-t / 0.35)
    return np.tanh(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.9) * 2.0)


def riser(L):
    t = tt(L)
    nz = rng.normal(0, 1, len(t))
    out = np.zeros_like(t)
    seg = int(0.05 * SR)
    for i in range(0, len(t), seg):     # stepped band-pass sweep
        fr = i / len(t)
        c = 400 * (30 ** fr)
        out[i:i + seg] = sos_filter(nz[i:i + seg + 200], 'band', (c * 0.7, min(c * 1.4, 18000)))[: len(out[i:i + seg])]
    return out * (np.linspace(0, 1, len(t)) ** 2)


def whoosh(L=0.45, up=True):
    t = tt(L)
    nz = rng.normal(0, 1, len(t))
    out = np.zeros_like(t)
    seg = int(0.02 * SR)
    for i in range(0, len(t), seg):
        fr = i / len(t)
        c = 600 * (10 ** (fr if up else 1 - fr))
        out[i:i + seg] = sos_filter(nz[i:i + seg + 100], 'band', (c * 0.6, min(c * 1.6, 18000)))[: len(out[i:i + seg])]
    return out * np.sin(np.pi * t / L) ** 2


# ---------------------------------------------------------------- arrangement
gtr = [buf(), buf()]            # clean DI tracks, L/R takes
bass = buf()
lead = buf()
kick_t, snare_t, hat_t, cym_t, tom_t, fx_t = buf(), buf(), buf(), buf(), buf(), buf()


def g_event(start, chord, dur, mute=False, accent=1.0, takes=(0, 1)):
    for take in takes:
        jit = rng.normal(0, 0.004)
        add(gtr[take], start + jit, guitar_note(chord, dur, mute, take, accent))


def b_event(start, chord, dur, accent=1.0):
    f = NOTE[BASS[chord]]
    t = tt(dur + 0.03)
    ph = np.cumsum(np.full(len(t), f)) / SR
    x = saw(ph) * 0.6 + np.sin(2 * np.pi * ph) * 0.8
    env = np.minimum(1, t / 0.004) * np.clip((dur + 0.03 - t) / 0.03, 0, 1) * (0.7 + 0.3 * np.exp(-t / 0.1))
    add(bass, start, x * env * accent)


# main riff: 2-bar phrase on an eighth grid: (slot, chord, length in eighths, muted)
RIFF = [(0, 'E', 2, False), (2, 'E', 1, True), (3, 'E', 1, True), (4, 'G', 2, False), (6, 'E', 1, True), (7, 'A', 1, False),
        (8, 'E', 2, False), (10, 'E', 1, True), (11, 'E', 1, True), (12, 'D', 1, False), (13, 'C', 1, False), (14, 'B', 2, False)]


def riff(bar, takes=(0, 1), with_bass=True, half=None):
    for slot, ch, ln, mute in RIFF:
        if half == 0 and slot >= 8: continue
        if half == 1 and slot < 8: continue
        st = t_of(bar) + slot * E8 - (8 * E8 if half == 1 else 0)
        g_event(st, ch, ln * E8 * 0.95, mute, 1.0 if not mute else 0.85, takes)
        if with_bass:
            for k in range(ln):
                b_event(st + k * E8, ch, E8 * 0.9)


def groove(bar, fill=False, crash_on=False, busy=False):
    b0 = t_of(bar)
    kicks = [0, 1.5, 2, 3.5] if not busy else [0, 0.75, 1.5, 2, 2.75, 3.5]
    for k in kicks:
        add(kick_t, b0 + k * BEAT, kick())
    for s in (1, 3):
        if fill and s == 3: continue
        add(snare_t, b0 + s * BEAT, snare())
    for e in range(8):
        if fill and e >= 6: continue
        add(hat_t, b0 + e * E8, hat(open_=(e % 2 == 1 and busy), v=0.8 if e % 2 else 1.0))
    if crash_on:
        add(cym_t, b0, crash())
    if fill:  # 16th snare/tom fill on beats 3-4
        seq = [('s', 0.7), ('s', 0.8), ('t', 190), ('t', 160), ('t', 130), ('t', 110), ('s', 1.0), ('s', 1.1)]
        for i, (kind, v) in enumerate(seq):
            st = b0 + 2 * BEAT + i * S16
            if kind == 's': add(snare_t, st, snare(v))
            else: add(tom_t, st, tom(v))


# intro bar 0: lone guitar (filtered later); bar 1: band enters with a snare build
riff(0, takes=(0,), with_bass=False, half=0)
riff(1, half=1)
for i in range(4):
    add(kick_t, t_of(1, i), kick() * 0.85)
for i in range(4):                                   # 8ths on beats 1-2
    add(snare_t, t_of(1) + i * E8, snare(0.35 + 0.08 * i))
for i in range(8):                                   # 16ths on beats 3-4
    add(snare_t, t_of(1, 2) + i * S16, snare(0.6 + 0.06 * i))
add(fx_t, t_of(0, 2), riser(1.5 * BAR), 0.22)
rc = crash(1.4)[::-1]
add(fx_t, t_of(2) - len(rc) / SR, rc, 0.8)          # reverse cymbal into the drop

# bar 2: DROP - one huge ringing chord over a half-time beat (logo slam)
g_event(t_of(2), 'E', BAR * 0.97, mute=False, accent=1.15)
b_event(t_of(2), 'E', BAR * 0.95)
add(cym_t, t_of(2), crash(2.4), 1.1)
add(fx_t, t_of(2), boom(2.4), 1.0)
for k in (0, 2, 2.5):
    add(kick_t, t_of(2, k), kick())
add(snare_t, t_of(2, 2), snare(1.1))
for e in range(8):
    add(hat_t, t_of(2) + e * E8, hat(open_=e % 2 == 1, v=0.7))
for i in range(4):                                   # pickup into the riff
    add(tom_t, t_of(2, 3) + i * S16, tom(190 - 25 * i))

# bars 3..12: main riff in 2-bar phrases, one per world
for bar in range(3, 13, 2):
    riff(bar)
for bar in range(3, 13):
    first = (bar - 3) % 2 == 0
    groove(bar, fill=not first, crash_on=first, busy=(bar >= 11))

# chorus: bars 13..16 open eighth-note chords + lead
CHO = [['C'] * 8, ['D'] * 8, ['C'] * 4 + ['D'] * 4, ['E'] * 4]
for i, seq in enumerate(CHO):
    bar = 13 + i
    for e, ch in enumerate(seq):
        g_event(t_of(bar) + e * E8, ch, E8 * 0.97, mute=False, accent=0.9 if e % 2 else 1.0)
        b_event(t_of(bar) + e * E8, ch, E8 * 0.9)
    groove(bar, crash_on=True, busy=True, fill=False) if bar < 16 else None
# bar 16: two beats of groove then stop hits on 3, 3&, 4
for k in (0, 1.5):
    add(kick_t, t_of(16, k), kick())
add(snare_t, t_of(16, 1), snare())
add(cym_t, t_of(16), crash())
for e in range(4):
    add(hat_t, t_of(16) + e * E8, hat())
for hb in (2, 2.5, 3):
    st = t_of(16, hb)
    g_event(st, 'E', E8 * 0.8, mute=False, accent=1.1)
    b_event(st, 'E', E8 * 0.8)
    add(kick_t, st, kick()); add(snare_t, st, snare(1.1)); add(cym_t, st, crash(1.0), 0.6)
# final: bar 17 huge E chord + crash + boom, ring out
g_event(t_of(17), 'E', 4.2, mute=False, accent=1.15)
b_event(t_of(17), 'E', 3.8)
add(kick_t, t_of(17), kick()); add(snare_t, t_of(17), snare(1.2)); add(cym_t, t_of(17), crash(4.0), 1.1)
add(fx_t, t_of(17), boom(3.0), 1.0)
for i in range(6):   # tom roll decoration before the final
    add(tom_t, t_of(16, 3.5) + i * S16 / 1.5, tom(200 - i * 20) * 0.7)

# lead guitar in the chorus (heroic line)
LEAD = [  # (bar, beat, note, beats)
    (13, 0, 'G4', 1), (13, 1, 'E4', 0.5), (13, 1.5, 'G4', 0.5), (13, 2, 'C5', 1.5), (13, 3.5, 'B4', 0.5),
    (14, 0, 'A4', 1), (14, 1, 'F#4', 0.5), (14, 1.5, 'A4', 0.5), (14, 2, 'D5', 1.5), (14, 3.5, 'C5', 0.5),
    (15, 0, 'C5', 0.5), (15, 0.5, 'B4', 0.5), (15, 1, 'A4', 0.5), (15, 1.5, 'G4', 0.5), (15, 2, 'A4', 0.5), (15, 2.5, 'B4', 0.5), (15, 3, 'C5', 0.5), (15, 3.5, 'D5', 0.5),
    (16, 0, 'E5', 2),
]
for bar, beat, n, beats in LEAD:
    f = NOTE[n]
    L = beats * BEAT
    t = tt(L + 0.05)
    vib = 1 + 0.006 * np.sin(2 * np.pi * 6 * t) * np.clip((t - 0.15) / 0.2, 0, 1)
    slide = 1 - 0.03 * np.exp(-t / 0.03)
    ph = np.cumsum(f * vib * slide) / SR
    x = saw(ph) + 0.5 * saw(ph * 1.003)
    env = np.minimum(1, t / 0.005) * np.clip((L + 0.05 - t) / 0.05, 0, 1)
    add(lead, t_of(bar, beat), x * env)

# ---------------------------------------------------------------- mix
print('rendering stems...', file=sys.stderr)
gL = distort(gtr[0], 9.0, 0)
gR = distort(gtr[1], 9.0, 1)
# intro bar 0: "radio" filtered guitar opening up
edge = int(t_of(1) * SR)
fade = int(0.15 * SR)
for g in (gL, gR):
    lo = sos_filter(g, 'band', (450, 2600), order=2)
    mix = np.ones(N)
    mix[:edge] = 0
    mix[edge:edge + fade] = np.linspace(0, 1, fade)
    g[:] = lo * (1 - mix) * 2.4 + g * mix
bass_p = np.tanh(sos_filter(bass, 'low', 900) * 1.8)
lead_p = distort(lead * 0.5, 7.0, 1)
lead_p = sos_filter(lead_p, 'high', 300)
dly = int(BEAT * 0.75 * SR)
lead_d = lead_p.copy()
for k in range(1, 4):
    lead_d[dly * k:] += lead_p[:-dly * k] * (0.35 ** k)


def reverb_ir(L=1.4, seed=1):
    r = np.random.default_rng(seed)
    t = tt(L)
    ir = sos_filter(r.normal(0, 1, len(t)), 'low', 5000) * np.exp(-t / 0.35)
    return ir / np.sqrt((ir ** 2).sum())


drums = kick_t * 0.85 + snare_t * 0.8 + tom_t * 0.7
rv = [signal.fftconvolve(snare_t * 0.6 + tom_t * 0.4 + lead_d * 0.3 + (gtr_wet := (gL + gR) * 0.1), reverb_ir(seed=s))[:N] * 0.22 for s in (1, 2)]
cymL = cym_t * 0.2 + hat_t * 0.11
cymR = np.roll(cym_t, 90) * 0.2 + hat_t * 0.14

L_ = drums + cymL + bass_p * 0.5 + gL * 0.66 + gR * 0.2 + lead_d * 0.3 + rv[0] + fx_t * 0.3
R_ = drums + cymR + bass_p * 0.5 + gR * 0.66 + gL * 0.2 + lead_d * 0.34 + rv[1] + fx_t * 0.3
st = np.stack([L_, R_], axis=1)
# glue: slow RMS compressor + soft limiter
env = np.sqrt(signal.lfilter([0.002], [1, -0.998], (st ** 2).mean(axis=1)))
gain = 1 / np.maximum(1, (env / (env.max() * 0.35)) ** 0.45)
st *= gain[:, None]
st /= np.abs(st).max()
st = np.tanh(st * 1.5) / np.tanh(1.5)
# fade out the tail
tail = int(0.8 * SR)
st[-tail:] *= np.linspace(1, 0, tail)[:, None] ** 2
st *= 0.84
out = sys.argv[1] if len(sys.argv) > 1 else 'music.wav'
with wave.open(out, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((st * 32767).astype(np.int16).tobytes())
print('wrote', out, f'{TOTAL:.2f}s', file=sys.stderr)

import os
if os.environ.get('STEMS'):
    a, b = int(t_of(4) * SR), int(t_of(10) * SR)
    def bands(x):
        f, P = signal.welch(x[a:b], SR, nperseg=4096)
        return ' '.join(f'{10*np.log10(P[(f>=lo)&(f<hi)].sum()+1e-12):6.1f}' for lo, hi in ((20,60),(60,250),(250,2000),(2000,6000),(6000,20000)))
    for name, x in (('kick', kick_t), ('snare', snare_t * 0.75), ('toms', tom_t * 0.7), ('hats', hat_t * 0.12), ('cym', cym_t * 0.2), ('bass', bass_p * 0.5), ('gtrL', gL * 0.66), ('fx', fx_t * 0.3), ('verb', rv[0])):
        print(f'{name:6s}', bands(x))
