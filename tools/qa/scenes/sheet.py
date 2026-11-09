#!/usr/bin/env python3
"""Контактний аркуш етапів сцени: python3 tools/qa/scenes/sheet.py <shots-dir> <tag> <out-dir>
Бере <shots-dir>/<сцена>/<ширина>/<tag>-NN.png, пише <out-dir>/<сцена>-<ширина>-<tag>.jpg (плитки з номером етапу, q72)."""
import os, sys
from PIL import Image, ImageDraw
src, tag, out = sys.argv[1:4]
os.makedirs(out, exist_ok=True)
for scene in sorted(os.listdir(src)):
    for w in sorted(os.listdir(os.path.join(src, scene))):
        d = os.path.join(src, scene, w)
        fs = sorted(f for f in os.listdir(d) if f.startswith(tag + '-') and f.endswith('.png'))
        if not fs: continue
        tw = 300 if w == '1440' else 200
        ims = []
        for f in fs:
            im = Image.open(os.path.join(d, f)).convert('RGB'); im = im.resize((tw, round(im.height * tw / im.width)))
            ims.append((f[len(tag) + 1:-4], im))
        th = max(i.height for _, i in ims) + 18; cols = 6 if w == '1440' else 8
        rows = -(-len(ims) // cols); S = Image.new('RGB', (cols * tw, rows * th), 'white'); dr = ImageDraw.Draw(S)
        for k, (n, im) in enumerate(ims):
            x, y = (k % cols) * tw, (k // cols) * th; S.paste(im, (x, y)); dr.text((x + 4, y + im.height + 3), n, fill='black')
        S.save(os.path.join(out, f'{scene}-{w}-{tag}.jpg'), quality=72, optimize=True)
        print(scene, w, len(ims))
