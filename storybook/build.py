# Fetches assets, keys the green-screen cutouts, grabs fonts, and builds the
# narration track + timeline. Runs inside the Higgsfield sandbox.
import json, os, re, subprocess, urllib.request, wave
import numpy as np
from PIL import Image

os.makedirs('raw', exist_ok=True); os.makedirs('assets', exist_ok=True); os.makedirs('fonts', exist_ok=True)
A = json.load(open('assets.json'))
procs = []
for k, u in A.items():
    ext = '.wav' if u.endswith('.wav') else '.png'
    procs.append(subprocess.Popen(['curl', '-sSf', '--retry', '3', '-o', f'raw/{k}{ext}', u]))
for p in procs: p.wait()

# ---- cutouts: chroma key the flat green background, despill, crop ----
for k in A:
    if k[0] == 'c':
        im = np.asarray(Image.open(f'raw/{k}.png').convert('RGB')).astype(np.float32)
        r, g, b = im[..., 0], im[..., 1], im[..., 2]
        m = np.maximum(r, b); gd = g - m
        a = np.clip(1 - (gd - 25) / 60, 0, 1)
        g2 = np.where(gd > 0, m + (g - m) * 0.15, g)
        out = np.dstack([r, g2, b, a * 255]).clip(0, 255).astype(np.uint8)
        o = Image.fromarray(out, 'RGBA')
        o = o.crop(o.getchannel('A').point(lambda v: 255 if v > 30 else 0).getbbox())
        o.thumbnail((1000, 1000)); o.save(f'assets/{k}.png')
    elif k[0] == 'b':
        Image.open(f'raw/{k}.png').convert('RGB').resize((1960, 1104)).save(f'assets/{k}.jpg', quality=92)

# ---- ransom-note fonts ----
FAM = ['Abril Fatface', 'Alfa Slab One', 'Bungee', 'Rubik Mono One', 'Special Elite', 'Titan One',
       'Shrikhand', 'Bowlby One', 'Playfair Display:wght@900', 'Courier Prime:wght@700']
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'
css = []
for i, f in enumerate(FAM):
    try:
        q = urllib.request.Request('https://fonts.googleapis.com/css2?family=' + f.replace(' ', '+') + '&display=block', headers={'User-Agent': UA})
        c = urllib.request.urlopen(q, timeout=20).read().decode()
        m = re.search(r'/\* latin \*/[^}]*?url\((.*?)\)', c, re.S) or re.search(r'url\((.*?)\)', c)
        urllib.request.urlretrieve(m.group(1), f'fonts/f{i}.woff2')
        css.append(f"@font-face{{font-family:R{i};src:url(fonts/f{i}.woff2)}}")
    except Exception as e:
        print('font fail', f, e); css.append(f"@font-face{{font-family:R{i};src:local('DejaVu Sans Bold')}}")
open('fonts.css', 'w').write('\n'.join(css))

# ---- narration: trim long pauses, fit to ~60s, lay out on a timeline ----
SR = 48000
def load(p):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', p, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True).stdout
    return np.frombuffer(raw, np.float32).copy()

def squeeze(x, cap=0.26):
    fr = SR // 100; n = len(x) // fr
    rms = np.sqrt((x[:n * fr].reshape(n, fr) ** 2).mean(1))
    v = rms > max(0.006, rms.max() * 0.04)
    idx = np.where(v)[0]
    a, b = max(0, idx[0] - 3), min(n, idx[-1] + 6)
    keep, i, capf = [], a, int(cap * 100)
    while i < b:
        if v[i]: keep.append(i); i += 1; continue
        j = i
        while j < b and not v[j]: j += 1
        run = list(range(i, j)); keep += run[:capf // 2] + run[-(capf - capf // 2):] if len(run) > capf else run
        i = j
    return np.concatenate([x[k * fr:(k + 1) * fr] for k in keep])

def tempo(x, f):
    if abs(f - 1) < 1e-3: return x
    x.astype('<f4').tofile('t_in.raw')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', 't_in.raw', '-filter:a', f'atempo={f:.4f}', '-f', 'f32le', 't_out.raw'], check=True)
    return np.fromfile('t_out.raw', '<f4')

ORDER = [0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12]
GAP = {1: .45, 2: .35, 4: .75, 5: .4, 6: .75, 7: .6, 8: .7, 9: .8, 10: .75, 11: .75, 12: .9}
INTRO, OUTRO, TARGET = 1.5, 2.2, 60.0
clips = {i: squeeze(load(f'raw/L{i}.wav')) for i in ORDER}
speech = sum(len(c) for c in clips.values()) / SR
gaps = sum(GAP.get(i, .4) for i in ORDER[1:])
tf = min(1.3, max(1.0, speech / (TARGET - INTRO - OUTRO - gaps)))
print('speech', round(speech, 2), 'tempo', round(tf, 3))
clips = {i: tempo(c, tf) for i, c in clips.items()}
t, L = INTRO, {}
for n, i in enumerate(ORDER):
    if n: t += GAP.get(i, .4)
    L[i] = [round(t, 3), round(len(clips[i]) / SR, 3)]
    t += len(clips[i]) / SR
DUR = round(t + OUTRO, 2)
mix = np.zeros(int(DUR * SR) + SR)
for i in ORDER:
    s = int(L[i][0] * SR); mix[s:s + len(clips[i])] += clips[i]
mix = mix / (np.abs(mix).max() + 1e-9) * 0.89
w = wave.open('narration.wav', 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
w.writeframes((mix * 32767).astype('<i2').tobytes()); w.close()
json.dump({'DUR': DUR, 'L': L}, open('tl.json', 'w'))
open('timeline.js', 'w').write('const TL=' + json.dumps({'DUR': DUR, 'L': L}) + ';')
print('DUR', DUR, L)
