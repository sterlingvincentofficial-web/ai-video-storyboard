"""Soundtrack for "Sakadung Toilet vs Agent Apple" - Episode 1.

Everything is synthesized here: drums, bass, sound effects, and the singing
(espeak-ng syllables pitched onto the melody with sox). Timing comes from
timeline.py so it lines up with the animation.

    python audio.py out.wav
"""
import os
import subprocess
import sys
import tempfile
import wave

import numpy as np
from scipy import signal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import timeline as T  # noqa: E402

SR = 44100
N = int(T.DURATION * SR)
RNG = np.random.default_rng(3)
TMP = tempfile.mkdtemp(prefix="sakadung_audio_")


# ----------------------------------------------------------------------------
# basics
# ----------------------------------------------------------------------------

def tt(dur):
    return np.arange(int(dur * SR)) / SR


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12.0)


def noise(dur):
    return RNG.uniform(-1, 1, int(dur * SR))


def bp(x, lo, hi, order=2):
    sos = signal.butter(order, [lo, hi], "bandpass", fs=SR, output="sos")
    return signal.sosfilt(sos, x)


def lp(x, f, order=2):
    return signal.sosfilt(signal.butter(order, f, "lowpass", fs=SR, output="sos"), x)


def hp(x, f, order=2):
    return signal.sosfilt(signal.butter(order, f, "highpass", fs=SR, output="sos"), x)


def sweep(f0, f1, dur, curve="exp"):
    t = tt(dur)
    if curve == "exp":
        f = f0 * (f1 / f0) ** (t / dur)
    else:
        f = f0 + (f1 - f0) * t / dur
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def decay(dur, rate):
    return np.exp(-tt(dur) * rate)


def place(buf, x, at, gain=1.0):
    i = int(at * SR)
    if i >= len(buf) or i + len(x) <= 0:
        return
    if i < 0:
        x, i = x[-i:], 0
    j = min(len(buf), i + len(x))
    buf[i:j] += gain * x[: j - i]


def norm(x):
    m = np.max(np.abs(x)) or 1.0
    return x / m


def room(x, amount=0.25, size=0.06):
    """Cheap tiled-bathroom reverb: a handful of decaying echoes, darkened."""
    out = x.copy()
    for k, (d, g) in enumerate(((size, 0.6), (size * 1.7, 0.45), (size * 2.9, 0.33), (size * 4.3, 0.22),
                                (size * 6.1, 0.14), (size * 8.7, 0.08))):
        n = int(d * SR)
        e = np.zeros_like(x)
        e[n:] = x[:-n] if n else x
        out += amount * g * lp(e, 5000 - 500 * k)
    return out


def read_wav(path):
    with wave.open(path) as w:
        sr = w.getframerate()
        a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float64) / 32768
        if w.getnchannels() == 2:
            a = a.reshape(-1, 2).mean(axis=1)
    if sr != SR:
        a = signal.resample_poly(a, SR, sr)
    return a


def write_wav(path, x):
    x = np.clip(x, -1, 1)
    st = np.stack([x, x], axis=1)
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((st * 32767).astype(np.int16).tobytes())


# ----------------------------------------------------------------------------
# drums + bass
# ----------------------------------------------------------------------------

def kick():
    d = 0.35
    return sweep(160, 42, d) * decay(d, 11) + 0.3 * lp(noise(d), 200) * decay(d, 60)


def snare():
    d = 0.22
    return 0.8 * hp(noise(d), 1200) * decay(d, 22) + 0.5 * np.sin(2 * np.pi * 190 * tt(d)) * decay(d, 30)


def hat(open_=False):
    d = 0.18 if open_ else 0.05
    return hp(noise(d), 7000) * decay(d, 14 if open_ else 70)


def clap():
    d = 0.25
    e = np.zeros(int(d * SR))
    for k in (0.0, 0.012, 0.024):
        n = int(k * SR)
        e[n:] += np.exp(-np.arange(len(e) - n) / SR * 30)
    return bp(noise(d), 900, 3000) * e


def bass_note(midi, dur):
    t = tt(dur)
    x = np.tanh(3.0 * np.sin(2 * np.pi * hz(midi) * t)) + 0.3 * np.sin(2 * np.pi * hz(midi) * 2 * t)
    env = np.minimum(1, t / 0.005) * np.exp(-t * 3) * np.minimum(1, (dur - t) / 0.02)
    return lp(x * env, 900)


def organ_stab(notes, dur):
    t = tt(dur)
    x = sum(np.sin(2 * np.pi * hz(n) * t) + 0.5 * np.sin(4 * np.pi * hz(n) * t) for n in notes)
    return x * np.minimum(1, t / 0.01) * np.exp(-t * 7) / len(notes)


BASS_A = [36, 36, 48, 36, 39, 39, 43, 46]
BASS_B = [41, 41, 53, 41, 43, 43, 46, 48]


def music(start, end, intense=False):
    bars = int(np.ceil((end - start) / (4 * T.BEAT)))
    buf = np.zeros(N)
    for bar in range(bars):
        b0 = start + bar * 4 * T.BEAT
        line = BASS_B if (intense and bar % 2) else BASS_A
        for s in range(8):
            ts = b0 + s * T.EIGHTH
            beat = s // 2
            if s % 2 == 0 and (beat in (0, 2) or intense):
                place(buf, kick(), ts, 0.9)
            if s == 7 and not intense:
                place(buf, kick(), ts, 0.6)
            if s in (2, 6):
                place(buf, snare(), ts, 0.45)
                place(buf, clap(), ts, 0.35)
            place(buf, hat(open_=(s % 2 == 1)), ts, 0.16 if s % 2 else 0.12)
            if bar > 0 or intense:
                place(buf, bass_note(line[s] + (5 if intense else 0), T.EIGHTH * 0.95), ts, 0.55)
            if s in (1, 5) and bar > 0:
                chord = [60, 63, 67] if not intense else [65, 68, 72]
                place(buf, organ_stab(chord, 0.2), ts, 0.18)
        if intense and bar == bars - 1:
            for k in range(8):   # snare roll into the thwomp
                place(buf, snare(), b0 + 3 * T.BEAT + k * T.EIGHTH / 4, 0.25 + 0.05 * k)
    i0, i1 = int(start * SR), int(end * SR)
    buf[:i0] = 0
    fade = int(0.012 * SR)
    buf[i1 - fade:i1] *= np.linspace(1, 0, fade)
    buf[i1:] = 0
    return buf


# ----------------------------------------------------------------------------
# voice (espeak-ng -> sox pitch/tempo)
# ----------------------------------------------------------------------------

SPELL = {"ple": "pull", "noo": "noooooooo", "huh": "huh?", "yeah": "yeah", "mm": "mmmm", "doo": "doo"}


def espeak(word, pitch=55, speed=170, voice="en-us+m3"):
    path = os.path.join(TMP, f"es_{abs(hash((word, pitch, speed, voice)))}.wav")
    if not os.path.exists(path):
        subprocess.run(["espeak-ng", "-v", voice, "-p", str(pitch), "-s", str(speed), "-w", path, word],
                       check=True)
    return path


def trim(x, thr=0.02):
    idx = np.where(np.abs(x) > thr)[0]
    if len(idx) == 0:
        return x
    return x[max(0, idx[0] - 50): idx[-1] + 50]


def f0_estimate(x):
    mid = x[len(x) // 4: len(x) // 4 + 2048]
    if len(mid) < 1024:
        return 120.0
    mid = mid - mid.mean()
    ac = np.correlate(mid, mid, "full")[len(mid) - 1:]
    lo, hi = int(SR / 300), int(SR / 70)
    lag = lo + np.argmax(ac[lo:hi])
    return SR / lag


def sox(inp, out, *effects):
    subprocess.run(["sox", inp, out, *effects], check=True, stderr=subprocess.DEVNULL)


def sing(syl, midi, dur):
    word = SPELL.get(syl, syl)
    raw = read_wav(espeak(word))
    raw = trim(raw)
    f0 = f0_estimate(raw)
    cents = 1200 * np.log2(hz(midi) / f0)
    src = os.path.join(TMP, "s_in.wav")
    dst = os.path.join(TMP, "s_out.wav")
    write_mono(src, raw)
    tempo = max(0.25, min(4.0, (len(raw) / SR) / dur))
    sox(src, dst, "pitch", f"{cents:.0f}", "tempo", "-s", f"{tempo:.3f}", "rate", str(SR))
    y = read_wav(dst)[: int(dur * SR)]
    env = np.minimum(1, np.arange(len(y)) / (0.008 * SR)) * np.minimum(1, (len(y) - np.arange(len(y))) / (0.02 * SR))
    return y * env


def write_mono(path, x):
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())


def vocals():
    buf = np.zeros(N)
    for v in T.VOCALS:
        y = sing(v["syl"], v["note"] - 12, v["d"])
        place(buf, norm(y), v["t"], 0.55 * v["loud"])
    # muffled under the plunger
    muff = np.zeros(N)
    for v in T.MUFFLED:
        y = sing("mm", v["note"] - 12, v["d"])
        place(muff, norm(y), v["t"], 0.5)
    buf += lp(muff, 350, 4)
    # "huh?" - rising
    src = os.path.join(TMP, "huh_in.wav")
    dst = os.path.join(TMP, "huh_out.wav")
    write_mono(src, trim(read_wav(espeak("huh?", pitch=70, speed=140))))
    sox(src, dst, "pitch", "500", "bend", "0.05,400,0.25", "rate", str(SR))
    place(buf, norm(read_wav(dst)), T.HUH["t"], 0.6)
    # "NOOOOO" - spirals down the drain
    src = os.path.join(TMP, "no_in.wav")
    dst = os.path.join(TMP, "no_out.wav")
    write_mono(src, trim(read_wav(espeak("noooooooooo", pitch=80, speed=80))))
    raw_len = len(read_wav(src)) / SR
    sox(src, dst, "pitch", "700", "tempo", "-s", f"{raw_len / T.NOOO['d']:.3f}", "bend",
        f"0.1,-1500,{T.NOOO['d'] - 0.2:.2f}", "rate", str(SR))
    no = norm(read_wav(dst))
    t = np.arange(len(no)) / SR
    no *= np.clip(1.15 - t / T.NOOO["d"], 0, 1) * (1 + 0.4 * np.sin(2 * np.pi * 7 * t))
    place(buf, no, T.NOOO["t"], 0.6)
    return room(buf, 0.35, 0.05)


# ----------------------------------------------------------------------------
# sound effects
# ----------------------------------------------------------------------------

F = 1.0 / T.FPS


def sfx():
    buf = np.zeros(N)
    t = np.arange(N) / SR
    # fluorescent hum + crackle when the lights flicker
    hum = 0.012 * (np.sin(2 * np.pi * 120 * t) + 0.5 * np.sin(2 * np.pi * 240 * t) + 0.3 * np.sin(2 * np.pi * 360 * t))
    buf += hum
    for a, b in ((14, 30), (95, 104), (405, 412), (622, 652), (698, 703)):
        d = (b - a) * F
        cr = bp(noise(d), 2000, 6000) * (RNG.uniform(0, 1, int(d * SR)) > 0.97) + 0.4 * np.sin(2 * np.pi * 120 * tt(d)) * np.sign(np.sin(2 * np.pi * 9 * tt(d)))
        place(buf, cr, a * F, 0.12)
    # drips
    for at in (0.8, 2.15, 3.35, 4.9, 6.1, 28.0, 29.3):
        d = 0.09
        place(buf, room(sweep(1400, 500, d) * decay(d, 45), 0.5, 0.07), at, 0.25)
    # door creak
    a, b = T.DOOR_OPEN_F
    d = (b - a) * F + 0.3
    tc = tt(d)
    fr = 110 + 40 * np.sin(2 * np.pi * 0.9 * tc) + 25 * RNG.standard_normal(len(tc)).cumsum() / np.sqrt(len(tc)) * 4
    saw = signal.sawtooth(2 * np.pi * np.cumsum(fr) / SR)
    creak = bp(saw, 400, 2500) * (0.6 + 0.4 * np.abs(np.sin(2 * np.pi * 3.3 * tc))) * np.minimum(1, tc / 0.1) * np.minimum(1, (d - tc) / 0.3)
    place(buf, room(creak), a * F, 0.22)
    # lid clacks
    def clack(g=1.0):
        d = 0.08
        return g * (bp(noise(d), 800, 5000) * decay(d, 60) + 0.6 * np.sin(2 * np.pi * 620 * tt(d)) * decay(d, 50))
    for f in T.LID_RATTLE_1 + T.LID_RATTLE_2:
        place(buf, clack(), f * F, 0.35 + 0.25 * RNG.uniform())
    place(buf, room(clack(1.0)), T.LID_FLIP_F * F, 0.8)
    # BOING as the head springs out
    d = 0.6
    tb = tt(d)
    boing = np.sin(2 * np.pi * np.cumsum(200 + 140 * np.sin(2 * np.pi * 14 * tb) * np.exp(-tb * 5) + 160 * tb) / SR) * decay(d, 4)
    place(buf, boing, T.HEAD_RISE_F[0] * F, 0.45)
    # splash
    place(buf, room(bp(noise(0.4), 300, 4000) * decay(0.4, 9)), T.HEAD_RISE_F[0] * F, 0.35)
    # footsteps
    walks = [(T.APPLE_WALK_F[0], T.APPLE_WALK_F[1]), (457, 490), T.APPLE_WALK2_F]
    for a, b in walks:
        for f in T.walk_contacts(a, b):
            d = 0.12
            step = lp(noise(d), 600) * decay(d, 40) + 0.4 * bp(noise(d), 2000, 5000) * decay(d, 120)
            place(buf, room(step, 0.3), f * F, 0.5)
    # record scratch + Apple's sting + tension drone
    d = 0.4
    ts = tt(d)
    centre = 3500 * (300 / 3500) ** (ts / d)
    scr = np.zeros(len(ts))
    nz = noise(d)
    for k in range(0, len(ts), 1024):
        c = centre[k]
        scr[k:k + 1024] = bp(nz[k:k + 1024 + 512], c * 0.7, min(c * 1.4, 20000))[:len(scr[k:k + 1024])]
    place(buf, scr * (1 + np.sin(2 * np.pi * 30 * ts)), T.SCRATCH_F * F, 0.8)
    d = 1.4
    sting = sum(lp(signal.sawtooth(2 * np.pi * hz(n) * tt(d)), 700) for n in (36, 43, 48)) / 3
    place(buf, room(sting * np.minimum(1, tt(d) / 0.01) * decay(d, 2.5)), T.APPLE_ANGRY_F * F, 0.55)
    d = T.MUSIC_B[0] - T.SCRATCH_F * F
    drone = (np.sin(2 * np.pi * 55 * tt(d)) + 0.5 * np.sin(2 * np.pi * 82.4 * tt(d))) * (0.6 + 0.4 * np.sin(2 * np.pi * 2 * tt(d)))
    place(buf, drone * np.minimum(1, tt(d) / 0.5) * np.minimum(1, (d - tt(d)) / 0.1), T.SCRATCH_F * F, 0.12)
    # THWOMP
    d = 0.45
    thw = sweep(90, 35, d) * decay(d, 7) + 0.7 * lp(noise(d), 500) * decay(d, 14)
    place(buf, room(thw, 0.4), T.THRUST_F[1] * F, 1.0)
    # rubber stretch squeak then POP
    a, b = T.YANK_F
    d = (b - a) * F
    tq = tt(d)
    squeak = np.sin(2 * np.pi * np.cumsum(350 + 600 * tq / d + 40 * np.sin(2 * np.pi * 25 * tq)) / SR)
    place(buf, bp(squeak, 200, 3000) * np.minimum(1, tq / 0.05), a * F, 0.3)
    d = 0.15
    pop = 0.8 * sweep(1800, 300, d) * decay(d, 40) + bp(noise(d), 500, 6000) * decay(d, 80) + sweep(120, 50, d) * decay(d, 25)
    place(buf, room(pop, 0.4), b * F, 0.9)
    # dizzy tweets
    for k, at in enumerate((23.75, 24.05, 24.35, 24.65)):
        d = 0.12
        place(buf, sweep(2600 + 300 * (k % 2), 3600, d) * np.sin(np.pi * tt(d) / d), at, 0.12)
    # whoosh (plunger tossed)
    d = 0.35
    wh = noise(d)
    out = np.zeros(len(wh))
    for k in range(0, len(wh), 1024):
        c = 600 + 2500 * np.sin(np.pi * k / len(wh))
        out[k:k + 1024] = bp(wh[k:k + 1024 + 256], c * 0.6, c * 1.5)[:len(out[k:k + 1024])]
    place(buf, out * np.sin(np.pi * tt(d) / d), T.TOSS_F[0] * F, 0.4)
    # chain clank
    d = 0.6
    clank = sum(np.sin(2 * np.pi * fq * tt(d)) * decay(d, 6 + i * 3) for i, fq in enumerate((523, 1187, 1890, 2650, 3420)))
    place(buf, room(clank / 3 * np.minimum(1, tt(d) / 0.002)), T.CHAIN_YANK_F * F, 0.45)
    # FLUSH
    d = 3.3
    tf = tt(d)
    fl = lp(noise(d), 1400, 3) * (1 + 0.35 * np.sin(2 * np.pi * 5 * tf))
    env = np.minimum(1, tf / 0.25) * np.clip((d - tf) / 1.4, 0, 1)
    gurg = np.zeros(len(tf))
    for _ in range(40):
        at = RNG.uniform(0.2, d - 0.3)
        bd = RNG.uniform(0.04, 0.09)
        bub = sweep(RNG.uniform(90, 180), RNG.uniform(250, 500), bd) * np.sin(np.pi * tt(bd) / bd)
        i = int(at * SR)
        gurg[i:i + len(bub)] += bub[: len(gurg) - i]
    place(buf, room(fl * env * 0.8 + gurg * env * 0.5, 0.4), T.CHAIN_YANK_F * F + 0.05, 0.75)
    # lid SLAM
    place(buf, room(clack(1.6) + sweep(110, 50, 0.08) * 1.2, 0.5), T.LID_SLAM_F * F, 0.9)
    # falling whistle + BONK
    a, b = T.PLUNGER_FALL_F
    d = (b - a) * F
    place(buf, sweep(2200, 700, d) * np.minimum(1, tt(d) / 0.05), a * F, 0.18)
    d = 0.35
    bonk = np.sin(2 * np.pi * np.cumsum(330 - 60 * tt(d) / d) / SR) * decay(d, 12)
    click = 0.5 * sweep(900, 400, 0.05) * decay(0.05, 60)
    bonk[: len(click)] += click
    place(buf, room(bonk, 0.35), b * F, 0.75)
    d = 0.5
    tb = tt(d)
    place(buf, np.sin(2 * np.pi * np.cumsum(500 + 200 * np.sin(2 * np.pi * 18 * tb) * np.exp(-tb * 6)) / SR) * decay(d, 6), b * F + 0.03, 0.2)
    return buf


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "soundtrack.wav")
    mus = music(*T.MUSIC_A) + music(*T.MUSIC_B, intense=True)
    voc = vocals()
    fx = sfx()
    mix = 0.55 * mus + 0.9 * voc + 0.8 * fx
    # level against the loud-but-not-peak parts, then soft-clip the few spikes
    ref = np.percentile(np.abs(mix), 99.5) or 1.0
    mix = np.tanh(0.8 * mix / ref) * 0.92
    write_wav(out, mix)
    print("wrote", out, f"{len(mix) / SR:.2f}s")


if __name__ == "__main__":
    main()
