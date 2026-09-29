# Music-box score + paper SFX + narration -> final.wav
import json, glob, wave
import numpy as np
SR = 48000
tl = json.load(open('tl.json')); DUR = tl['DUR']; N = int(DUR * SR) + SR
w = wave.open('narration.wav'); nar = np.frombuffer(w.readframes(w.getnframes()), '<i2').astype(np.float32) / 32767
nar = np.pad(nar, (0, max(0, N - len(nar))))[:N]
ev, bounds = set(), []
for f in glob.glob('seg*.mp4.ev.json'):
    d = json.load(open(f)); ev |= set(d['ev']); bounds = d['bounds']
rng = np.random.default_rng(7)
out = np.zeros((N, 2))
def add(t, sig, g=1.0, pan=0.0):
    i = int(t * SR)
    if i < 0 or i >= N: return
    s = sig[:N - i] * g; out[i:i + len(s), 0] += s * (1 - pan); out[i:i + len(s), 1] += s * (1 + pan)
def m2f(m): return 440 * 2 ** ((m - 69) / 12)
def bell(f, d=1.6):
    t = np.arange(int(d * SR)) / SR
    return (np.sin(2*np.pi*f*t) + .35*np.sin(2*np.pi*f*2.01*t)*np.exp(-t*6) + .15*np.sin(2*np.pi*f*3.99*t)*np.exp(-t*9)) * np.exp(-t*3.2) * np.minimum(1, t*400)
def pluck(f, d=.9):
    t = np.arange(int(d * SR)) / SR
    return (np.sin(2*np.pi*f*t) + .3*np.sin(4*np.pi*f*t)) * np.exp(-t*5) * np.minimum(1, t*300)
# gentle waltz-ish music box in F major, 100 bpm
beat = 60 / 100; prog = [[65, 69, 72], [62, 65, 69], [58, 62, 65], [60, 64, 67]]
mel = [77, 76, 74, 72, 74, 76, 77, 79, 81, 79, 77, 76, 74, 72, 70, 72]
bar = 0; t = .2
while t < DUR:
    ch = prog[bar % 4]
    add(t, pluck(m2f(ch[0] - 24)), .22)
    for k in range(4):
        add(t + k * beat, bell(m2f(ch[k % 3] + 12)), .07, .3 * np.sin(k))
        if rng.random() < .8: add(t + k * beat + beat / 2, bell(m2f(mel[(bar * 4 + k) % len(mel)])), .06, -.25)
    bar += 1; t += 4 * beat
# duck music under narration
env = np.convolve(np.abs(nar), np.ones(SR // 10) / (SR // 10), 'same')
duck = 1 - .45 * np.clip(env / (env.max() * .15 + 1e-9), 0, 1)
out *= duck[:, None]
fade = np.ones(N); fade[:SR] = np.linspace(0, 1, SR); fe = int((DUR - 1.2) * SR); fade[fe:] = np.linspace(1, 0, N - fe)
out *= fade[:, None]
# paper SFX
def noise_burst(d, lo, hi):
    n = int(d * SR); x = rng.standard_normal(n); X = np.fft.rfft(x); fr = np.fft.rfftfreq(n, 1 / SR)
    X[(fr < lo) | (fr > hi)] = 0; y = np.fft.irfft(X, n); return y / (np.abs(y).max() + 1e-9)
for e in ev:
    kind, tt = e.split(':'); tt = float(tt)
    if kind == 'pop':
        n = int(.09 * SR); tk = np.arange(n) / SR
        s = noise_burst(.09, 1500, 6000) * np.exp(-tk * 55) * .6 + np.sin(2*np.pi*(180 + 400*np.exp(-tk*40))*tk) * np.exp(-tk * 30)
        add(tt, s, .16, rng.uniform(-.3, .3))
    elif kind == 'rise':
        n = int(.35 * SR); tk = np.arange(n) / SR
        add(tt, noise_burst(.35, 800, 5000) * np.sin(np.pi * tk / .35) ** 2, .07)
    elif kind == 'tick':
        n = int(.03 * SR); tk = np.arange(n) / SR
        add(tt, noise_burst(.03, 2500, 9000) * np.exp(-tk * 120), .08, rng.uniform(-.4, .4))
for b in bounds:
    n = int(.9 * SR); tk = np.arange(n) / SR
    add(b - .45, noise_burst(.9, 300, 3500) * np.sin(np.pi * tk / .9) ** 2, .09)
out[:, 0] += nar; out[:, 1] += nar
out /= max(1.0, np.abs(out).max() / .95)
wv = wave.open('final.wav', 'wb'); wv.setnchannels(2); wv.setsampwidth(2); wv.setframerate(SR)
wv.writeframes((out[:int(DUR * SR)] * 32767).astype('<i2').tobytes()); wv.close(); print('mixed', len(ev), 'sfx')
