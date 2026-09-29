# Contact sheet of stills, printed as base64 for review.
import glob, base64, io, sys
from PIL import Image
fs = sorted(glob.glob('still_*.png'), key=lambda f: float(f[6:-4]))
cols = 3; tw, th = 400, 225; rows = (len(fs) + cols - 1) // cols
sh = Image.new('RGB', (cols * tw, rows * th))
for i, f in enumerate(fs): sh.paste(Image.open(f).convert('RGB').resize((tw, th)), ((i % cols) * tw, (i // cols) * th))
b = io.BytesIO(); sh.save(b, 'JPEG', quality=50); open('sheet.b64','w').write(base64.b64encode(b.getvalue()).decode()); print('sheet bytes', len(b.getvalue()))
