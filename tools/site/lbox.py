#!/usr/bin/env python3
"""Один лайтбокс фото на весь сайт: /assets/lightbox.v1.js (викликає chrome.apply() після sharp.py; ідемпотентно).

Правило (CLAUDE.md, «Фото: що відкривається»): фото-посилання на велику копію — <a href="/img/…-<w>.webp"> з <img> усередині —
відкриває спільний лайтбокс; обкладинки, стрічки, плитки й «Наші проєкти» — посилання на сторінки; hero й фон — не клікабельні.

Що робить apply():
  • кожному фото-посиланню ставить data-lb="<ширини>" — усі ширини тієї ж бази й пропорції на диску (sharp.family), JS будує srcset
    (`<база>-<w>.webp <w>w`) і бере ≥ кадр × DPR; порожнє data-lb — лише href;
  • прибирає старі інлайн-лайтбокси (#lb/#lbi, function lb(), fullcase lbL()) та onclick="return lb(…)";
  • підключає <script src="/assets/lightbox.v1.js" defer> (лише на сторінках з фото-посиланнями).
"""
import re

import sharp

JS = '/assets/lightbox.v1.js'
TAG = f'<script src="{JS}" defer></script>'
TAG_RX = re.compile(r'\n?<script src="' + re.escape(JS) + r'(?:\?v=\w+)?" defer></script>')
LINK = re.compile(r'<a href="(/img/[^"]+?\.webp)"((?:\s+[\w-]+(?:="[^"]*")?)*)\s*>(?=\s*(?:<picture>)?\s*<img\b)')
OLD_BOX = re.compile(r'\n?<div class="lb" id="lb"[^>]*>.*?</div>(?=\n|<)', re.S)
OLD_JS = re.compile(r'\n?<script>(?:function lb\(u\)|function lbL\(\)).*?</script>', re.S)
OLD_ON = re.compile(r'\s+onclick="return lb\(this(?:\.href)?\)"')
WIDTH = re.compile(r'-(\d+)\.webp$')


def widths(href):
    if not WIDTH.search(href):
        return ''
    fam = sharp.family(href)
    ws = [w for w, p in fam if WIDTH.search(p) and p.startswith(WIDTH.sub('', href) + '-')]
    return ','.join(str(w) for w in ws if w >= 600) if len(ws) > 1 else ''


def _link(m):
    href, rest = m.group(1), m.group(2)
    rest = re.sub(r'\s+data-lb="[^"]*"', '', rest)
    rest = OLD_ON.sub('', rest)
    return f'<a href="{href}"{rest} data-lb="{widths(href)}">'


def apply(s, rel=''):
    s = OLD_ON.sub('', s)
    s = OLD_BOX.sub('', s)
    s = OLD_JS.sub('', s)
    has = bool(LINK.search(s))
    s = LINK.sub(_link, s)
    m = TAG_RX.search(s)
    if not has:
        return TAG_RX.sub('', s)
    if m:  # на місці (ідемпотентно; ?v= ставить chrome.versions())
        return s[:m.start()] + '\n' + TAG + TAG_RX.sub('', s[m.end():])
    i = s.rfind('</body>')
    return s[:i] + TAG + '\n' + s[i:] if i >= 0 else s
