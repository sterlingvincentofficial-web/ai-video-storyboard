import numpy as np, wave, sys
from scipy import signal
from PIL import Image, ImageDraw
fn = sys.argv[1]
w = wave.open(fn); sr = w.getframerate(); n = w.getnframes()
x = np.frombuffer(w.readframes(n), dtype=np.int16).reshape(-1, 2).astype(float) / 32768
m = x.mean(axis=1)
BAR = 1.6
print('peak', np.abs(x).max().round(3), 'rms', np.sqrt((m**2).mean()).round(3), 'L/R corr', np.corrcoef(x[:,0], x[:,1])[0,1].round(2))
for b in range(20):
    seg = m[int(b*BAR*sr):int((b+1)*BAR*sr)]
    if not len(seg): break
    f, P = signal.welch(seg, sr, nperseg=4096)
    band = lambda lo, hi: 10*np.log10(P[(f>=lo)&(f<hi)].sum()+1e-12)
    print(f'bar {b:2d} rms {20*np.log10(np.sqrt((seg**2).mean())+1e-9):6.1f} dB | sub<60 {band(20,60):6.1f} low60-250 {band(60,250):6.1f} mid250-2k {band(250,2000):6.1f} hi2k-6k {band(2000,6000):6.1f} air6k+ {band(6000,20000):6.1f}')
# spectrogram image
f, t, S = signal.spectrogram(m, sr, nperseg=2048, noverlap=1536)
S = 10*np.log10(S+1e-12)
keep = f < 12000
S = S[keep][::-1]
S = np.clip((S - S.max() + 80) / 80, 0, 1)
img = Image.fromarray((S*255).astype(np.uint8)).resize((1600, 500))
d = ImageDraw.Draw(img)
for b in range(20):
    xpx = int(b*BAR / (len(m)/sr) * 1600)
    d.line([(xpx,0),(xpx,500)], fill=128)
img.save(sys.argv[2])
