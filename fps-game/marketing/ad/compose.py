"""TOONFIRE hype ad compositor: beat-synced cuts, title slams, flashes, shakes -> ffmpeg."""
import json, math, os, subprocess, sys
from functools import lru_cache
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageEnhance

HERE = os.path.dirname(os.path.abspath(__file__))
FR = os.path.join(HERE, 'frames')
W, H, FPS = 1920, 1080, 30
BEAT = 0.4
BAR = 1.6
TOTAL = 31.6


def _ffmpeg():
    if os.environ.get('FFMPEG'):
        return os.environ['FFMPEG']
    import shutil
    if shutil.which('ffmpeg'):
        return shutil.which('ffmpeg')
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        return 'ffmpeg'


FF = _ffmpeg()
FONT = {
    'lucky': os.path.join(HERE, 'fonts/LuckiestGuy.ttf'),
    'bang': os.path.join(HERE, 'fonts/Bangers.ttf'),
    'fred': os.path.join(HERE, 'fonts/Fredoka700.ttf'),
}
INK = (20, 16, 42)
rng = np.random.default_rng(3)


def nframes(shot):
    d = os.path.join(FR, shot)
    if not os.path.isdir(d):
        return 1
    return max(1, len([f for f in os.listdir(d) if f.endswith('.jpg')]))


def events(shot):
    p = os.path.join(FR, shot, 'events.json')
    return json.load(open(p)) if os.path.exists(p) else []


@lru_cache(maxsize=64)
def load(shot, i):
    n = nframes(shot)
    i = max(0, min(n - 1, i))
    fp = os.path.join(FR, shot, f'{i:04d}.jpg')
    if not os.path.exists(fp):
        return Image.new('RGB', (W, H), (60, 60, 70))
    im = Image.open(fp).convert('RGB')
    if im.size != (W, H):
        im = im.resize((W, H), Image.LANCZOS)
    return im


def best_start(shot, length, prefer=None, default=0):
    """Frame to start a window of `length` frames so a player kill lands ~55% in."""
    n = nframes(shot)
    ev = [e for e in events(shot) if e['type'] == 'kill' and (e.get('byPlayer') or e.get('bySpec'))]
    if not ev:
        ev = [e for e in events(shot) if e['type'] in ('kill', 'boom')]
    if prefer is not None:
        return max(0, min(n - length, prefer))
    if ev:
        f = ev[0]['f']
        return max(0, min(n - length, int(f - length * 0.55)))
    return max(0, min(n - length, default))


# ---------------------------------------------------------------- text rendering
@lru_cache(maxsize=128)
def text_img(text, font='lucky', size=150, fill=(255, 210, 63), stroke=12, shadow=10, glow=None, box=None, pad=(34, 14), tracking=0):
    f = ImageFont.truetype(FONT[font], size)
    tmp = Image.new('RGBA', (10, 10))
    d = ImageDraw.Draw(tmp)
    x0, y0, x1, y1 = d.textbbox((0, 0), text, font=f, stroke_width=stroke)
    tw, th = x1 - x0, y1 - y0
    m = stroke + shadow + (40 if glow else 0) + 10
    bw, bh = tw + 2 * m + (2 * pad[0] if box else 0), th + 2 * m + (2 * pad[1] if box else 0)
    im = Image.new('RGBA', (bw, bh), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    ox, oy = m - x0 + (pad[0] if box else 0), m - y0 + (pad[1] if box else 0)
    if box:
        bx0, by0, bx1, by1 = m - 6, m - 6, bw - m + 6, bh - m + 6
        d.rounded_rectangle((bx0 + shadow * 0.6, by0 + shadow * 0.6, bx1 + shadow * 0.6, by1 + shadow * 0.6), radius=22, fill=INK + (255,))
        d.rounded_rectangle((bx0, by0, bx1, by1), radius=22, fill=box + (255,), outline=INK + (255,), width=7)
    if glow:
        g = Image.new('RGBA', im.size, (0, 0, 0, 0))
        ImageDraw.Draw(g).text((ox, oy), text, font=f, fill=glow + (255,), stroke_width=stroke + 8, stroke_fill=glow + (255,))
        g = g.filter(ImageFilter.GaussianBlur(18))
        im = Image.alpha_composite(im, g)
        im = Image.alpha_composite(im, g)
        d = ImageDraw.Draw(im)
    if shadow and not box:
        d.text((ox + shadow * 0.5, oy + shadow), text, font=f, fill=INK + (255,), stroke_width=stroke, stroke_fill=INK + (255,))
    d.text((ox, oy), text, font=f, fill=fill + (255,), stroke_width=stroke, stroke_fill=INK + (255,))
    return im


@lru_cache(maxsize=4)
def logo(scale=1.0):
    a = text_img('TOON', 'lucky', int(250 * scale), (255, 210, 63), int(16 * scale), int(14 * scale))
    b = text_img('FIRE', 'lucky', int(250 * scale), (255, 90, 54), int(16 * scale), int(14 * scale))
    ov = int(98 * scale)
    im = Image.new('RGBA', (a.width + b.width - ov, max(a.height, b.height)), (0, 0, 0, 0))
    im.alpha_composite(a, (0, 0))
    im.alpha_composite(b, (a.width - ov, 0))
    return im


def ease_out_back(x, s=1.9):
    x = min(max(x, 0), 1) - 1
    return 1 + (s + 1) * x ** 3 + s * x ** 2


def place(canvas, img, cx, cy, scale=1.0, rot=0.0, alpha=1.0):
    if alpha <= 0.01 or scale <= 0.01:
        return
    im = img
    if abs(scale - 1) > 1e-3:
        im = im.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale))), Image.BILINEAR)
    if abs(rot) > 0.05:
        im = im.rotate(rot, resample=Image.BICUBIC, expand=True)
    if alpha < 0.999:
        a = im.getchannel('A').point(lambda v: int(v * alpha))
        im = im.copy(); im.putalpha(a)
    canvas.alpha_composite(im, (int(cx - im.width / 2), int(cy - im.height / 2)))


# ---------------------------------------------------------------- edit decision list
CUTS = []     # (t0, t1, shot, start_frame, speed, extra)
TEXT = []     # (t0, t1, img_fn, cx, cy, anim, rot)
FLASH = []    # (t, strength)
PUNCH = []    # (t, amount)
SHAKE = []    # (t, amount)


def cut(t0, t1, shot, start=None, speed=1.0, prefer=None, **extra):
    L = int((t1 - t0) * FPS * speed) + 1
    s = start if start is not None else best_start(shot, L, prefer)
    CUTS.append((t0, t1, shot, s, speed, extra))


def text(t0, t1, fn, cx, cy, anim='slam', rot=-3):
    TEXT.append((t0, t1, fn, cx, cy, anim, rot))


# INTRO (bar 0-1): teaser cuts on the riff accents, then an accelerating build
cut(0.0, 0.8, 'plaza_chase', prefer=10)
cut(0.8, 1.4, 'paper_chase', start=0, speed=0.7, smooth=True)
cut(1.4, 1.6, 'comic_chase', prefer=30)
text(0.02, 0.78, lambda: text_img('5 WORLDS', size=190), W / 2, H / 2, 'slam')
text(0.82, 1.58, lambda: text_img('5 ART STYLES', size=170, fill=(255, 255, 255)), W / 2, H / 2, 'slam', rot=3)
for k, (sh, pf) in enumerate([('toy_chase', 24), ('neon_duel', 30), ('comic_duel', 20), ('boomer', 25)]):
    cut(1.6 + k * 0.4, 2.0 + k * 0.4, sh, prefer=pf)
text(1.62, 2.38, lambda: text_img('4 V 4', size=260), W / 2, H / 2, 'slam')
for k, (sh, pf) in enumerate([('toy_duel', 40), ('paper_fps', 12), ('plaza_duel', 48), ('neon_est', 5)]):
    cut(2.4 + k * 0.2, 2.6 + k * 0.2, sh, prefer=pf)
text(2.42, 2.78, lambda: text_img('TOTAL', size=210, fill=(255, 255, 255)), W / 2, H / 2 - 20, 'slam', rot=2)
text(2.8, 3.18, lambda: text_img('CHAOS!', size=250, fill=(255, 90, 54)), W / 2, H / 2 - 20, 'slam', rot=-4)
for t in (0.0, 0.8, 1.4, 1.6, 2.0, 2.4, 2.8):
    FLASH.append((t, 0.35)); PUNCH.append((t, 0.05))

# DROP (bar 2): logo over the neon flyover
cut(3.2, 4.8, 'neon_est', start=8)
text(3.2, 4.72, lambda: logo(), W / 2, H / 2 - 40, 'logo', rot=-4)
text(3.6, 4.72, lambda: text_img('4v4 CARTOON BLASTER BATTLES', 'fred', 64, (255, 255, 255), 0, 8, box=(45, 125, 255)), W / 2, H / 2 + 190, 'pop', rot=-2)
FLASH.append((3.2, 1.0)); SHAKE.append((3.2, 1.0)); PUNCH.append((3.2, 0.12))

# WORLDS (bars 3-12)
CHASE = {'plaza': (16, 1.0), 'paper': (0, 0.6), 'comic': (16, 1.0), 'toy': (21, 1.0)}
ACTION = {'plaza': ('plaza_duel', None), 'paper': ('paper_fps', 0), 'comic': ('comic_duel', 16), 'toy': ('toy_duel', None), 'neon': ('neon_duel', 8)}
WORLDS = [
    ('plaza', 'SPLAT PLAZA', 'lucky', (255, 210, 63), None, 'SATURDAY-MORNING CEL SHADING', (255, 122, 184)),
    ('paper', 'PAPER FORT', 'lucky', (246, 226, 186), None, 'CARDBOARD & CONSTRUCTION PAPER', (122, 176, 90)),
    ('comic', 'INK CITY', 'bang', (255, 214, 0), None, 'COMIC BOOK HALFTONE MAYHEM', (230, 40, 40)),
    ('toy', 'TOY BOX', 'lucky', (255, 150, 200), None, 'GLOSSY VINYL TOY WAR', (72, 170, 255)),
    ('neon', 'NEON ROOFTOPS', 'lucky', (80, 240, 255), (255, 40, 200), 'SYNTHWAVE NIGHTS - MIND THE GAP', (150, 60, 255)),
]
for i, (w, name, font, col, glow, tag, tagcol) in enumerate(WORLDS):
    t0 = 4.8 + i * 3.2
    est_start = 40 if w == 'neon' else 0
    cut(t0, t0 + 1.6, f'{w}_est', start=est_start)
    size = 190 if font == 'lucky' else 230
    text(t0 + 0.02, t0 + 1.55, (lambda name=name, font=font, col=col, glow=glow, size=size: text_img(name, font, size, col, 14, 12, glow)), W / 2, H * 0.40, 'slam', rot=-3)
    text(t0 + 0.4, t0 + 1.55, (lambda tag=tag, tagcol=tagcol: text_img(tag, 'fred', 54, (255, 255, 255), 0, 8, box=tagcol)), W / 2, H * 0.40 + 160, 'pop', rot=-2)
    # action: first-person, then a chase cam where we have one
    act, act_start = ACTION[w]
    has_chase = w in ('plaza', 'paper', 'comic', 'toy')
    if has_chase:
        cut(t0 + 1.6, t0 + 2.4, act, start=act_start)
        cs, csp = CHASE[w]
        cut(t0 + 2.4, t0 + 3.2, f'{w}_chase', start=cs, speed=csp, smooth=csp < 1)
    else:
        cut(t0 + 1.6, t0 + 3.2, act, start=act_start)
    FLASH.append((t0, 0.7)); PUNCH.append((t0, 0.08)); SHAKE.append((t0, 0.35))
    for b in range(1, 8):
        PUNCH.append((t0 + b * BEAT, 0.025 if b % 2 else 0.04))

# FEATURES (bars 13-16): half-bar cuts with captions
FEAT = [
    ('ctf', 'CAPTURE THE FLAG', (255, 90, 54), {'start': 2}),
    ('boomer', 'ROCKET MAYHEM', (255, 150, 30), {}),
    ('bonk', 'BONK \'EM!', (255, 210, 63), {'start': 2}),
    ('duck', 'GRAB THE DUCK', (255, 214, 0), {'start': 14}),
    ('bighead', 'BIG HEAD MODE', (120, 200, 90), {}),
    ('pad', 'JUMP PADS', (80, 240, 255), {'start': 4}),
    ('touch', 'PLAY ON YOUR PHONE', (255, 122, 184), {'start': 6, 'phone': True}),
    ('tour', 'WORLD TOUR', (255, 198, 41), {'start': 0, 'kenburns': True}),
]
for k, (shot, cap, col, ex) in enumerate(FEAT):
    t0 = 20.8 + k * 0.8
    start = ex.get('start')
    cut(t0, t0 + 0.8, shot, start=start, **{kk: v for kk, v in ex.items() if kk != 'start'})
    text(t0 + 0.02, t0 + 0.78, (lambda cap=cap, col=col: text_img(cap, 'lucky', 130, col, 12, 10)), W / 2, H * 0.80, 'slam', rot=-3 if k % 2 else 3)
    FLASH.append((t0, 0.45)); PUNCH.append((t0, 0.07))
# stop hits
for t in (26.4, 26.6, 26.8):
    FLASH.append((t, 0.8)); SHAKE.append((t, 0.6)); PUNCH.append((t, 0.1))

# END CARD (bar 17+): victory dance in slow motion + logo
cut(27.2, TOTAL, 'lineup', start=0, speed=0.55, endcard=True)
text(27.2, TOTAL, lambda: logo(), W / 2, H * 0.30, 'logo', rot=-4)
text(27.9, TOTAL, lambda: text_img('5 WORLDS  -  5 MODES  -  WORLD TOUR', 'fred', 58, (255, 255, 255), 0, 8, box=(45, 125, 255)), W / 2, H * 0.53, 'pop', rot=-1)
text(28.6, TOTAL, lambda: text_img('PLAY FREE IN YOUR BROWSER', 'lucky', 104, (20, 16, 42), 0, 10, box=(255, 210, 63), pad=(46, 22)), W / 2, H * 0.72, 'slam', rot=-2)
text(29.3, TOTAL, lambda: text_img('DESKTOP  -  MOBILE  -  GAMEPAD', 'fred', 46, (255, 255, 255), 6, 6), W / 2, H * 0.87, 'pop', rot=0)
FLASH.append((27.2, 1.0)); SHAKE.append((27.2, 1.0)); PUNCH.append((27.2, 0.14))


# ---------------------------------------------------------------- per-frame render
def grade(im, sat=1.18, con=1.08):
    im = ImageEnhance.Color(im).enhance(sat)
    return ImageEnhance.Contrast(im).enhance(con)


_vig = None


def vignette():
    global _vig
    if _vig is None:
        y, x = np.mgrid[0:H, 0:W]
        r = np.sqrt(((x - W / 2) / (W / 2)) ** 2 + ((y - H / 2) / (H / 2)) ** 2)
        _vig = np.clip(1 - 0.35 * np.clip(r - 0.55, 0, None) ** 1.5, 0.55, 1)[..., None].astype(np.float32)
    return _vig


def phone(img, t_local):
    """Place a phone screenshot inside a drawn phone over a blurred backdrop."""
    bg = load('plaza_est', 30).filter(ImageFilter.GaussianBlur(22))
    bg = ImageEnhance.Brightness(bg).enhance(0.55).convert('RGBA')
    scr = img.resize((1380, int(1380 * 780 / 1688)), Image.LANCZOS).convert('RGBA')
    bez = 34
    ph = Image.new('RGBA', (scr.width + 2 * bez, scr.height + 2 * bez), (0, 0, 0, 0))
    d = ImageDraw.Draw(ph)
    d.rounded_rectangle((0, 0, ph.width - 1, ph.height - 1), radius=90, fill=(18, 18, 26, 255), outline=(70, 70, 90, 255), width=6)
    mask = Image.new('L', scr.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, scr.width - 1, scr.height - 1), radius=58, fill=255)
    ph.paste(scr, (bez, bez), mask)
    d.ellipse((12, ph.height / 2 - 10, 32, ph.height / 2 + 10), fill=(40, 40, 52, 255))
    sc = 1.0 + 0.04 * t_local
    place(bg, ph, W / 2, H / 2 - 40, sc, -5 + 3 * t_local)
    return bg.convert('RGB')


def frame_at(t):
    c = next((c for c in CUTS if c[0] <= t < c[1]), CUTS[-1])
    t0, t1, shot, s, speed, extra = c
    lt = t - t0
    fpos = s + lt * FPS * speed
    fi = int(fpos)
    base = load(shot, fi)
    if extra.get('endcard') or extra.get('smooth'):
        # blend neighbouring frames for smooth slow motion
        a = fpos - fi
        base = Image.blend(base, load(shot, fi + 1), a)
    if extra.get('endcard'):
        base = base.filter(ImageFilter.GaussianBlur(2.5))
        base = ImageEnhance.Brightness(base).enhance(0.62)
    if extra.get('phone'):
        base = phone(base, lt)
    if extra.get('kenburns'):
        z = 1.0 + 0.10 * lt / (t1 - t0)
        cw, ch = W / z, H / z
        base = base.crop((int((W - cw) / 2), int((H - ch) / 2 - 20), int((W + cw) / 2), int((H + ch) / 2 - 20))).resize((W, H), Image.BILINEAR)
    base = grade(base)
    # zoom punch
    z = 1.0
    for tp, amt in PUNCH:
        if 0 <= t - tp < 0.25:
            z += amt * math.exp(-(t - tp) / 0.07)
    dx = dy = 0.0
    for ts, amt in SHAKE:
        if 0 <= t - ts < 0.5:
            k = amt * math.exp(-(t - ts) / 0.12) * 26
            dx += rng.uniform(-k, k); dy += rng.uniform(-k, k)
    if z > 1.001 or dx or dy:
        z = max(z, 1 + (abs(dx) + abs(dy)) / W * 2.2)
        cw, ch = W / z, H / z
        x0 = (W - cw) / 2 + dx; y0 = (H - ch) / 2 + dy
        base = base.crop((int(x0), int(y0), int(x0 + cw), int(y0 + ch))).resize((W, H), Image.BILINEAR)
    arr = np.asarray(base).astype(np.float32)
    # chromatic split on the biggest hits
    for ts, amt in SHAKE:
        if amt >= 0.9 and 0 <= t - ts < 0.18:
            sft = int(14 * (1 - (t - ts) / 0.18))
            arr[..., 0] = np.roll(arr[..., 0], sft, axis=1)
            arr[..., 2] = np.roll(arr[..., 2], -sft, axis=1)
    arr *= vignette()
    fl = 0.0
    for tf, amt in FLASH:
        if 0 <= t - tf < 0.2:
            fl = max(fl, amt * math.exp(-(t - tf) / 0.05))
    if fl > 0.01:
        arr = arr * (1 - fl) + 255 * fl
    canvas = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).convert('RGBA')
    # text overlays
    for (a, b, fn, cx, cy, anim, rot) in TEXT:
        if not (a <= t < b):
            continue
        img = fn()
        u = t - a
        left = b - t
        if anim in ('slam', 'logo'):
            dur = 0.14 if anim == 'slam' else 0.2
            sc = 2.6 - 1.6 * ease_out_back(u / dur, 2.2)
            if anim == 'logo':
                sc *= 1 + 0.015 * math.sin(t * 9)          # pulse
            alpha = min(1, u / 0.05)
            r = rot + (1 - min(1, u / dur)) * -10
            if left < 0.08 and b < TOTAL - 0.1:
                sc *= 1 + (0.08 - left) * 4
                alpha *= left / 0.08
            place(canvas, img, cx, cy, sc, r, alpha)
        elif anim == 'pop':
            sc = ease_out_back(u / 0.18, 2.6)
            alpha = min(1, u / 0.06)
            if left < 0.08 and b < TOTAL - 0.1:
                alpha *= left / 0.08
            place(canvas, img, cx, cy, max(0.02, sc), rot, alpha)
    out = canvas.convert('RGB')
    # fade to black at the very end
    if t > TOTAL - 0.5:
        out = ImageEnhance.Brightness(out).enhance(max(0, (TOTAL - t) / 0.5))
    return out


VW, VH = 1080, 1920


def vertical_at(t):
    """9:16 version: the 16:9 edit in the middle over a blurred fill, with logo + CTA bands."""
    f = frame_at(t)
    bg = f.resize((int(VH * W / H), VH), Image.BILINEAR)
    x0 = (bg.width - VW) // 2
    bg = bg.crop((x0, 0, x0 + VW, VH)).filter(ImageFilter.GaussianBlur(28))
    bg = ImageEnhance.Brightness(bg).enhance(0.45).convert('RGBA')
    fg_h = int(VW * 1.18 * H / W)
    fg = f.resize((int(VW * 1.18), fg_h), Image.LANCZOS)
    cx = (fg.width - VW) // 2
    fg = fg.crop((cx, 0, cx + VW, fg_h))
    top = (VH - fg_h) // 2
    bg.alpha_composite(fg.convert('RGBA'), (0, top))
    d = ImageDraw.Draw(bg)
    d.rectangle((0, top - 8, VW, top), fill=INK + (255,))
    d.rectangle((0, top + fg_h, VW, top + fg_h + 8), fill=INK + (255,))
    if t >= 3.2 and t < 27.2:
        u = t - 3.2
        place(bg, logo(), VW / 2, top / 2 + 10, 0.62 * (1 + 0.6 * math.exp(-u / 0.12)), -4, min(1, u / 0.1))
    if t >= 4.8 and t < 27.2:
        u = t - 4.8
        place(bg, text_img('4v4 CARTOON FPS', 'lucky', 92, (255, 255, 255), 10, 8), VW / 2, top + fg_h + 120, 1.0, -2, min(1, u / 0.15))
        place(bg, text_img('FREE IN YOUR BROWSER', 'fred', 56, (20, 16, 42), 0, 8, box=(255, 210, 63)), VW / 2, top + fg_h + 250, 1.0, -1, min(1, max(0, u - 0.3) / 0.15))
    return bg.convert('RGB')


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'toonfire_ad.mp4')
    only = sys.argv[2] if len(sys.argv) > 2 else None
    if only == 'stills':
        for t in [float(x) for x in sys.argv[3].split(',')]:
            frame_at(t).save(os.path.join(HERE, f'still_{t:05.2f}.jpg'), quality=88)
        return
    vert = only == 'vertical'
    render = vertical_at if vert else frame_at
    size = f'{VW}x{VH}' if vert else f'{W}x{H}'
    if only == 'vstills':
        for t in [float(x) for x in sys.argv[3].split(',')]:
            vertical_at(t).save(os.path.join(HERE, f'vstill_{t:05.2f}.jpg'), quality=88)
        return
    nf = int(TOTAL * FPS)
    cmd = [FF, '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', size, '-r', str(FPS), '-i', '-',
           '-i', os.path.join(HERE, 'music.wav'), '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-maxrate', '9M', '-bufsize', '18M', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
           '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', out]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for i in range(nf):
        p.stdin.write(render(i / FPS).tobytes())
        if i % 60 == 0:
            print(f'{i}/{nf}', file=sys.stderr)
    p.stdin.close()
    p.wait()
    print('wrote', out)


if __name__ == '__main__':
    main()
