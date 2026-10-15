"""Synthesizes the game's cartoon sound effects (pure numpy, 44.1 kHz mono WAV).

Upload assets/sfx/*.wav in Studio (Asset Manager > Bulk Import), then paste each ID into
src/shared/Sounds.luau. Run: python3 tools/sfx/make_sfx.py
"""

import os
import wave

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "assets", "sfx")
SR = 44100
rng = np.random.default_rng(1)


def t(dur):
    return np.linspace(0, dur, int(SR * dur), endpoint=False)


def env(n, attack=0.005, decay=0.2, curve=4.0):
    x = np.arange(n) / SR
    a = np.clip(x / max(attack, 1e-4), 0, 1)
    d = np.exp(-curve * np.maximum(0, x - attack) / max(decay, 1e-4))
    return a * d


def sweep(f0, f1, dur, shape="sine"):
    tt = t(dur)
    f = f0 * (f1 / f0) ** (tt / dur)
    ph = 2 * np.pi * np.cumsum(f) / SR
    if shape == "square":
        return np.sign(np.sin(ph)) * 0.6
    if shape == "tri":
        return 2 / np.pi * np.arcsin(np.sin(ph))
    return np.sin(ph)


def noise(dur):
    return rng.uniform(-1, 1, int(SR * dur))


def lowpass(x, k):
    kernel = np.ones(k) / k
    return np.convolve(x, kernel, mode="same")


def mix(*parts):
    n = max(len(p) for p in parts)
    out = np.zeros(n)
    for p in parts:
        out[: len(p)] += p
    return out


def save(name, x, gain=0.9):
    x = x / (np.max(np.abs(x)) + 1e-9) * gain
    data = (x * 32767).astype(np.int16)
    with wave.open(os.path.join(OUT, f"{name}.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())


def main():
    os.makedirs(OUT, exist_ok=True)
    # pop: bubbly upward blip with a click
    p = sweep(380, 1500, 0.09) * env(int(SR * 0.09), 0.002, 0.05)
    save("pop", mix(p, noise(0.01) * 0.6 * env(int(SR * 0.01), 0.0005, 0.004)))
    # boing: springy wobble
    tt = t(0.5)
    f = 220 + 180 * np.exp(-tt * 4) * np.sin(2 * np.pi * 9 * tt) + 120 * tt
    save("boing", np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(tt), 0.003, 0.35, 3))
    # bonk: hollow wood knock
    save("bonk", mix(sweep(520, 300, 0.12, "tri") * env(int(SR * 0.12), 0.001, 0.05),
                     lowpass(noise(0.03), 6) * env(int(SR * 0.03), 0.0005, 0.01)))
    # hit: short punchy thump
    save("hit", mix(sweep(180, 60, 0.12) * env(int(SR * 0.12), 0.001, 0.06),
                    lowpass(noise(0.05), 3) * env(int(SR * 0.05), 0.0005, 0.015) * 0.7))
    # clank: metallic ping
    tt = t(0.35)
    clank = sum(np.sin(2 * np.pi * f * tt) * a for f, a in ((880, 1), (1312, 0.7), (2110, 0.5), (3020, 0.3)))
    save("clank", clank * env(len(tt), 0.001, 0.12))
    # swing / throw / sling / net: filtered noise whooshes
    for name, dur, k in (("swing", 0.18, 12), ("throw", 0.24, 20), ("sling", 0.12, 4), ("net", 0.3, 30)):
        n = noise(dur)
        shape = np.sin(np.linspace(0, np.pi, len(n))) ** 2
        save(name, lowpass(n, k) * shape, 0.7)
    # chop: whoosh + thunk
    save("chop", mix(lowpass(noise(0.12), 10) * np.sin(np.linspace(0, np.pi, int(SR * 0.12))) ** 2 * 0.5,
                     np.concatenate([np.zeros(int(SR * 0.1)), sweep(160, 70, 0.15) * env(int(SR * 0.15), 0.001, 0.06)])))
    # shot: crack
    save("shot", mix(noise(0.25) * env(int(SR * 0.25), 0.0005, 0.06, 6), sweep(400, 80, 0.1) * env(int(SR * 0.1), 0.001, 0.04)))
    # boom: low rumble explosion
    save("boom", mix(lowpass(noise(0.9), 40) * env(int(SR * 0.9), 0.002, 0.35, 3) * 2,
                     sweep(90, 30, 0.6) * env(int(SR * 0.6), 0.002, 0.3)))
    # coin: classic two-note ding
    a = np.sin(2 * np.pi * 988 * t(0.07)) * env(int(SR * 0.07), 0.001, 0.1, 1)
    b = np.sin(2 * np.pi * 1319 * t(0.3)) * env(int(SR * 0.3), 0.001, 0.25, 3)
    save("coin", np.concatenate([a, b]) * 0.8)
    # combo: bright arpeggio chime
    notes = [660, 880, 1320]
    save("combo", np.concatenate([np.sin(2 * np.pi * f * t(0.06)) * env(int(SR * 0.06), 0.001, 0.08, 1) for f in notes]))
    # squeak: monkey "ooh!" (pitched glide with vibrato)
    tt = t(0.32)
    f = 600 + 500 * np.sin(np.pi * tt / 0.32) + 30 * np.sin(2 * np.pi * 28 * tt)
    save("squeak", np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * tt / 0.32) ** 0.5)
    # whee: long rising cartoon slide
    save("whee", sweep(300, 1800, 0.7, "tri") * np.sin(np.linspace(0, np.pi, int(SR * 0.7))))
    # thud / place: soft landing
    save("thud", sweep(140, 50, 0.2) * env(int(SR * 0.2), 0.001, 0.08))
    save("place", mix(sweep(200, 70, 0.18) * env(int(SR * 0.18), 0.001, 0.07),
                      np.sin(2 * np.pi * 880 * t(0.12)) * env(int(SR * 0.12), 0.001, 0.08) * 0.3))
    # slam: heavy ground hit
    save("slam", mix(sweep(70, 25, 0.8) * env(int(SR * 0.8), 0.001, 0.4, 3) * 1.5, lowpass(noise(0.5), 25) * env(int(SR * 0.5), 0.001, 0.2)))
    # roar: growly noise through a wobbling filter
    tt = t(1.2)
    growl = lowpass(noise(1.2), 18) * (1 + 0.6 * np.sin(2 * np.pi * 32 * tt))
    growl += sweep(110, 70, 1.2, "square") * 0.4
    save("roar", growl * np.sin(np.pi * tt / 1.2) ** 0.6)
    # level up / horn / rally / boss down: little fanfares
    def fanfare(freqs, step, tail):
        parts = []
        for i, f in enumerate(freqs):
            d = tail if i == len(freqs) - 1 else step
            tone = sweep(f, f, d, "square") * 0.5 + np.sin(2 * np.pi * f * 2 * t(d)) * 0.3
            parts.append(tone * env(len(tone), 0.004, d * 0.8, 2))
        return np.concatenate(parts)
    save("levelup", fanfare([523, 659, 784, 1047], 0.08, 0.35), 0.7)
    save("horn", fanfare([392, 392, 523], 0.12, 0.5), 0.7)
    save("rally", fanfare([392, 523, 659], 0.09, 0.3), 0.7)
    save("bossdown", fanfare([523, 659, 784, 1047, 784, 1047], 0.11, 0.9), 0.8)
    # heal: soft shimmer
    tt = t(0.5)
    save("heal", sum(np.sin(2 * np.pi * f * tt) for f in (880, 1108, 1320)) * env(len(tt), 0.05, 0.4, 2), 0.6)
    # ui / deny
    save("ui", np.sin(2 * np.pi * 1200 * t(0.04)) * env(int(SR * 0.04), 0.001, 0.02), 0.5)
    save("deny", sweep(300, 180, 0.18, "square") * env(int(SR * 0.18), 0.002, 0.15), 0.5)
    print("wrote", len(os.listdir(OUT)), "sounds to", OUT)


if __name__ == "__main__":
    main()
