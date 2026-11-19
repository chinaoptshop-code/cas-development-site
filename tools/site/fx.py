#!/usr/bin/env python3
"""Орієнтовна друга валюта біля цін «від $…» (Михайло 18.11.2026: «$ головна + ≈€/≈₴»).

  python3 tools/site/fx.py --update   # курси НБУ (USD/UAH, EUR/UAH) → tools/site/fx.json і блок /*fx*/ у site-chrome.v1.js
  python3 tools/site/fx.py            # лише вписати поточні курси з fx.json у site-chrome.v1.js (ідемпотентно)
  python3 tools/site/fx.py --demo     # приклади для всіх мов

Головна ціна — завжди $ (суми не змінюються); у видимому тексті після «від $550/м²» — «(≈ €500/м²)» на de, fr, es, pt, pl
і «(≈ 25 000 ₴/м²)» на uk, ru; en, zh, ar — лише $. title/meta/alt/data-xs (рядки плиток) і JSON-LD — лише $.
Ставить apply() у chrome.apply() (після nbsp_prices); на повторному проході стара «(≈ …)» замінюється новою (курс міг змінитися).
Оздоба (власна фраза «$10 000 (≈ 460 000 ₴)») і кабінет — без змін. У JS — window.casFx(n, мова) (калькулятор, квіз).
Курси оновлювати раз на місяць (--update); без мережі лишаються попередні значення з fx.json.
Округлення: € — до 1 (< 100), 10 (< 1 000), 50 (< 10 000), 100 (< 100 000), далі 1 000;
₴ — до 10 (< 1 000), 100 (< 10 000), 500 (< 100 000), 1 000 (< 1 000 000), далі 10 000 (суми калькулятора).
"""
import json, os, re, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
FILE = os.path.join(HERE, 'fx.json')
JS = os.path.join(ROOT, 'assets', 'site-chrome.v1.js')
API = 'https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode={}&json'

EUR_LANGS = ('de', 'fr', 'es', 'pt', 'pl')
UAH_LANGS = ('uk', 'ru')
NN, NB = ' ', ' '

# «від» мовами (лише ціни з прийменником «від»: мінімуми, «× $550» і суми без «від» — без другої валюти)
PREP = {
    'uk': r'[Вв]ід', 'ru': r'[Оо]т', 'de': r'[Aa]b', 'fr': r'[Dd]ès|[Àà] partir de', 'es': r'[Dd]esde|[Aa] partir de',
    'pt': r'[Dd]esde|[Aa] partir de', 'pl': r'[Oo]d',
}
_AMT = r'\$(\d{1,3}(?:[ ,]\d{3})+|\d+)'
_UNIT = r'(?:/(м²|m²|сотку|сотки|соток|ar))?'
# наша «(≈ …)» з попереднього проходу: окремо «(≈ X)» або злита з наступною дужкою «(≈ X, …»
_OLD = r'[  ]\(≈[  ][^,;()$]*?\)'
_RX = {}


def rates():
    try:
        return json.load(open(FILE, encoding='utf-8'))
    except Exception:
        return {'date': '', 'usd_uah': 0, 'eur_uah': 0}


def _rx(lang):
    if lang not in _RX:
        _RX[lang] = re.compile(r'(?<![\w])((?:' + PREP[lang] + r')[  ]' + _AMT + r'(?:[–-]\$?(\d{1,3}(?:[ ,]\d{3})+|\d+))?' + _UNIT + r')'
                               r'(?![\d ,]\d)(' + _OLD + r')?')
    return _RX[lang]


def _round(v, steps):
    for lim, st in steps:
        if v < lim:
            return int(round(v / st) * st) or st
    return int(round(v / steps[-1][1]) * steps[-1][1])


def _grp(n):
    return f'{n:,}'.replace(',', NN)


def approx(usd, lang, r=None):
    """$ → «€500» / «25 000 ₴» (або None для мов лише з $)."""
    r = r or rates()
    if lang in EUR_LANGS and r.get('eur_uah'):
        return '€' + _grp(_round(usd * r['usd_uah'] / r['eur_uah'], [(100, 1), (1000, 10), (10000, 50), (100000, 100), (10 ** 12, 1000)]))
    if lang in UAH_LANGS and r.get('usd_uah'):
        return _grp(_round(usd * r['usd_uah'], [(1000, 10), (10000, 100), (100000, 500), (1000000, 1000), (10 ** 12, 10000)])) + NB + '₴'
    return None


def _num(x):
    return int(re.sub(r'[ ,]', '', x))


def _text(t, lang, r, room=None):
    rx, out, pos = _rx(lang), [], 0
    for m in rx.finditer(t):
        if m.start() < pos:
            continue
        pre = t[:m.start()]
        if pre.count('(') > pre.count(')'):
            continue  # ціна вже в дужках («(під ключ — від $1 100/м²)») — без вкладених дужок
        a = approx(_num(m.group(2)), lang, r)
        if m.group(3):  # діапазон «$30–60»
            b = approx(_num(m.group(3)), lang, r)
            a = (a.replace(NB + '₴', '') + '–' + b) if lang in UAH_LANGS else (a + '–' + b.lstrip('€'))
        unit = '/' + m.group(4) if m.group(4) else ''
        end, rest = m.end(), t[m.end():]
        old = re.match(r'[ \u00a0]\(≈[ \u00a0][^,;()$]*?, ', rest)  # злита «(≈ X, мінімум …)» з попереднього проходу
        if not unit and not m.group(5) and not old and re.match(r'[ \u00a0]+[^\W\d_]', rest):
            continue  # «$30 le m²», «$50 por cada 100 m²» — одиниця словами: без другої валюти
        if not unit and re.match(r'[ \u00a0]*[×=]', rest):
            continue  # «від $550 × 300 м² = …» — множник у розрахунку, не ціна
        if re.match(r'\s*(?:до|to|bis|à|a|hasta|até|do)\s+\$', rest):
            continue  # «від $30 до $60» — діапазон словами не розриваємо
        s = '(≈' + NB + a + unit
        if old:
            x, end = m.group(1) + ' ' + s + ', ', end + old.end()
        elif not m.group(5) and re.match(r'[ \u00a0]\((?!≈)', rest):  # «від $30/м² (мінімум $2 500)» → «(≈ …, мінімум $2 500)»
            x, end = m.group(1) + ' ' + s + ', ', end + 2
        else:
            x = m.group(1) + ' ' + s + ')'
        if room is not None:  # бюджет HTML сторінки: друга валюта — лише поки вміщується (по порядку: спершу hero й верх сторінки)
            extra = len(x.encode()) - len(t[m.start():end].encode())
            if extra > room[0]:
                room[1] += 1
                continue
            room[0] -= extra
        out += [t[pos:m.start()], x]
        pos = end
    out.append(t[pos:])
    return ''.join(out)


_STRIP = re.compile(r'(\$[\d\u202f,]+(?:[–-]\$?[\d\u202f,]+)?(?:/[^\s(]{1,6})?)(?:[ \u00a0]\(≈[ \u00a0][^,;()$]*?\)|[ \u00a0]\(≈[ \u00a0][^,;()$]*?, )')


def strip(s):
    """Прибрати нашу «(≈ …)» (для генераторів, що беруть uk-текст як ключ перекладу, — caselang.py)."""
    return _STRIP.sub(lambda m: m.group(1) + (' (' if m.group(0).endswith(', ') else ''), s) if '(≈' in s else s


_SKIP = re.compile(r'<(script|style|title|textarea|pre|code|svg)\b[^>]*>.*?</\1\s*>|<!--.*?-->|<[^>]*>', re.S | re.I)


SKIPPED = {}  # сторінка → скільки цін лишилось без другої валюти через бюджет HTML (звіт — fx.py --report)


def _limit(s, rel):
    try:
        sys.path.insert(0, os.path.join(ROOT, 'tools', 'ui'))
        import ui
        return ui.BUDGET['html_kb'][ui.kind(rel.replace(os.sep, '/'), s)] * 1024
    except Exception:
        return 64 * 1024


def apply(s, lang, rel=''):
    """Друга валюта в тексті <body> (не атрибути, не скрипти/JSON-LD; <template> — так, це копії стрічок). Ідемпотентно:
    стара «(≈ …)» знімається й ставиться заново за поточним курсом. Бюджет HTML (tools/ui/ui.py) важливіший: що не вміщується —
    лишається лише в $ (chrome.apply викликає це останнім кроком, коли сторінка вже повна)."""
    if lang not in EUR_LANGS + UAH_LANGS or '$' not in s:
        return s
    if re.match(r'(?:[a-z]{2}/)?(?:ozdoba|kabinet)', rel.replace(os.sep, '/')):
        return s
    r = rates()
    if not r.get('usd_uah'):
        return s
    s = strip(s)
    i = s.find('<body')
    if i < 0:
        return s
    room = [_limit(s, rel) - len(s.encode()), 0]
    body, out, pos = s[i:], [], 0
    for m in _SKIP.finditer(body):
        x = body[pos:m.start()]
        out += [_text(x, lang, r, room) if '$' in x else x, m.group(0)]
        pos = m.end()
    x = body[pos:]
    out.append(_text(x, lang, r, room) if '$' in x else x)
    if room[1]:
        SKIPPED[rel] = room[1]
    else:
        SKIPPED.pop(rel, None)
    return s[:i] + ''.join(out)


def report():
    """Сторінки, де бюджет HTML не вмістив другу валюту біля всіх цін «від»."""
    import glob, chrome
    n = 0
    for f in sorted(glob.glob(os.path.join(ROOT, '**', '*.html'), recursive=True)):
        rel = os.path.relpath(f, ROOT)
        if rel.startswith(('tools', 'node_modules')):
            continue
        s = open(f, encoding='utf-8').read()
        lang = chrome.page_lang(s)
        if lang in EUR_LANGS + UAH_LANGS and '$' in s:
            apply(s, lang, rel)
            if rel in SKIPPED:
                n += 1
                print(f'fx: {rel}: без ≈ (бюджет HTML) — {SKIPPED[rel]} цін')
    print(f'fx: сторінок з пропусками через бюджет: {n}')


def js_block(r=None):
    r = r or rates()
    return '/*fx*/W.casFxR = {uah: %s, eur: %s, d: "%s"};/*/fx*/' % (r['usd_uah'], r['eur_uah'], r['date'])


def write_js():
    s = open(JS, encoding='utf-8').read()
    n = re.sub(r'/\*fx\*/.*?/\*/fx\*/', lambda m: js_block(), s, count=1, flags=re.S)
    if n != s:
        open(JS, 'w', encoding='utf-8').write(n)
        print('fx: курси в', os.path.relpath(JS, ROOT))


def update():
    out = {}
    try:
        for c in ('USD', 'EUR'):
            with urllib.request.urlopen(API.format(c), timeout=20) as f:
                d = json.load(f)[0]
            out[c.lower() + '_uah'] = float(d['rate'])
            out['date'] = d['exchangedate']
    except Exception as e:
        print('fx: НБУ недоступний (' + str(e)[:80] + ') — лишаю курси', rates().get('date'))
        return
    old = rates()
    out = {'date': out['date'], 'usd_uah': out['usd_uah'], 'eur_uah': out['eur_uah'], 'source': 'НБУ, bank.gov.ua (офіційний курс)'}
    if out != old:
        open(FILE, 'w', encoding='utf-8').write(json.dumps(out, ensure_ascii=False, indent=1) + '\n')
    print(f"fx: {out['date']} USD/UAH {out['usd_uah']}, EUR/UAH {out['eur_uah']}")


if __name__ == '__main__':
    if '--update' in sys.argv:
        update()
    if '--report' in sys.argv:
        sys.path.insert(0, HERE)
        report()
    if '--demo' in sys.argv:
        for l, t in [('uk', 'від $550/м² (роботи)'), ('ru', 'от $1 100/м²'), ('de', 'ab $30/m²'), ('fr', 'dès $1 100/m²'),
                     ('pl', 'od $50/ar'), ('pt', 'a partir de $600/m²'), ('es', 'desde $6/m²')]:
            print(l, _text(t, l, rates()).replace(NN, '_').replace(NB, '~'))
    write_js()
