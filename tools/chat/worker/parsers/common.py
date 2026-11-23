"""Спільне для розбору файлів: «паспорт файлу», ліміти, пошук площ і сум, безпечні підпроцеси, перевірка zip.

Усе, що у файлах, — НЕДОВІРЕНІ ДАНІ. Розбір іде в окремому процесі (parse_one.py) з тайм-аутом і лімітами;
файл лежить у тимчасовій теці під службовим імʼям (in.<розширення з білого списку>), імʼя від відвідувача — лише підпис.
"""
import os
import re
import shutil
import subprocess
import zipfile

MAX_TEXT = 4000            # знаків витягу тексту в паспорті
MAX_PAGES = 300            # PDF: сторінок рахуємо до…
TEXT_PAGES = 40            # …текст беремо з перших N
MAX_ROWS = 5000            # таблиці: рядків на аркуш
MAX_SHEETS = 12
MAX_ZIP_ENTRIES = 3000
MAX_ZIP_TOTAL = 300 * 1024 * 1024
MAX_ZIP_RATIO = 150
MAX_PIXELS = 60_000_000
MAX_VIDEO_S = 600
MAX_AUDIO_S = 300

BREW = ["/opt/homebrew/bin", "/usr/local/bin", "/opt/homebrew/opt/ffmpeg-full/bin", "/Applications/ODAFileConverter.app/Contents/MacOS"]


def which(name):
    p = shutil.which(name)
    if p:
        return p
    for d in BREW:
        c = os.path.join(d, name)
        if os.path.isfile(c) and os.access(c, os.X_OK):
            return c
    return None


def run(cmd, timeout=60, cwd=None):
    """→ (код, stdout, stderr); тайм-аут — код 124. Без shell."""
    try:
        r = subprocess.run(cmd, capture_output=True, timeout=timeout, cwd=cwd, stdin=subprocess.DEVNULL)
        return r.returncode, r.stdout, r.stderr
    except subprocess.TimeoutExpired:
        return 124, b"", b"timeout"
    except OSError as e:
        return 127, b"", str(e).encode()


def passport(kind, type_label, ok=True, summary="", text="", numbers=None, warnings=None, manager=False, area_m2=None, **extra):
    d = {"kind": kind, "type": type_label, "ok": bool(ok), "summary": (summary or "")[:600], "text": clip(text),
         "numbers": numbers or {}, "warnings": [w[:200] for w in (warnings or [])][:10], "manager": bool(manager),
         "area_m2": round(area_m2, 1) if isinstance(area_m2, (int, float)) and area_m2 > 0 else None}
    d.update(extra)
    return d


def fail(kind, type_label, why, manager=True):
    return passport(kind, type_label, ok=False, summary="", warnings=[why], manager=manager)


def clip(t, n=MAX_TEXT):
    t = re.sub(r"[ \t ]+", " ", t or "")
    t = re.sub(r"\n{3,}", "\n\n", t).strip()
    return t if len(t) <= n else t[:n].rsplit(" ", 1)[0] + " …"


NUM = r"(\d{1,3}(?:[   .,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)"
AREA_RX = re.compile(NUM + r"\s*(?:м²|м2|кв\.?\s?м|m²|m2|sq\.?\s?m|㎡|平方米|qm)", re.I)
CUR_RX = re.compile(r"(?:(\$|US\$|USD|€|EUR|₴|грн\.?|UAH)\s?" + NUM + r"|" + NUM + r"\s?(\$|USD|€|EUR|₴|грн\.?|UAH|гривень|долар\w*))", re.I)


def to_num(s):
    s = (s or "").strip().replace(" ", " ").replace(" ", " ")
    if re.fullmatch(r"\d{1,3}(?:[ .,]\d{3})+", s):
        return float(re.sub(r"\D", "", s))
    m = re.fullmatch(r"(\d{1,3}(?:[ .,]\d{3})+)[.,](\d{1,2})", s)
    if m:
        return float(re.sub(r"\D", "", m.group(1)) + "." + m.group(2))
    s = s.replace(" ", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def find_areas(text, limit=30):
    out = []
    for m in AREA_RX.finditer(text or ""):
        v = to_num(m.group(1))
        if v and 0.5 <= v <= 100000:
            out.append(v)
        if len(out) >= limit:
            break
    return out


def find_sums(text, limit=30):
    out = []
    for m in CUR_RX.finditer(text or ""):
        cur, n = (m.group(1), m.group(2)) if m.group(2) else (m.group(4), m.group(3))
        v = to_num(n)
        if v:
            c = (cur or "").lower()
            code = "USD" if c in ("$", "us$", "usd") or c.startswith("долар") else "EUR" if c in ("€", "eur") else "UAH"
            out.append({"value": v, "currency": code})
        if len(out) >= limit:
            break
    return out


def zip_safe(path):
    """Перевірка zip-контейнера (xlsx, docx, zip) до розпаковки: кількість, сумарний розмір, коефіцієнт стиснення. → None або причина."""
    try:
        with zipfile.ZipFile(path) as z:
            infos = z.infolist()
            if len(infos) > MAX_ZIP_ENTRIES:
                return "забагато файлів в архіві"
            total = sum(i.file_size for i in infos)
            comp = sum(i.compress_size for i in infos) or 1
            if total > MAX_ZIP_TOTAL or total / comp > MAX_ZIP_RATIO:
                return "підозрілий архів (zip-бомба?)"
            for i in infos:
                if i.filename.startswith("/") or ".." in i.filename.split("/"):
                    return "небезпечні шляхи в архіві"
    except (zipfile.BadZipFile, OSError, ValueError):
        return "пошкоджений zip-контейнер"
    return None


def fmt_area(v):
    return f"{v:,.1f}".rstrip("0").rstrip(".").replace(",", " ")
