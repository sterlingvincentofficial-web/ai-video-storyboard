"""Mixes the intro's soundtrack for preview videos: every sound event in intro.json (plus the
sounds the cutscene's handlers play) laid on a rotor/alarm bed, using the game's own SFX files
and volumes. Usage: python3 tools/cutscene/mix_audio.py out.wav
"""

import json
import os
import re
import sys
import wave

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SR = 44100


def load(name):
    with wave.open(os.path.join(ROOT, "assets", "sfx", f"{name.lower()}.wav")) as w:
        return np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32767


def pitched(x, p):
    if abs(p - 1) < 1e-3:
        return x
    idx = np.arange(0, len(x) - 1, p)
    return np.interp(idx, np.arange(len(x)), x)


def main(out):
    intro = json.load(open(os.path.join(ROOT, "tools", "cutscene", "intro.json")))
    vols = dict(re.findall(r"(\w+) = \{ Id = nil, Fallback = \"[^\"]*\", Volume = ([\d.]+)",
                           open(os.path.join(ROOT, "src", "shared", "Sounds.luau")).read()))
    vols = {k: float(v) for k, v in vols.items()}
    dur = intro["duration"]
    mix = np.zeros(int(SR * (dur + 2)))

    def put(name, t, pitch=1.0, vol=1.0):
        x = pitched(load(name), pitch) * vols.get(name, 0.6) * vol
        i = int(t * SR)
        n = min(len(x), len(mix) - i)
        mix[i:i + n] += x[:n]

    # rotor bed: loudness follows the shot (inside the cabin, alongside, far away), pitch follows slow-mo
    rate = intro["rate"]
    rate_at = lambda t: float(np.interp(t, [r[0] for r in rate], [r[1] for r in rate]))
    gain_keys = [(0, 1.0), (3.95, 1.0), (4.05, 0.55), (6.95, 0.55), (7.05, 0.07), (9.95, 0.07), (10.05, 0.18), (12.95, 0.35),
                 (13.05, 0.35), (13.6, 0.3), (16.05, 0.3), (16.15, 0.6), (16.55, 0.6), (16.65, 1.0), (18.35, 1.0), (18.45, 0.65),
                 (21.55, 0.65), (21.6, 0.0)]
    rotor = load("Rotor")
    pos, t = 0.0, 0.0
    hop = 512
    while t < 21.6:
        p = 0.6 + 0.4 * rate_at(t)
        g = float(np.interp(t, *zip(*gain_keys)))
        idx = (pos + np.arange(hop) * p) % (len(rotor) - 1)
        i = int(t * SR)
        mix[i:i + hop] += np.interp(idx, np.arange(len(rotor)), rotor) * vols["Rotor"] * g
        pos += hop * p
        t += hop / SR
    for ev in intro["events"]:
        t, kind = ev["t"], ev["do"]
        if kind == "sound":
            put(ev["name"], t, ev.get("pitch", 1), ev.get("volume", 1))
        elif kind == "say" and ev.get("sound"):
            put(ev["sound"], t)
        elif kind == "splat":
            put("Splat", t)
        elif kind == "alarm":
            alarm = load("Alarm")
            k = t
            while k < ev["until"]:
                put("Alarm", k, 1, 1.0 if 16.6 <= k < 18.4 else 0.55)
                k += len(alarm) / SR
        elif kind == "impact":
            put("Thud", t, 0.6)
            put("Crash", t, 1.15, 0.7)
        elif kind == "crash":
            put("Boom", t)
            put("Crash", t)
        elif kind == "land":
            put("Thud", t, 1.2 if ev.get("soft") else 0.9)
        elif kind == "title":
            put("Title", t)
    # a low drum pulse under the temple/camp reveal and the gorilla
    for t0, t1, step, vol in ((7.5, 13.0, 0.6, 0.35), (27.15, 30.0, 0.45, 0.5)):
        k = t0
        while k < t1:
            put("Drum", k, 1.0, vol)
            k += step
    put("Horn", dur - 0.05, 1, 0.8)  # the HUD's horn as gameplay starts
    mix = mix[: int(SR * (dur + 1.5))]
    mix = np.tanh(mix * 1.1) / np.tanh(1.1)
    mix /= max(1e-6, np.max(np.abs(mix))) / 0.9
    with wave.open(out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((mix * 32767).astype(np.int16).tobytes())
    print("wrote", out)


if __name__ == "__main__":
    main(sys.argv[1])
