"""Synthesizes the game's music (pure numpy, 44.1 kHz mono WAV): seamless loops for the calm
between waves, the waves themselves and boss fights, plus victory and game-over stingers.

Tropical toy-island sound: steel drum lead, marimba, plucked bass, shaker and hand drums; the
boss loop swaps to minor with taiko drums and brass stabs. Upload assets/sfx/music_*.wav like
the other sounds and paste the IDs into src/shared/Sounds.luau (the Music* entries).
Run: python3 tools/sfx/make_music.py
"""

import os
import wave

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "assets", "sfx")
SR = 44100
rng = np.random.default_rng(7)

NOTE = {n: i for i, n in enumerate(["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"])}


def hz(name):
    """'C4' / 'F#3' -> frequency."""
    pitch, octave = name[:-1], int(name[-1])
    return 440.0 * 2 ** ((NOTE[pitch] + 12 * (octave + 1) - 69) / 12)


def tt(dur):
    return np.arange(int(SR * dur)) / SR


def adsr(n, a=0.005, d=0.3, curve=5.0):
    x = np.arange(n) / SR
    return np.clip(x / max(a, 1e-4), 0, 1) * np.exp(-curve * np.maximum(0, x - a) / max(d, 1e-4))


def onepole(x, cutoff):
    """Simple low-pass (cutoff may be an array for sweeps)."""
    c = np.broadcast_to(np.asarray(cutoff, float), x.shape)
    a = 1 - np.exp(-2 * np.pi * c / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc += a[i] * (x[i] - acc)
        y[i] = acc
    return y


def highpass(x, cutoff):
    return x - onepole(x, cutoff)


# ---------------------------------------------------------------- instruments

def steel(f, dur=0.9, vel=1.0):
    """Steel pan: inharmonic partials with fast decays and a little pitch bloom."""
    t = tt(dur)
    bend = 1 + 0.004 * np.exp(-t * 30)
    out = np.zeros_like(t)
    for ratio, amp, dec in ((1, 1.0, 0.55), (2.0, 0.5, 0.35), (3.01, 0.22, 0.2), (4.2, 0.1, 0.1), (5.4, 0.05, 0.06)):
        out += amp * np.sin(2 * np.pi * f * ratio * np.cumsum(bend) / SR) * np.exp(-t / dec)
    return out * adsr(len(t), 0.002, dur, 1.5) * vel


def marimba(f, dur=0.5, vel=1.0):
    t = tt(dur)
    out = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.28)
    out += 0.25 * np.sin(2 * np.pi * f * 3.93 * t) * np.exp(-t / 0.05)
    out += 0.06 * np.sin(2 * np.pi * f * 9.8 * t) * np.exp(-t / 0.015)
    return out * adsr(len(t), 0.001, dur) * vel


def pluck_bass(f, dur=0.4, vel=1.0):
    t = tt(dur)
    tri = 2 / np.pi * np.arcsin(np.sin(2 * np.pi * f * t))
    sub = np.sin(2 * np.pi * f * t)
    x = 0.6 * tri + 0.6 * sub
    return np.tanh(1.6 * x) * adsr(len(t), 0.003, dur * 0.8, 3.0) * vel


def brass(f, dur=0.35, vel=1.0):
    t = tt(dur)
    saw = sum(np.sin(2 * np.pi * f * k * t) / k for k in range(1, 12))
    saw += sum(np.sin(2 * np.pi * f * 1.006 * k * t) / k for k in range(1, 12))
    env = adsr(len(t), 0.02, dur, 2.0)
    return onepole(saw * 0.4, 400 + 2600 * env) * env * vel


def kick(vel=1.0):
    t = tt(0.32)
    f = 48 + 110 * np.exp(-t * 28)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.13) * vel


def snare(vel=1.0):
    t = tt(0.22)
    n = highpass(rng.uniform(-1, 1, len(t)), 1200) * np.exp(-t / 0.06)
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.05)
    return (0.8 * n + 0.6 * tone) * vel


def hat(vel=0.3, open_=False):
    t = tt(0.18 if open_ else 0.05)
    return highpass(rng.uniform(-1, 1, len(t)), 7000) * np.exp(-t / (0.06 if open_ else 0.012)) * vel


def shaker(vel=0.18):
    t = tt(0.09)
    env = np.minimum(t / 0.03, 1) * np.exp(-np.maximum(0, t - 0.03) / 0.02)
    return highpass(rng.uniform(-1, 1, len(t)), 5000) * env * vel


def conga(f=210, vel=0.6):
    t = tt(0.3)
    ff = f * (1 + 0.15 * np.exp(-t * 40))
    return np.sin(2 * np.pi * np.cumsum(ff) / SR) * np.exp(-t / 0.12) * vel


def taiko(vel=1.0):
    t = tt(0.7)
    f = 62 + 50 * np.exp(-t * 18)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.3)
    skin = onepole(rng.uniform(-1, 1, len(t)), 900) * np.exp(-t / 0.05)
    return (body + 0.5 * skin) * vel


# ---------------------------------------------------------------- arrangement

class Track:
    def __init__(self, bpm, bars, beats_per_bar=4, tail=2.5):
        self.beat = 60.0 / bpm
        self.length = int(SR * self.beat * beats_per_bar * bars)
        self.buf = {k: np.zeros(self.length + int(SR * tail)) for k in ("dry", "wet")}

    def add(self, x, beat, gain=1.0, wet=0.25):
        i = int(round(beat * self.beat * SR))
        n = min(len(x), len(self.buf["dry"]) - i)
        if n <= 0:
            return
        self.buf["dry"][i:i + n] += x[:n] * gain
        self.buf["wet"][i:i + n] += x[:n] * gain * wet

    def render(self, loop=True, room=0.9):
        ir_t = tt(room)
        ir = rng.uniform(-1, 1, len(ir_t)) * np.exp(-ir_t / (room / 5))
        ir = onepole(ir, 5000)
        ir /= np.sqrt(np.sum(ir ** 2))
        wet = np.fft.irfft(np.fft.rfft(self.buf["wet"], len(self.buf["wet"]) + len(ir))
                           * np.fft.rfft(ir, len(self.buf["wet"]) + len(ir)))[: len(self.buf["wet"])]
        out = self.buf["dry"] + 0.55 * wet
        if loop:  # wrap the tail (ringing notes, reverb) onto the start so the loop is seamless
            tail = out[self.length:]
            out = out[: self.length].copy()
            out[: len(tail)] += tail
        return out


def save(name, x, peak=0.89):
    x = np.tanh(1.15 * x / (np.max(np.abs(x)) + 1e-9)) / np.tanh(1.15)  # gentle glue
    x = x * peak
    with wave.open(os.path.join(OUT, f"{name}.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((x * 32767).astype(np.int16).tobytes())
    print(f"{name}.wav  {len(x) / SR:5.1f}s")


# chords as (root for the bass, chord tones for marimba)
C_PROG = [("C3", ["C4", "E4", "G4"]), ("G2", ["B3", "D4", "G4"]), ("A2", ["C4", "E4", "A4"]), ("F2", ["C4", "F4", "A4"])]

# steel-drum melody, (beat, note, length) per 4 bars; two phrases, the second answers the first
MELODY_A = [(0, "E5", 1), (1, "G5", 0.5), (1.5, "E5", 0.5), (2, "C5", 1), (3, "D5", 1),
            (4, "D5", 0.5), (4.5, "B4", 0.5), (5, "G4", 1), (6, "B4", 0.5), (6.5, "D5", 1.5),
            (8, "C5", 0.5), (8.5, "E5", 0.5), (9, "A5", 1), (10, "G5", 0.5), (10.5, "E5", 1.5),
            (12, "F5", 0.5), (12.5, "E5", 0.5), (13, "C5", 1), (14, "D5", 2)]
MELODY_B = [(0, "G5", 0.5), (0.5, "A5", 0.5), (1, "G5", 1), (2, "E5", 0.5), (2.5, "C5", 1.5),
            (4, "B4", 0.5), (4.5, "D5", 0.5), (5, "G5", 1), (6, "F5", 0.5), (6.5, "D5", 1.5),
            (8, "E5", 0.5), (8.5, "C5", 0.5), (9, "E5", 0.5), (9.5, "A5", 1.5), (11, "G5", 1),
            (12, "A5", 0.5), (12.5, "G5", 0.5), (13, "E5", 0.5), (13.5, "D5", 0.5), (14, "C5", 2)]


def calm():
    """Between waves: laid-back marimba and steel drum, shaker, light congas. 104 bpm, 16 bars."""
    tr = Track(104, 16)
    for bar in range(16):
        root, tones = C_PROG[bar % 4]
        b0 = bar * 4
        tr.add(pluck_bass(hz(root), 0.9), b0, 0.55, 0.05)
        tr.add(pluck_bass(hz(root), 0.4), b0 + 2.5, 0.4, 0.05)
        for k, beat in enumerate((0.5, 1.5, 2, 3, 3.5)):
            tr.add(marimba(hz(tones[k % 3]), 0.5, 0.8), b0 + beat, 0.32, 0.3)
        for s in range(8):
            tr.add(shaker(0.16 if s % 2 else 0.1), b0 + s * 0.5)
        tr.add(conga(230, 0.45), b0 + 1.75)
        tr.add(conga(180, 0.5), b0 + 3)
    for phrase, mel in ((0, MELODY_A), (4, MELODY_B), (8, MELODY_A), (12, MELODY_B)):
        if phrase == 0:
            continue  # first 4 bars: just the groove
        for beat, note, length in mel:
            tr.add(steel(hz(note), 0.5 + length * 0.4, 0.8), phrase * 4 + beat, 0.42, 0.35)
    return tr.render()


def battle():
    """Waves: the same tune, driving. 128 bpm, 16 bars, four-on-the-floor with hand drums."""
    tr = Track(128, 16)
    for bar in range(16):
        root, tones = C_PROG[bar % 4]
        b0 = bar * 4
        for beat in range(4):
            tr.add(kick(), b0 + beat, 0.62, 0.02)
        tr.add(snare(), b0 + 1, 0.45, 0.2)
        tr.add(snare(), b0 + 3, 0.45, 0.2)
        if bar % 4 == 3:
            for k, beat in enumerate((3.25, 3.5, 3.75)):
                tr.add(snare(0.6 + 0.15 * k), b0 + beat, 0.4, 0.2)
        for s in range(8):
            tr.add(hat(0.3, open_=(s % 2 == 1)), b0 + s * 0.5, 0.35, 0.05)
        for beat in (0, 0.75, 1.5, 2, 2.75, 3.5):
            note = root if beat not in (1.5, 3.5) else root[:-1] + str(int(root[-1]) + 1)
            tr.add(pluck_bass(hz(note), 0.28), b0 + beat, 0.5, 0.02)
        for k, beat in enumerate((0.5, 1, 1.5, 2.5, 3, 3.5)):
            tr.add(marimba(hz(tones[(k + bar) % 3]) * 2, 0.3, 0.6), b0 + beat, 0.2, 0.25)
        tr.add(conga(260, 0.5), b0 + 2.25, 0.8)
        tr.add(conga(200, 0.5), b0 + 2.5, 0.8)
    for phrase, mel in ((0, MELODY_A), (4, MELODY_B), (8, MELODY_A), (12, MELODY_B)):
        for beat, note, length in mel:
            tr.add(steel(hz(note), 0.4 + length * 0.3, 0.9), phrase * 4 + beat, 0.45, 0.3)
            if phrase >= 8:  # second half: octave doubling lifts it
                tr.add(steel(hz(note) * 2, 0.3 + length * 0.2, 0.5), phrase * 4 + beat, 0.16, 0.3)
    return tr.render()


A_PROG = [("A1", ["A3", "C4", "E4"]), ("F1", ["A3", "C4", "F4"]), ("G1", ["B3", "D4", "G4"]), ("E1", ["G#3", "B3", "E4"])]
BOSS_RIFF = [(0, "A4"), (0.5, "A4"), (1, "C5"), (1.5, "A4"), (2.5, "E5"), (3, "D5"), (3.5, "C5")]


def boss():
    """Gorilla fights: A minor, taiko drums, brass stabs, a menacing steel-drum riff. 140 bpm, 16 bars."""
    tr = Track(140, 16)
    for bar in range(16):
        root, tones = A_PROG[bar % 4]
        b0 = bar * 4
        for beat in (0, 1.5, 2, 3):
            tr.add(taiko(), b0 + beat, 0.75, 0.25)
        tr.add(kick(), b0, 0.5, 0.02)
        tr.add(kick(), b0 + 2, 0.5, 0.02)
        tr.add(snare(), b0 + 1, 0.4, 0.3)
        tr.add(snare(), b0 + 3, 0.4, 0.3)
        for s in range(8):
            tr.add(hat(0.25), b0 + s * 0.5, 0.3, 0.05)
        for beat in (0, 0.5, 1.5, 2, 2.5, 3.5):
            tr.add(pluck_bass(hz(root[:-1] + "2"), 0.25), b0 + beat, 0.55, 0.02)
        for beat in (0, 2.5):
            for tone in tones:
                tr.add(brass(hz(tone), 0.3), b0 + beat, 0.12, 0.3)
        if bar >= 4:
            for beat, note in BOSS_RIFF:
                f = hz(note) * (0.5 if bar % 8 >= 4 else 1)
                tr.add(steel(f, 0.4, 0.9), b0 + beat, 0.36, 0.3)
        if bar % 4 == 3:
            for k in range(4):
                tr.add(taiko(0.6 + 0.1 * k), b0 + 3 + k * 0.25, 0.6, 0.25)
    return tr.render()


def victory():
    """Stinger: rising steel-drum fanfare onto a big C chord."""
    tr = Track(132, 4, tail=3)
    for k, note in enumerate(["C5", "E5", "G5", "C6", "E6"]):
        tr.add(steel(hz(note), 0.5), k * 0.5, 0.5, 0.35)
    for note in ["C4", "E4", "G4", "C5"]:
        tr.add(brass(hz(note), 1.6), 2.5, 0.2, 0.4)
        tr.add(steel(hz(note) * 2, 2.5), 2.5, 0.25, 0.4)
    tr.add(pluck_bass(hz("C2"), 1.6), 2.5, 0.7, 0.05)
    for k in range(6):
        tr.add(snare(0.5 + 0.1 * k), 1.5 + k * 0.166, 0.4, 0.2)
    tr.add(kick(), 2.5, 0.8)
    tr.add(taiko(), 2.5, 0.6)
    return tr.render(loop=False)[: int(SR * 6)]


def gameover():
    """Stinger: a sad descending steel-drum line and a slow low brass fall."""
    tr = Track(90, 3, tail=3)
    for k, note in enumerate(["G4", "F#4", "F4", "E4"]):
        tr.add(steel(hz(note), 0.9 if k < 3 else 2.2), k * 0.75, 0.5, 0.4)
        tr.add(brass(hz(note) / 2, 0.6 if k < 3 else 1.8), k * 0.75, 0.15, 0.4)
    tr.add(taiko(0.8), 2.25, 0.6)
    return tr.render(loop=False)[: int(SR * 4.5)]


def main():
    os.makedirs(OUT, exist_ok=True)
    save("music_calm", calm())
    save("music_battle", battle())
    save("music_boss", boss())
    save("music_victory", victory())
    save("music_gameover", gameover())


if __name__ == "__main__":
    main()
