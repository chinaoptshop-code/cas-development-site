#!/usr/bin/env python3
"""Ставки «від» — єдине джерело для калькулятора, квізу й сцен-конфігураторів (лише з CLAUDE.md).

  python3 tools/site/rates.py           # вписати блок ставок у JS-споживачів (ідемпотентно; викликає build-all.sh)
  python3 tools/site/rates.py --check   # код 1, якщо блок у якомусь JS застарів

[Україна, Європа] у $; None — ставки немає → «за кошторисом». Європа — ~+50% до київських (Михайло 01.11.2026).
У JS блок стоїть між /*rates*/ і /*/rates*/ (CAS_RATES, CAS_DMIN, casCost, casParseNum) — руками не правити.
Тести математики — node tools/tests/calc.mjs (виконує той самий блок).
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

RATES = {
    'reno': [550, 850],      # ремонт квартири під ключ, за м² (роботи + чорнові матеріали)
    'office': [350, None],   # ремонт офісу, за м²
    'box': [600, 900],       # будівництво будинку (коробка), за м²
    'key': [1100, 1700],     # будинок під ключ, за м²
    'arch': [12, 18],        # архітектурний проєкт будинку, за м²
    'land': [50, None],      # ландшафтний дизайн, за сотку (100 м²)
    'furn': [250, 400],      # меблювання й комплектація, за м²
    'plan': [6, None],       # дизайн: планувальний пакет, за м²
    'dz': [30, 45],          # дизайн-проєкт інтерʼєру, за м²
    'full': [45, None],      # дизайн: повний з авторським наглядом, за м²
}
DESIGN = ('plan', 'dz', 'full')
DMIN = [2500, 4000]          # мінімум за дизайн (усі пакети), Україна / Європа

CONSUMERS = ['assets/calc.v1.js', 'assets/quiz.v1.js', 'assets/build-anim.v1.js', 'assets/land-anim.v1.js',
             'assets/resort-plan.v1.js', 'assets/restaurant-anim.v1.js', 'assets/water-house.v1.js']
RX = re.compile(r'/\*rates\*/.*?/\*/rates\*/', re.S)


def cost(k, region, area):
    """Те саме, що casCost у JS: ставка × площа (дизайн — не менше мінімуму); None — ставки немає або площа ≤ 0."""
    r = RATES.get(k)
    v = r[1 if region else 0] if r else None
    if v is None or not area or area <= 0:
        return None
    s = v * area
    if k in DESIGN:
        s = max(s, DMIN[1 if region else 0])
    return round(s)


def js():
    d = json.dumps(RATES, separators=(',', ':'))
    return ('/*rates*/ /* ЗГЕНЕРОВАНО tools/site/rates.py — ставки CLAUDE.md [Україна, Європа], null — за кошторисом; руками не правити */\n'
            f'var CAS_RATES = {d}, CAS_DMIN = {json.dumps(DMIN)}, CAS_DZ = {json.dumps(list(DESIGN))};\n'
            '/* сума рядка: ставка × площа (дизайн — не менше мінімуму), округлена; null — ставки немає (за кошторисом) або площа ≤ 0 */\n'
            'function casCost(k, R, a) { var r = CAS_RATES[k], i = R ? 1 : 0, v = r ? r[i] : null; if (v == null || !(a > 0) || !isFinite(a)) return null;'
            ' var s = v * a; if (CAS_DZ.indexOf(k) >= 0) s = Math.max(s, CAS_DMIN[i]); return Math.round(s); }\n'
            '/* число з поля вводу: кома або крапка, пробіли між тисячами; NaN — не число */\n'
            'function casParseNum(s) { s = String(s == null ? \'\' : s).replace(/[\\s\\u00a0\\u202f]/g, \'\').replace(\',\', \'.\');'
            ' return /^[-+]?(\\d+\\.?\\d*|\\.\\d+)$/.test(s) ? +s : NaN; }\n'
            '/*/rates*/')


def main():
    check = '--check' in sys.argv
    block, bad = js(), []
    for rel in CONSUMERS:
        p = os.path.join(ROOT, rel)
        s = open(p, encoding='utf-8').read()
        if len(RX.findall(s)) != 1:
            print(f'{rel}: потрібне рівно одне місце /*rates*/…/*/rates*/ (у коментарях писати «rates-блок»)'); sys.exit(1)
        n = RX.sub(lambda m: block, s)
        if n != s:
            bad.append(rel)
            if not check:
                open(p, 'w', encoding='utf-8').write(n)
    if check:
        print('\n'.join(bad) if bad else 'Ставки: OK')
        sys.exit(1 if bad else 0)
    print(f'Ставки: оновлено {len(bad)} з {len(CONSUMERS)} JS')


if __name__ == '__main__':
    main()
