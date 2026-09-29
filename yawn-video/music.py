import numpy as np, wave
SR=44100; D=60; N=SR*D; t=np.arange(N)/SR
out=np.zeros((N,2))
def m2f(m): return 440*2**((m-69)/12)
bpm=84; beat=60/bpm; bar=beat*4
chords=[[53,57,60,64],[52,55,59,62],[50,53,57,60],[48,52,55,59]]  # Fmaj7 Em7 Dm7 Cmaj7
roots=[41,40,38,36]
def env(n,a,r):
    e=np.ones(n); ai=int(a*SR); ri=int(r*SR)
    e[:ai]=np.linspace(0,1,ai); e[-ri:]*=np.linspace(1,0,ri); return e
def add(start,sig,pan=0.0,g=1.0):
    i=int(start*SR); j=min(N,i+len(sig))
    if j<=i: return
    s=sig[:j-i]*g
    out[i:j,0]+=s*(1-pan)/1.0; out[i:j,1]+=s*(1+pan)/1.0
# pads: each chord = 2 bars
cl=2*bar; nch=int(D/cl)+1
for k in range(nch):
    st=k*cl; ch=chords[k%4]; n=int(cl*SR*1.15); tt=np.arange(n)/SR
    sig=np.zeros(n)
    for m in ch:
        f=m2f(m)
        for det in (-0.12,0.12):
            ff=f*2**(det/12)
            sig+=np.sin(2*np.pi*ff*tt)+0.3*np.sin(4*np.pi*ff*tt)+0.12*np.sin(6*np.pi*ff*tt)
    sig*=env(n,1.2,1.6)*(1+0.1*np.sin(2*np.pi*0.3*tt))
    add(st,sig,0,0.018)
    # bass
    nb=int(cl*SR); tb=np.arange(nb)/SR; fb=m2f(roots[k%4])
    add(st,np.sin(2*np.pi*fb*tb)*env(nb,0.05,0.8),0,0.12)
    # arp 8ths
    notes=ch+[ch[1]+12,ch[2]+12,ch[3]+12,ch[2]+12]
    for q in range(16):
        ts=st+q*beat/2; m=notes[q%len(notes)]+12; na=int(0.6*SR); ta=np.arange(na)/SR; f=m2f(m)
        s=(np.sin(2*np.pi*f*ta)+0.2*np.sin(4*np.pi*f*ta))*np.exp(-ta*7)
        add(ts,s,0.4*np.sin(q),0.035)
# soft kick + hat after intro
nb=int(D/beat)
for b in range(nb):
    ts=b*beat
    if ts<4.5 or ts>D-4: continue
    if b%2==0:
        n=int(0.35*SR); tk=np.arange(n)/SR; f=50+90*np.exp(-tk*30)
        add(ts,np.sin(2*np.pi*np.cumsum(f)/SR)*np.exp(-tk*9),0,0.22)
    n=int(0.05*SR); h=np.random.randn(n); h=np.diff(np.concatenate([[0],h]))*np.exp(-np.arange(n)/SR*80)
    add(ts+beat/2,h,0.2,0.02)
# whooshes at transitions
for ts in [5,14.5,23.1,29.5,37.8,45.6,53.5]:
    n=int(1.2*SR); tw=np.arange(n)/SR; w=np.random.randn(n)
    # simple one-pole lowpass with sweeping cutoff
    y=np.zeros(n); a=np.clip(0.02+0.25*np.sin(np.pi*tw/1.2),0,1); acc=0
    for i in range(n): acc+=a[i]*(w[i]-acc); y[i]=acc
    add(ts-0.6,y*np.sin(np.pi*tw/1.2)**2,0,0.25)
# master fade
fade=np.ones(N); fade[:SR*2]=np.linspace(0,1,SR*2); fade[-SR*4:]=np.linspace(1,0,SR*4)
out*=fade[:,None]; out/=np.max(np.abs(out))*1.12
w=wave.open('music.wav','wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
w.writeframes((out*32767).astype('<i2').tobytes()); w.close(); print('ok')
