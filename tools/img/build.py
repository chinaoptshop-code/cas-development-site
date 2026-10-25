#!/usr/bin/env python3
"""Image pipeline for cas-develop.com (static site).

What it does (idempotent, never deletes/renames files, keeps dimensions):
  1. Re-encodes oversized WebP in place:
       - size inversion: a narrower variant of the same photo is heavier than a wider one;
       - over-quality: bytes per pixel above BPP_LIMIT;
       - hero / first-screen images (read from HTML, read-only) above HERO_MAX bytes.
  2. Writes an .avif next to every .webp (quality picked per image by binary search:
     aim ~40% smaller than WebP, never below SSIM_MIN vs the WebP).
  3. Writes img/lqip.json: "img/p/<name>" -> tiny blurred WebP data URI (<= 300 bytes).
  4. Writes tools/img/report.md.

Run from the repo root:  python tools/img/build.py [--force] [--jobs N]
Needs Pillow >= 11.2 (built-in AVIF) and numpy.
"""
import argparse, base64, glob, io, json, os, re, sys, time
from collections import defaultdict
from multiprocessing import Pool

import numpy as np
from PIL import Image, ImageFilter, features

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SSIM_MIN = 0.97          # vs current WebP, grayscale, downscaled 2x (max 768 px)
Q_MIN_AVIF = 40          # never go below this AVIF quality (except hard hero cap)
AVIF_TARGET = 0.60       # aim: AVIF = 60% of WebP bytes (40% saving)
AVIF_SPEED = 6
HERO_MAX = 120 * 1024
HERO_BLUR = (0, 0.4, 0.6, 0.8, 1.0)  # pre-smoothing radii tried only when a hero WebP cannot fit HERO_MAX
BPP_LIMIT = 0.22         # bytes per pixel above which a WebP counts as over-quality
REENC_MIN_GAIN = 0.12    # re-encode only if it saves >= 12%
LQIP_MAX = 300
SKIP_NAMES = {"og-cas.jpg"}  # Open Graph image: crawlers need JPEG, not part of page images

# ---------------------------------------------------------------- SSIM ----------
def _gray(img, maxside=768):
    # half resolution (max 768 px): measures visible structure, not the WebP's own pixel noise
    g = img.convert("L")
    w, h = g.size
    s = min(0.5, maxside / max(w, h))
    if s < 1.0:
        g = g.resize((max(8, round(w * s)), max(8, round(h * s))), Image.LANCZOS)
    return np.asarray(g, dtype=np.float64)

def _box(a, r=3):
    k = 2 * r + 1
    c = np.cumsum(np.cumsum(np.pad(a, ((1, 0), (1, 0))), 0), 1)
    return (c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]) / (k * k)

def ssim(ref_gray, img):
    x = ref_gray
    y = _gray(img, maxside=max(x.shape))
    if y.shape != x.shape:
        y = np.asarray(Image.fromarray(y.astype(np.uint8)).resize(x.shape[::-1], Image.LANCZOS), dtype=np.float64)
    C1, C2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2
    mx, my = _box(x), _box(y)
    sxx = _box(x * x) - mx * mx
    syy = _box(y * y) - my * my
    sxy = _box(x * y) - mx * my
    m = ((2 * mx * my + C1) * (2 * sxy + C2)) / ((mx * mx + my * my + C1) * (sxx + syy + C2))
    return float(m.mean())

# ---------------------------------------------------------------- encoders ------
def enc_avif(img, q):
    b = io.BytesIO()
    img.save(b, "AVIF", quality=q, speed=AVIF_SPEED)
    return b.getvalue()

def enc_webp(img, q):
    b = io.BytesIO()
    img.save(b, "WEBP", quality=q, method=6)
    return b.getvalue()

def load(path):
    im = Image.open(path)
    im.load()
    if im.mode not in ("RGB", "RGBA"):
        im = im.convert("RGBA" if "A" in im.getbands() else "RGB")
    return im

def search(img, ref, enc, max_bytes, lo=20, hi=92, floor=True):
    """Largest q with size <= max_bytes; then, if SSIM < SSIM_MIN, smallest q reaching SSIM_MIN.
    Returns (q, data, ssim, met_target)."""
    cache = {}
    def get(q):
        if q not in cache:
            d = enc(img, q)
            cache[q] = (d, None)
        return cache[q][0]
    def get_s(q):
        d = get(q)
        if cache[q][1] is None:
            cache[q] = (d, ssim(ref, Image.open(io.BytesIO(d))))
        return cache[q][1]
    a, b, best = lo, hi, None
    while a <= b:
        m = (a + b) // 2
        if len(get(m)) <= max_bytes:
            best, a = m, m + 1
        else:
            b = m - 1
    if not floor:  # hard size cap: largest q that fits (or the lowest q tried)
        q = best if best is not None else lo
        return q, get(q), get_s(q), get_s(q) >= SSIM_MIN
    if best is not None and get_s(best) >= SSIM_MIN:
        return best, get(best), get_s(best), True
    # quality floor by SSIM
    a, b, qs = (best or lo), hi, None
    while a <= b:
        m = (a + b) // 2
        if get_s(m) >= SSIM_MIN:
            qs, b = m, m - 1
        else:
            a = m + 1
    if qs is None:
        qs = hi
    return qs, get(qs), get_s(qs), False

# ---------------------------------------------------------------- tasks ---------
def task_webp(args):
    path, reasons, max_bytes = args
    full = os.path.join(ROOT, path)
    before = os.path.getsize(full)
    img = load(full)
    ref = _gray(img)
    q, data, s, ok = search(img, ref, enc_webp, max_bytes, lo=40, hi=90)
    hard_cap = "hero" in reasons
    if len(data) < before * (1 - REENC_MIN_GAIN) or (hard_cap and before > HERO_MAX and len(data) < before):
        if hard_cap and len(data) > HERO_MAX:
            # hero cap wins over SSIM floor. Very grainy photos cannot reach 120 KB by quality alone
            # without blocking, so also try a light pre-smoothing and keep the best SSIM that fits.
            best = None
            for r in HERO_BLUR:
                src = img if r == 0 else img.filter(ImageFilter.GaussianBlur(r))
                q2, data2, s2, _ = search(src, ref, enc_webp, HERO_MAX, lo=30, hi=q, floor=False)
                if len(data2) <= HERO_MAX and (best is None or s2 > best[2]):
                    best = (q2, data2, s2, r)
            if best:
                q, data, s, blur = best
                reasons = reasons + ([f"blur {blur}"] if blur else [])
        with open(full, "wb") as f:
            f.write(data)
        return dict(path=path, reasons=reasons, before=before, after=len(data), q=q, ssim=round(s, 4), done=True)
    return dict(path=path, reasons=reasons, before=before, after=before, q=None, ssim=None, done=False)

def task_avif(args):
    path, cap, force = args
    full = os.path.join(ROOT, path)
    out = os.path.splitext(full)[0] + ".avif"
    w = os.path.getsize(full)
    if not force and os.path.exists(out) and os.path.getmtime(out) >= os.path.getmtime(full):
        return dict(path=path, webp=w, avif=os.path.getsize(out), q=None, ssim=None, cached=True, note="")
    img = load(full)
    ref = _gray(img)
    target = min(int(w * AVIF_TARGET), cap)
    q, data, s, ok = search(img, ref, enc_avif, target, lo=Q_MIN_AVIF, hi=90)
    note = ""
    if len(data) > cap:
        q, data, s, _ = search(img, ref, enc_avif, cap, lo=10, hi=q, floor=False)
        note = "hero cap"
    if len(data) >= w:
        q, data, s, _ = search(img, ref, enc_avif, int(w * 0.95), lo=10, hi=q, floor=False)
        note = "capped at 95% of WebP"
    with open(out, "wb") as f:
        f.write(data)
    return dict(path=path, webp=w, avif=len(data), q=q, ssim=round(s, 4), cached=False, note=note or ("" if ok else "SSIM floor > target"))

def task_lqip(path):
    img = load(os.path.join(ROOT, path)).convert("RGB")
    w, h = img.size
    for width, q in ((20, 40), (16, 35), (16, 20), (12, 20), (10, 10)):
        hh = max(1, round(h * width / w))
        t = img.resize((width, hh), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.6))
        b = io.BytesIO()
        t.save(b, "WEBP", quality=q, method=6)
        uri = "data:image/webp;base64," + base64.b64encode(b.getvalue()).decode()
        if len(uri) <= LQIP_MAX:
            return path, uri
    return path, uri

# ---------------------------------------------------------------- planning ------
SUFFIX = re.compile(r"^(?P<base>.+)-(?P<tag>r?\d+|bg\d+)$")

def hero_images():
    """Images likely on the first screen of each page: fetchpriority=high / non-lazy first <img>,
    <img>/srcset/url() inside the first element with a 'hero' class, CSS url() in .hero rules,
    and <link rel=preload as=image>."""
    found = defaultdict(set)
    ref = re.compile(r"/?(img/[^\s\"')]+?\.(?:webp|jpe?g|png))")
    for html in glob.glob(os.path.join(ROOT, "**", "*.html"), recursive=True):
        if "/tools/" in html:
            continue
        s = open(html, encoding="utf-8", errors="ignore").read()
        page = os.path.relpath(html, ROOT)
        chunks = []
        for m in re.finditer(r"<link[^>]+rel=\"preload\"[^>]*>", s):
            if 'as="image"' in m.group(0):
                chunks.append(m.group(0))
        for m in re.finditer(r"<img\b[^>]*>", s):
            tag = m.group(0)
            if "fetchpriority=\"high\"" in tag:
                chunks.append(tag)
        first = re.search(r"<img\b[^>]*>", re.sub(r"<(header|nav)\b.*?</\1>", "", s, flags=re.S))
        if first and 'loading="lazy"' not in first.group(0):
            chunks.append(first.group(0))
        h = re.search(r"<(\w+)[^>]*class=\"[^\"]*\bhero\b[^\"]*\"[^>]*>", s)
        if h:
            # take the element up to the next <section> / end of main block
            end = s.find("<section", h.end())
            seg = s[h.start(): end if end > 0 else h.end() + 6000]
            # lazy images inside the hero (e.g. sliders further down) are not first-screen
            seg = re.sub(r"<img\b[^>]*loading=\"lazy\"[^>]*>", "", seg)
            chunks.append(seg)
        for st in re.findall(r"<style[^>]*>(.*?)</style>", s, flags=re.S):
            for m in re.finditer(r"([^{}]+)\{([^{}]*)\}", st):
                if "hero" in m.group(1) and "url(" in m.group(2):
                    chunks.append(m.group(2))
        for c in chunks:
            for r in ref.findall(c):
                found[r.split("?")[0]].add(page)
    return found

def collect():
    files, skipped = [], []
    for d in ("img", "img/p", "img/uploads"):  # img/uploads — фото з адмінки (/kabinet/admin → Медіа, Блог)
        if not os.path.isdir(os.path.join(ROOT, d)): continue
        for f in sorted(os.listdir(os.path.join(ROOT, d))):
            p = f"{d}/{f}"
            full = os.path.join(ROOT, p)
            if os.path.isdir(full):
                if f == "og":
                    skipped.append((p + "/", "Open Graph folder"))
                continue
            ext = os.path.splitext(f)[1].lower()
            if ext in (".svg", ".ico"):
                skipped.append((p, "vector/icon")); continue
            if ext == ".avif":
                continue
            if f in SKIP_NAMES:
                skipped.append((p, "Open Graph image (JPEG for crawlers), not a page image")); continue
            if ext in (".jpg", ".jpeg", ".png"):
                if not os.path.exists(os.path.splitext(full)[0] + ".webp"):
                    skipped.append((p, "no WebP counterpart")); continue
                continue  # webp sibling handles it
            if ext == ".webp":
                files.append(p)
    return files, skipped

def plan_webp(files, heroes):
    groups = defaultdict(list)
    info = {}
    for p in files:
        full = os.path.join(ROOT, p)
        with Image.open(full) as im:
            w, h = im.size
        info[p] = (w, h, os.path.getsize(full))
        stem = os.path.splitext(os.path.basename(p))[0]
        m = SUFFIX.match(stem)
        groups[(os.path.dirname(p), m.group("base") if m else stem)].append(p)
    jobs = {}
    for g in groups.values():
        g.sort(key=lambda p: info[p][0] * info[p][1])
        for i, p in enumerate(g):
            w, h, size = info[p]
            reasons, cap = [], None
            bigger = [q for q in g[i + 1:] if info[q][0] * info[q][1] > w * h]
            if bigger:
                lim = min(info[q][2] for q in bigger)
                if size > lim:
                    reasons.append("inversion"); cap = int(lim * 0.95)
            if size / (w * h) > BPP_LIMIT:
                reasons.append("over-quality"); cap = min(cap or 10**9, int(size * (1 - REENC_MIN_GAIN)))
            if p in heroes and size > HERO_MAX:
                reasons.append("hero"); cap = min(cap or 10**9, HERO_MAX)
            if reasons:
                jobs[p] = (p, reasons, cap)
    return list(jobs.values()), info

# ---------------------------------------------------------------- main ----------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="re-encode all AVIF even if up to date")
    ap.add_argument("--jobs", type=int, default=max(1, (os.cpu_count() or 4) - 2))
    ap.add_argument("--no-webp", action="store_true", help="skip WebP re-encoding step")
    a = ap.parse_args()
    if not features.check("avif"):
        sys.exit("Pillow without AVIF support: pip install 'pillow>=11.2'")
    t0 = time.time()
    files, skipped = collect()
    heroes = hero_images()
    hero_files = sorted(p for p in heroes if p in set(files))
    webp_before = {p: os.path.getsize(os.path.join(ROOT, p)) for p in files}
    with Pool(a.jobs) as pool:
        reenc = []
        if not a.no_webp:
            seen = set()
            for _ in range(3):  # re-plan: capping a hero can create a new size inversion
                jobs = [j for j in plan_webp(files, set(hero_files))[0] if (j[0], tuple(j[1])) not in seen]
                if not jobs:
                    break
                seen |= {(j[0], tuple(j[1])) for j in jobs}
                print(f"WebP re-encode candidates: {len(jobs)}", flush=True)
                done = {r["path"]: r for r in reenc}
                for r in pool.map(task_webp, jobs, chunksize=1):
                    if r["path"] in done and done[r["path"]]["done"]:
                        r["before"] = done[r["path"]]["before"]
                        r["reasons"] = done[r["path"]]["reasons"] + r["reasons"]
                        r["done"] = True if r["done"] else done[r["path"]]["done"]
                        if not r["q"]:
                            r.update(after=done[r["path"]]["after"], q=done[r["path"]]["q"], ssim=done[r["path"]]["ssim"])
                    done[r["path"]] = r
                reenc = list(done.values())
        print(f"AVIF: {len(files)} files", flush=True)
        av = []
        for i, r in enumerate(pool.imap_unordered(task_avif, [(p, HERO_MAX if p in heroes else 10**9, a.force) for p in files], chunksize=4)):
            av.append(r)
            if i % 100 == 0:
                print(f"  {i}/{len(files)}", flush=True)
        lq = dict(pool.map(task_lqip, files, chunksize=16))
    lqip = {os.path.splitext(p)[0]: lq[p] for p in sorted(lq)}
    with open(os.path.join(ROOT, "img", "lqip.json"), "w") as f:
        json.dump(lqip, f, ensure_ascii=False, separators=(",", ":"), indent=0)
    webp_after = {p: os.path.getsize(os.path.join(ROOT, p)) for p in files}
    write_report(files, skipped, webp_before, webp_after, reenc, av, lqip, heroes, hero_files, time.time() - t0)

def kb(n):
    return f"{n/1024:.1f} KB"

def write_report(files, skipped, wb, wa, reenc, av, lqip, heroes, hero_files, dt):
    avd = {r["path"]: r for r in av}
    tb, ta = sum(wb.values()), sum(wa.values())
    tav = sum(r["avif"] for r in av)
    savings = [1 - r["avif"] / wa[r["path"]] for r in av]
    ssims = [r["ssim"] for r in av if r["ssim"] is not None]
    L = ["# Image pipeline report", "",
         f"Generated by `tools/img/build.py` in {dt/60:.1f} min.", "",
         "## Totals", "",
         f"- Files processed (WebP in `img/`, `img/p/`): **{len(files)}**",
         f"- WebP total before: **{tb/1e6:.2f} MB** ({tb:,} B)",
         f"- WebP total after: **{ta/1e6:.2f} MB** ({ta:,} B), −{(tb-ta)/1e6:.2f} MB",
         f"- AVIF total: **{tav/1e6:.2f} MB** ({tav:,} B) — {tav/ta*100:.1f}% of WebP",
         f"- Average AVIF saving vs WebP (per file): **{np.mean(savings)*100:.1f}%** (median {np.median(savings)*100:.1f}%, min {min(savings)*100:.1f}%, max {max(savings)*100:.1f}%)",
         f"- AVIF SSIM vs WebP (grayscale, half resolution, ≤768 px): min {min(ssims) if ssims else 0:.4f}, mean {np.mean(ssims) if ssims else 0:.4f}",
         f"- LQIP entries in `img/lqip.json`: {len(lqip)}, max data-URI length {max(map(len, lqip.values()))} chars",
         ""]
    notes = [r for r in av if r.get("note")]
    if notes:
        L += [f"AVIF where SSIM floor forced a size above the 60% target or a cap applied: {len(notes)} files "
              f"(saving still {np.mean([1-r['avif']/wa[r['path']] for r in notes])*100:.1f}% on average).", ""]
    done = [r for r in reenc if r["done"]]
    L += ["## Re-encoded WebP (in place, same dimensions and name)", "",
          f"{len(done)} of {len(reenc)} candidates re-encoded.", "",
          "| File | Reason | Before | After | q | SSIM |", "|---|---|---:|---:|---:|---:|"]
    for r in sorted(done, key=lambda r: r["path"]):
        L.append(f"| `{r['path']}` | {', '.join(r['reasons'])} | {kb(r['before'])} | {kb(r['after'])} | {r['q']} | {r['ssim']} |")
    nd = [r for r in reenc if not r["done"]]
    if nd:
        L += ["", f"Candidates left unchanged (re-encode would not save ≥{int(REENC_MIN_GAIN*100)}% at SSIM ≥ {SSIM_MIN}): {len(nd)}", ""]
        for r in sorted(nd, key=lambda r: r["path"]):
            L.append(f"- `{r['path']}` ({', '.join(r['reasons'])}, {kb(r['before'])})")
    L += ["", "## Hero / first-screen images", "",
          "Detected from HTML (read-only): `fetchpriority=high`, first non-lazy `<img>`, images inside the first `.hero` element, `url()` in hero CSS, `<link rel=preload as=image>`.", "",
          "| File | WebP | AVIF | Pages |", "|---|---:|---:|---|"]
    for p in hero_files:
        pages = sorted(heroes[p])
        L.append(f"| `{p}` | {kb(wa[p])} | {kb(avd[p]['avif'])} | {', '.join(pages[:3])}{' …' if len(pages) > 3 else ''} |")
    over = [p for p in hero_files if wa[p] > HERO_MAX or avd[p]["avif"] > HERO_MAX]
    L += ["", f"Hero images over 120 KB: {len(over)}" + (": " + ", ".join(f"`{p}`" for p in over) if over else ""), ""]
    L += ["## Skipped", ""] + ([f"- `{p}` — {why}" for p, why in skipped] or ["- none"]) + [""]
    with open(os.path.join(ROOT, "tools", "img", "report.md"), "w") as f:
        f.write("\n".join(L))
    print("\n".join(L[:14]))

if __name__ == "__main__":
    main()
