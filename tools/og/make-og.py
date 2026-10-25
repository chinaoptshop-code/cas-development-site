#!/usr/bin/env python3
"""Генератор Open Graph картинок для cas-develop.com.

Для кожної сторінки /proekty/*.html і /blog/*.html робить img/og/<slug>.jpg
(1200×630, фото cover-crop, темний градієнт, назва Cormorant Garamond,
золота лінія і текстовий знак «CAS DEVELOPMENT»). HTML не змінює.

Запуск із кореня репозиторію:
    python tools/og/make-og.py            # усі сторінки
    python tools/og/make-og.py diamond    # лише вказані slug
Потрібен Pillow (pip install pillow).
"""
import html
import io
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "img" / "og"
FONT = Path(__file__).with_name("fonts") / "CormorantGaramond[wght].ttf"

W, H = 1200, 630
TEXT = (237, 232, 223)      # #EDE8DF
GOLD = (191, 145, 72)       # #BF9148
MAX_BYTES = 120 * 1024
SKIP = re.compile(r"osocor", re.I)

# Статті блогу не мають власних фото — беремо фото з послуги/проєкту за темою.
BLOG_PHOTOS = {
    "avtorskyi-nahliad-navishcho": "img/p/1DL1BY7Tg6L5B5-900.webp",            # Edelweiss
    "dyzain-malenkoi-kvartyry-zberihannia": "img/p/1YQyhjEui9fb6v-900.webp",   # /dyzain-interieru-kvartyry-kyiv
    "dyzain-restoranu-z-choho-pochaty": "img/p/1OGn3TXnLkQenE-900.webp",       # /dyzain-restoranu-kafe-kyiv
    "etapy-remontu-kvartyry-pid-kliuch": "img/p/1bXytwftMuIHBN-900.webp",      # /remont-kvartyr-kyiv
    "mebli-z-kytaiu-dlia-interieru": "img/p/1iGcqtsUqLNWbB-900.webp",          # Diamond
    "remont-ofisu-pid-kliuch-shcho-vrakhuvaty": "img/p/13a8ks6jQlZ5LY-900.webp",  # /remont-ofisu-pid-klyuch-kyiv
    "shcho-vkhodyt-u-dyzain-proekt-interieru": "img/p/1MslU7S5X8gIEp-900.webp",   # Linden Penthouse
    "skilky-koshtuie-dyzain-proekt-kvartyry-kyiv": "img/p/1_0wYN-6Q8LZFX-900.webp",  # Yacht VIP
    "skilky-koshtuie-remont-budynku-pid-kliuch": "img/p/1F4OovwNYQPfoF-900.webp",    # House 150 (фасад)
    "skilky-koshtuie-remont-v-novobudovi-kyiv": "img/p/1xqY1KZo2JY5xq-900.webp",     # Tetris Hall
    "suchasnyi-minimalizm-teplyi-interier": "img/p/1Grj8_m7MJwsbE-900.webp",         # Hodos Villa
    "yak-splanuvaty-bazu-vidpochynku": "img/p/1XdhtH1mjWRTli-900.webp",              # /baza-vidpochynku-pid-klyuch
    "yak-vybraty-dyzainera-interieru": "img/p/1jKOiN3xyCjZCL-900.webp",              # Monpark
}


def font(size, weight="SemiBold"):
    f = ImageFont.truetype(str(FONT), size)
    try:
        f.set_variation_by_name(weight)
    except Exception:
        pass
    return f


def page_title(src):
    m = re.search(r"<title>(.*?)</title>", src, re.S)
    t = html.unescape(m.group(1)).strip() if m else ""
    return re.sub(r"\s*\|\s*CAS Development\s*$", "", t)


def page_photo(src):
    m = re.search(r'property="og:image" content="https://cas-develop\.com/([^"]+)"', src) or \
        re.search(r'content="https://cas-develop\.com/([^"]+)" property="og:image"', src)
    if m and "og-cas" not in m.group(1) and (ROOT / m.group(1)).exists():
        return m.group(1)
    for m in re.finditer(r'src="/(img/[^"]+\.(?:webp|jpe?g|png))"', src):
        if (ROOT / m.group(1)).exists():
            return m.group(1)
    return None


def pages():
    items = []
    for kind in ("proekty", "blog"):
        for p in sorted((ROOT / kind).glob("*.html")):
            if SKIP.search(p.name):
                continue
            src = p.read_text(encoding="utf-8")
            slug = p.stem
            photo = BLOG_PHOTOS.get(slug) if kind == "blog" else page_photo(src)
            if photo and not (ROOT / photo).exists():
                photo = None
            items.append({"kind": kind, "slug": slug, "title": page_title(src), "photo": photo})
    return items


def cover(img):
    img = img.convert("RGB")
    s = max(W / img.width, H / img.height)
    img = img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)
    l, t = (img.width - W) // 2, (img.height - H) // 2
    return img.crop((l, t, l + W, t + H))


def overlay():
    """Темний градієнт: сильніше внизу ліворуч."""
    g = Image.new("L", (W, H))
    px = g.load()
    for y in range(H):
        fy = y / H
        for x in range(W):
            fx = 1 - x / W
            a = 60 + 150 * (fy ** 1.5) * (0.45 + 0.55 * fx) + 70 * fx * (fy ** 0.8)
            px[x, y] = min(235, int(a))
    black = Image.new("RGB", (W, H), (14, 12, 10))
    return black, g


def wrap(draw, text, fnt, maxw):
    words, lines, cur = [], [], ""
    for w in text.split():  # однолітерні слова («в», «у», «і») не лишаємо в кінці рядка
        if words and len(words[-1]) == 1 and words[-1].isalpha():
            words[-1] += "\u00a0" + w
        else:
            words.append(w)
    for w in words:
        test = (cur + " " + w).strip()
        if draw.textlength(test, font=fnt) <= maxw or not cur:
            cur = test
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def fit_title(draw, text, maxw, sizes=(76, 68, 60, 54, 48)):
    for s in sizes:
        f = font(s)
        lines = wrap(draw, text, f, maxw)
        if len(lines) <= 3:
            return f, lines, s
    f = font(sizes[-1])
    lines = wrap(draw, text, f, maxw)[:3]
    lines[-1] = lines[-1].rstrip(" ,.:;—") + "…"
    return f, lines, sizes[-1]


def spaced(draw, xy, text, fnt, fill, spacing):
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=fnt, fill=fill)
        x += draw.textlength(ch, font=fnt) + spacing
    return x


def render(item, black, mask):
    if item["photo"]:
        base = cover(Image.open(ROOT / item["photo"]))
    else:
        base = Image.new("RGB", (W, H), (59, 59, 59))
    img = Image.composite(black, base, mask)
    shadow = Image.new("L", (W, H), 0)
    sd = ImageDraw.Draw(shadow)
    d = ImageDraw.Draw(img)
    pad = 72
    maxw = W - 2 * pad - 140

    # Заголовок і підзаголовок: у проєктів «Назва — опис».
    title, sub = item["title"], None
    if item["kind"] == "proekty" and " — " in title:
        title, sub = title.split(" — ", 1)
    tf, lines, ts = fit_title(d, title, maxw)
    lh = int(ts * 1.08)
    sf = font(34, "Medium")
    block = lh * len(lines) + (54 if sub else 0)
    y = H - pad - block

    # Брова: золота лінія + знак.
    ef = font(22, "Bold")
    ey = y - 58
    label = "CAS DEVELOPMENT" + ("  ·  ПРОЄКТ" if item["kind"] == "proekty" else "  ·  " + item.get("label", "БЛОГ"))

    if sub:
        sub = sub[0].upper() + sub[1:]
    for dr in (sd, None):  # спершу м'яка тінь, потім текст
        t = dr or d
        for i, ln in enumerate(lines):
            t.text((pad - 2, y + i * lh), ln, font=tf, fill=255 if dr else TEXT)
        if sub:
            t.text((pad, y + lh * len(lines) + 14), sub, font=sf, fill=255 if dr else (214, 205, 190))
        if dr:
            sd.rectangle([pad, ey + 4, pad + 520, ey + 26], fill=160)
            shadow = shadow.filter(ImageFilter.GaussianBlur(14)).point(lambda v: int(v * 0.6))
            img = Image.composite(black, img, shadow)
            d = ImageDraw.Draw(img)
            d.line([(pad, ey + 13), (pad + 48, ey + 13)], fill=GOLD, width=2)
            spaced(d, (pad + 64, ey), label, ef, GOLD, 4)

    # Домен праворуч унизу.
    df = font(24, "Medium")
    dom = "cas-develop.com"
    d.text((W - pad - d.textlength(dom, font=df), H - pad - 22), dom, font=df, fill=(214, 205, 190))
    return img


def save(img, path):
    for q in (84, 80, 76, 72, 68, 64, 60, 55, 50):
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=q, optimize=True, progressive=True, subsampling="4:2:0")
        if buf.tell() <= MAX_BYTES:
            break
    path.write_bytes(buf.getvalue())
    return q, buf.tell()


def main():
    only = set(sys.argv[1:])
    OUT.mkdir(parents=True, exist_ok=True)
    black, mask = overlay()
    for it in pages():
        if only and it["slug"] not in only:
            continue
        img = render(it, black, mask)
        q, n = save(img, OUT / f"{it['slug']}.jpg")
        print(f"{it['slug']:48s} q={q} {n // 1024:4d} KB  {it['photo'] or 'NO PHOTO'}")


if __name__ == "__main__":
    main()
