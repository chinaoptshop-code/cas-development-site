#!/usr/bin/env python3
"""UI-kit інструмент сайту cas-develop.com (не деплоїться: tools/ вирізається в CI).

  python3 tools/ui/ui.py scan            # аудит усіх сторінок → tools/ui/report.md
  python3 tools/ui/ui.py budget          # перевірка бюджету; код виходу 1, якщо є порушення
  python3 tools/ui/ui.py budget --report # те саме, але завжди код 0 (режим звіту для CI)
"""
import glob, gzip, json, os, re, sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MAIN = {'index.html', 'services.html', 'about.html', 'contact.html', 'portfolio.html'}
SKIP = {'privacy.html', 'terms.html', '404.html'}  # сторонні/службові шаблони

# Підтверджені Михайлом цифри (план Dell v2 §1). Усе інше на сторінках — підозріле.
PRICES_OK = {'$30', '$350', '$550', '$250', '$600', '$1 100', '$1100', '$50', '$2 500', '$2500', '$500', '$5 000', '$10 000', '$20 000'}  # $500 — мін. замовлення Оздоби; $5k/$10k/$20k — пороги знижки за обсягом Оздоби (Михайло 25.10.2026)
EST_RATES = {30, 550, 350, 250, 600, 1100}  # ставки з CLAUDE.md для data-est (дизайн, ремонт, офіс, меблювання, коробка, під ключ)
FACT_BAD = [r'\b158\+', r'\b200\+ проєкт', r'\b214\+', r'2 роки гарант', r'3 роки гарант', r'гарантія 2 роки', r'гарантія 3 роки']

BUDGET = {  # ліміти (без стиснення, бо brotli на сервері); MAIN — тимчасово м'якші до Ф3
    'html_kb': {'land': 60, 'main': 260, 'other': 120},
    'inline_js_kb': {'land': 8, 'main': 90, 'other': 40},
}


def pages():
    out = []
    for f in sorted(glob.glob(os.path.join(ROOT, '*.html')) + glob.glob(os.path.join(ROOT, '*/*.html'))):
        rel = os.path.relpath(f, ROOT)
        if rel.startswith(('google', 'tools/', 'styleguide/')) or rel in SKIP:
            continue
        out.append(rel)
    return out


def kind(rel, s):
    if rel in MAIN:
        return 'main'
    if 'class="w crumbs"' in s or 'class="w hero' in s:
        return 'land'
    return 'other'


def analyse(rel):
    s = open(os.path.join(ROOT, rel), encoding='utf-8').read()
    k = kind(rel, s)
    css = ''.join(re.findall(r'<style[^>]*>(.*?)</style>', s, re.S))
    js = ''.join(m for m in re.findall(r'<script(?![^>]*(?:application/ld\+json|speculationrules))[^>]*>(.*?)</script>', s, re.S))
    body = re.sub(r'<(script|style)[^>]*>.*?</\1>', '', s, flags=re.S).replace(' ', ' ')  # nbsp у цінах — chrome.nbsp_prices
    # орієнтири «площа × базова ставка» (картка «Коротко про проєкт»): перевіряємо розрахунок, а не список цін
    est = re.findall(r'<b data-est="(\d+)x(\d+)"[^>]*>(?:від|от) \$([\d ]+)</b>', body)
    est_bad = [f'{a}x{r}=${v}' for a, r, v in est if int(r) not in EST_RATES or int(v.replace(' ', '')) != (max(int(a) * 30, 2500) if r == '30' else int(a) * int(r))]
    text = re.sub(r'<[^>]+>', ' ', re.sub(r'<b data-est="[^"]*"[^>]*>[^<]*</b>', ' ', body))
    imgs = [i for i in re.findall(r'<img\b[^>]*>', s) if not re.search(r'id="(lb-img|lbi|plb-img|sdlb-img)"', i)]
    r = {
        'page': rel, 'kind': k,
        'html_kb': round(len(s.encode()) / 1024, 1),
        'gzip_kb': round(len(gzip.compress(s.encode())) / 1024, 1),
        'css_kb': round(len(css.encode()) / 1024, 1),
        'js_kb': round(len(js.encode()) / 1024, 1),
        'font_sizes': len(set(re.findall(r'font-size:\s*([^;}!]+)', css))),
        'tags': len(re.findall(r'<[a-zA-Z][^>]*>', body)),
        'img_no_size': sum(1 for i in imgs if not ('width=' in i and 'height=' in i)),
        'img_no_alt': sum(1 for i in imgs if ' alt=' not in i),
        'fetchpriority_high': len(re.findall(r'fetchpriority="high"', s)),
        'onclick_nav': len(re.findall(r'onclick="(?:goProject|go|filtToProject|location\.href)\(', s)),
        'h1_animated': bool(re.search(r'<h1[^>]*class="[^"]*\b(au|reveal|rv)\b', s)),
        'google_fonts': 'fonts.googleapis' in s,
        'clarity': 'z19wl000eu' in s,
        'hreflang': len(re.findall(r'hreflang=', s.split('</head>')[0])),
        'canonical': bool(re.search(r'<link rel="canonical"', s)),
        'h1_count': len(re.findall(r'<h1\b', s)),
        'osocor': bool(re.search(r'osocor|осокор|osokork', s, re.I)),
        'mu': sorted(set(re.findall(r'--mu:\s*(#[0-9a-fA-F]{3,6})', css))),
        'bg2': sorted(set(re.findall(r'--bg2:\s*(#[0-9a-fA-F]{3,6})', css))),
        'prices_bad': sorted(set(p for p in re.findall(r'\$\s?\d[\d ]*', text) if p.strip().rstrip() not in PRICES_OK and not p.startswith('$1 ') and '/' not in p)),
        'facts_bad': [p for p in FACT_BAD if re.search(p, text)],
        'est_bad': est_bad,
        'webhook_copies': s.count('webhook/contact-form'),
    }
    return r


def scan():
    rows = [analyse(p) for p in pages()]
    by = Counter(r['kind'] for r in rows)
    agg = lambda key: sum(r[key] for r in rows)
    lines = ['# Аудит сторінок cas-develop.com', '',
             f'Сторінок: {len(rows)} (MAIN {by["main"]}, LAND {by["land"]}, інші {by["other"]}). '
             f'HTML разом {agg("html_kb"):.0f} КБ, з них інлайн CSS {agg("css_kb"):.0f} КБ і JS {agg("js_kb"):.0f} КБ.', '',
             '## Проблеми', '']
    def issue(title, items):
        if items:
            lines.append(f'- **{title}** ({len(items)}): ' + ', '.join(items[:12]) + (' …' if len(items) > 12 else ''))
    issue('Google Fonts ще підключені', [r['page'] for r in rows if r['google_fonts']])
    issue('Без Clarity', [r['page'] for r in rows if not r['clarity']])
    issue('Без canonical', [r['page'] for r in rows if not r['canonical']])
    issue('H1 ≠ 1', [f"{r['page']}({r['h1_count']})" for r in rows if r['h1_count'] != 1])
    issue('H1 анімується', [r['page'] for r in rows if r['h1_animated']])
    issue('img без width/height', [f"{r['page']}({r['img_no_size']})" for r in rows if r['img_no_size']])
    issue('img без alt', [f"{r['page']}({r['img_no_alt']})" for r in rows if r['img_no_alt']])
    issue('Навігація через onclick', [f"{r['page']}({r['onclick_nav']})" for r in rows if r['onclick_nav']])
    issue('Більше одного fetchpriority=high', [r['page'] for r in rows if r['fetchpriority_high'] > 1])
    issue('Osocor у тексті', [r['page'] for r in rows if r['osocor']])
    issue('Непідтверджені ціни', [f"{r['page']}{r['prices_bad']}" for r in rows if r['prices_bad']])
    issue('Невірний орієнтир бюджету (data-est)', [f"{r['page']}{r['est_bad']}" for r in rows if r['est_bad']])
    issue('Застарілі факти', [f"{r['page']}{r['facts_bad']}" for r in rows if r['facts_bad']])
    mu = Counter(v for r in rows for v in r['mu']); bg2 = Counter(v for r in rows for v in r['bg2'])
    lines += ['', '## Токени', '', f'- `--mu`: {dict(mu)}', f'- `--bg2`: {dict(bg2)}',
              f'- Копій адреси вебхука форми: {agg("webhook_copies")} на {sum(1 for r in rows if r["webhook_copies"])} сторінках', '',
              '## Сторінки', '', '| сторінка | тип | HTML КБ | gzip КБ | CSS КБ | JS КБ | розмірів шрифту | тегів |', '|---|---|---|---|---|---|---|---|']
    for r in sorted(rows, key=lambda r: -r['html_kb']):
        lines.append(f"| {r['page']} | {r['kind']} | {r['html_kb']} | {r['gzip_kb']} | {r['css_kb']} | {r['js_kb']} | {r['font_sizes']} | {r['tags']} |")
    out = os.path.join(ROOT, 'tools/ui/report.md')
    open(out, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
    json.dump(rows, open(os.path.join(ROOT, 'tools/ui/report.json'), 'w'), ensure_ascii=False, indent=1)
    print('\n'.join(lines[:30]))


def budget(report_only=False):
    bad = []
    for p in pages():
        r = analyse(p)
        k = r['kind']
        if r['html_kb'] > BUDGET['html_kb'][k]: bad.append(f"{p}: HTML {r['html_kb']} КБ > {BUDGET['html_kb'][k]}")
        if r['js_kb'] > BUDGET['inline_js_kb'][k]: bad.append(f"{p}: інлайн JS {r['js_kb']} КБ > {BUDGET['inline_js_kb'][k]}")
        if r['google_fonts']: bad.append(f'{p}: Google Fonts')
        if r['h1_animated']: bad.append(f'{p}: H1 анімується')
        if r['fetchpriority_high'] > 1: bad.append(f'{p}: fetchpriority=high > 1')
        if r['osocor']: bad.append(f'{p}: Osocor')
        if r['est_bad']: bad.append(f'{p}: невірний орієнтир бюджету {r["est_bad"]}')
        if r['h1_count'] != 1: bad.append(f'{p}: H1 = {r["h1_count"]}')
        if not r['canonical']: bad.append(f'{p}: без canonical')
        if '<!--chrome:h-->' not in open(os.path.join(ROOT, p), encoding='utf-8').read(): bad.append(f'{p}: без єдиної шапки (tools/site/chrome.py)')
    print('\n'.join(bad) if bad else 'Бюджет: OK')
    return 0 if (report_only or not bad) else 1


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'scan'
    if cmd == 'scan':
        scan()
    elif cmd == 'budget':
        sys.exit(budget('--report' in sys.argv))
    else:
        print(__doc__)
