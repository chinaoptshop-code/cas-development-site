#!/usr/bin/env python3
"""Ставки «від» — єдине джерело для калькулятора, квізу й сцен-конфігураторів (лише з CLAUDE.md).

  python3 tools/site/rates.py           # вписати блок ставок у JS-споживачів (ідемпотентно; викликає build-all.sh)
  python3 tools/site/rates.py --check   # код 1, якщо блок у якомусь JS застарів

[Україна, Європа] у $; None — ставки немає → «за кошторисом». Європа — ~+50% до київських (Михайло 01.11.2026).
Типи будинку (HOUSE, Михайло 21.11.2026) — власні ставки «коробка» / «під ключ» для позиції «Будівництво будинку»; як вписати — коментар біля HOUSE.
У JS блок стоїть між /*rates*/ і /*/rates*/ (CAS_RATES, CAS_DMIN, CAS_HT, casRate, casCost, casParseNum) — руками не правити.
Сервер (пропозиція в CRM, functions/api/admin/crm.js) — functions/_rates.js, цілком ЗГЕНЕРОВАНО тут же.
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

# Типи будинку для позиції «Будівництво будинку» (Михайло 21.11.2026: «може бути з різних категорій і різної ціни»).
# Ставки — Михайло 21.11.2026 (Україна); Європа — ×1,5 за його правилом «~на 50% вище», округлено вгору до 50 (< 1 000) / 100 (≥ 1 000).
# Формат: 'ключ': {'box': [Україна, Європа], 'key': [Україна, Європа]} у $ за м² — «коробка» і «під ключ»; None — ставки немає → «за кошторисом».
# Тип не вибрано («ще не визначились», типово) — діють базові RATES['box'] / RATES['key'], суми як до появи типів.
# Ключ — значення ?t=… у посиланні калькулятора (після публікації не перейменовувати); порядок запису = порядок кнопок.
# Новий тип — ще й назва 10 мовами: `hk` у T tools/site/calc.py (без назви calc.py зупиняється) і термін у tools/site/lang/glossary.json.
# Після правок: python3 tools/site/rates.py (rates-блок у JS + functions/_rates.js), далі bash tools/build-all.sh; тести — node tools/tests/calc.mjs.
HOUSE = {
    'brick':    {'box': [450, 700], 'key': [1100, 1700]},   # цегла / газоблок
    'frame':    {'box': [350, 550], 'key': [950, 1500]},   # каркасний деревʼяний
    'lstk':     {'box': [450, 700], 'key': [1150, 1800]},   # каркасний металевий (ЛСТК)
    'sip':      {'box': [300, 450], 'key': [750, 1200]},   # СІП-панелі
    'sandwich': {'box': [250, 400], 'key': [450, 700]},   # сендвіч-панелі
    'modular':  {'box': [300, 450], 'key': [750, 1200]},   # модульний
    'timber':   {'box': [250, 400], 'key': [550, 850]},   # з бруса
}
HOUSE_KEYS = ('box', 'key')  # ключі ставок RATES, які тип будинку замінює

CONSUMERS = ['assets/calc.v1.js', 'assets/quiz-core.v1.js', 'assets/build-anim.v1.js', 'assets/land-anim.v1.js',
             'assets/resort-plan.v1.js', 'assets/restaurant-anim.v1.js', 'assets/water-house.v1.js']
FUNC = 'functions/_rates.js'
RX = re.compile(r'/\*rates\*/.*?/\*/rates\*/', re.S)


def rate(k, region, t=None):
    """Те саме, що casRate у JS: ставка «від» регіону. Тип будинку t (ключ HOUSE) замінює ставки коробки / під ключ своїми —
    і None теж (за кошторисом); без типу або з невідомим типом — базові RATES."""
    h = HOUSE.get(t) if t else None
    r = h[k] if h and k in h else RATES.get(k)
    return r[1 if region else 0] if r else None


def cost(k, region, area, t=None):
    """Те саме, що casCost у JS: ставка × площа (дизайн — не менше мінімуму); None — ставки немає або площа ≤ 0. t — тип будинку (HOUSE)."""
    v = rate(k, region, t)
    if v is None or not area or area <= 0:
        return None
    s = v * area
    if k in DESIGN:
        s = max(s, DMIN[1 if region else 0])
    return round(s)


def js():
    d = json.dumps(RATES, separators=(',', ':'))
    return ('/*rates*/ /* ЗГЕНЕРОВАНО tools/site/rates.py — ставки CLAUDE.md [Україна, Європа], null — за кошторисом; руками не правити */\n'
            f'var CAS_RATES = {d}, CAS_DMIN = {json.dumps(DMIN)}, CAS_DZ = {json.dumps(list(DESIGN))},\n'
            f'  CAS_HT = {json.dumps(HOUSE, separators=(",", ":"))}; /* типи будинку: свої ставки коробки / під ключ */\n'
            '/* ставка регіону: тип будинку t (CAS_HT) замінює ставки коробки / під ключ своїми — і null теж; без типу чи з невідомим — CAS_RATES */\n'
            'function casRate(k, R, t) { var h = t && Object.prototype.hasOwnProperty.call(CAS_HT, t) ? CAS_HT[t] : null,'
            ' r = h && Object.prototype.hasOwnProperty.call(h, k) ? h[k] : CAS_RATES[k], v = r ? r[R ? 1 : 0] : null; return typeof v === \'number\' ? v : null; }\n'
            '/* сума рядка: ставка × площа (дизайн — не менше мінімуму), округлена; null — ставки немає (за кошторисом) або площа ≤ 0; t — тип будинку */\n'
            'function casCost(k, R, a, t) { var i = R ? 1 : 0, v = casRate(k, R, t); if (v == null || !(a > 0) || !isFinite(a)) return null;'
            ' var s = v * a; if (CAS_DZ.indexOf(k) >= 0) s = Math.max(s, CAS_DMIN[i]); return Math.round(s); }\n'
            '/* число з поля вводу: кома або крапка, пробіли між тисячами; NaN — не число */\n'
            'function casParseNum(s) { s = String(s == null ? \'\' : s).replace(/[\\s\\u00a0\\u202f]/g, \'\').replace(\',\', \'.\');'
            ' return /^[-+]?(\\d+\\.?\\d*|\\.\\d+)$/.test(s) ? +s : NaN; }\n'
            '/*/rates*/')


def module():
    """functions/_rates.js — ті самі ставки й формула, що casCost, для Pages Functions (ES-модуль)."""
    return ('// ЗГЕНЕРОВАНО tools/site/rates.py — ставки CLAUDE.md [Україна, Європа], null — за кошторисом; руками не правити\n'
            f'export const RATES = {json.dumps(RATES, separators=(",", ":"))};\n'
            f'export const DMIN = {json.dumps(DMIN)};\n'
            f'export const DESIGN = {json.dumps(list(DESIGN))};\n'
            '// типи будинку: свої ставки коробки / під ключ [Україна, Європа] (Михайло 21.11.2026; Європа — ×1,5 за його правилом); null — за кошторисом\n'
            f'export const HOUSE = {json.dumps(HOUSE, separators=(",", ":"))};\n'
            '// ставка регіону (eu — Європа, ~+50%) або null; t — тип будинку (HOUSE): замінює ставки коробки / під ключ своїми, без типу чи з невідомим — RATES\n'
            'export const rateOf = (k, eu, t) => { const h = t && Object.hasOwn(HOUSE, t) ? HOUSE[t] : null, r = h && Object.hasOwn(h, k) ? h[k] : (Object.hasOwn(RATES, k) ? RATES[k] : null);'
            ' const v = r ? r[eu ? 1 : 0] : null; return typeof v === \'number\' ? v : null; };\n'
            '// сума «від»: ставка × площа (дизайн — не менше мінімуму), округлена; null — ставки немає або площа ≤ 0 (як casCost)\n'
            'export function cost(k, eu, a, t) { const v = rateOf(k, eu, t); if (v == null || !(a > 0) || !Number.isFinite(a)) return null;'
            ' let s = v * a; if (DESIGN.includes(k)) s = Math.max(s, DMIN[eu ? 1 : 0]); return Math.round(s); }\n')


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
    fp, fm = os.path.join(ROOT, FUNC), module()
    if not os.path.exists(fp) or open(fp, encoding='utf-8').read() != fm:
        bad.append(FUNC)
        if not check:
            open(fp, 'w', encoding='utf-8').write(fm)
    if check:
        print('\n'.join(bad) if bad else 'Ставки: OK')
        sys.exit(1 if bad else 0)
    print(f'Ставки: оновлено {len(bad)} з {len(CONSUMERS) + 1} JS')


if __name__ == '__main__':
    main()
