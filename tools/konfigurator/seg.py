#!/usr/bin/env python3
"""Сегментація зон для /konfigurator (Segment Anything, CPU) і збільшення фото ×2 (EDSR).

Разовий крок: результати вже лежать у tools/konfigurator/masks/ і up/, тож для правок кольорів/матеріалів
його запускати не треба — лише bake.py. Перезапуск потрібен, якщо змінили кадр або підказки в prompts.json.

  python3 -m venv /tmp/samvenv && /tmp/samvenv/bin/pip install torch --index-url https://download.pytorch.org/whl/cpu
  /tmp/samvenv/bin/pip install segment-anything opencv-contrib-python-headless pillow numpy
  curl -LO https://dl.fbaipublicfiles.com/segment_anything/sam_vit_b_01ec64.pth          # ваги SAM (375 МБ)
  curl -LO https://raw.githubusercontent.com/Saafke/EDSR_Tensorflow/master/models/EDSR_x2.pb   # для --upscale
  /tmp/samvenv/bin/python tools/konfigurator/seg.py living [zone ...] --ckpt sam_vit_b_01ec64.pth
  /tmp/samvenv/bin/python tools/konfigurator/seg.py --upscale living kitchen bedroom --edsr EDSR_x2.pb

prompts.json: {кімната: {зона: [{box:[x0,y0,x1,y1], pos:[[x,y]...], neg:[[x,y]...], sub?:true}, ...]}} у пікселях 900-px кадру.
Кілька частин зони обʼєднуються (max), "sub": true — віднімається.
"""
import json, os, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
SRC = {'living': '18V9n96tOhjKjh', 'kitchen': '1L6z-fyorw1bnO', 'bedroom': '1Ijh6SNyDO4SON'}


def arg(name, default=None):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


def photo(room):
    return np.array(Image.open(os.path.join(ROOT, 'img', 'p', SRC[room] + '-900.webp')).convert('RGB'))


def upscale(rooms):
    import cv2
    sr = cv2.dnn_superres.DnnSuperResImpl_create()
    sr.readModel(arg('--edsr', 'EDSR_x2.pb')); sr.setModel('edsr', 2)
    os.makedirs(os.path.join(HERE, 'up'), exist_ok=True)
    for r in rooms:
        out = sr.upsample(cv2.cvtColor(photo(r), cv2.COLOR_RGB2BGR))
        cv2.imwrite(os.path.join(HERE, 'up', f'{r}_x2.png'), out)
        print(r, out.shape)


def segment(room, only):
    import torch
    from segment_anything import sam_model_registry, SamPredictor
    torch.set_num_threads(os.cpu_count() or 4)
    P = json.load(open(os.path.join(HERE, 'prompts.json')))[room]
    img = photo(room)
    pred = SamPredictor(sam_model_registry['vit_b'](checkpoint=arg('--ckpt', 'sam_vit_b_01ec64.pth')))
    pred.set_image(img)
    for zone, parts in P.items():
        if only and zone not in only:
            continue
        acc = np.zeros(img.shape[:2], np.float32)
        for part in parts:
            pts = [p for p in part.get('pos', [])] + [p for p in part.get('neg', [])]
            lab = [1] * len(part.get('pos', [])) + [0] * len(part.get('neg', []))
            kw = {}
            if pts:
                kw['point_coords'] = np.array(pts, np.float32); kw['point_labels'] = np.array(lab)
            if 'box' in part:
                kw['box'] = np.array(part['box'], np.float32)
            masks, scores, _ = pred.predict(multimask_output=True, return_logits=True, **kw)
            k = part.get('pick', int(np.argmax(scores)))
            m = 1 / (1 + np.exp(-masks[k]))
            acc = np.minimum(acc, 1 - m) if part.get('sub') else np.maximum(acc, m)
            print(room, zone, 'scores', np.round(scores, 3), 'pick', k)
        Image.fromarray((acc * 255).astype(np.uint8)).save(os.path.join(HERE, 'masks', f'm_{room}_{zone}.png'))


if __name__ == '__main__':
    pos = [a for i, a in enumerate(sys.argv[1:], 1) if not a.startswith('--') and sys.argv[i - 1] not in ('--ckpt', '--edsr')]
    if '--upscale' in sys.argv:
        upscale(pos or list(SRC))
    else:
        segment(pos[0], pos[1:])
