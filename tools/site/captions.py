#!/usr/bin/env python3
"""Підписи до галерей «Наші проєкти» (.gal): що за обʼєкт, що робили і статус — лише за фактами сторінок /proekty/.

  python3 tools/site/captions.py            # оновити всі сторінки (uk, ru, en)
  python3 tools/site/captions.py --check    # лише перевірка (код 1, якщо щось не оновлено)

Перша фотографія кожного проєкту в галереї отримує підпис «<назва-посилання> — обʼєкт · статус», наступні — лише назву.
Статус «Реалізовано» — тільки Tetris Hall, Dolls Salon, Office Chicago (CLAUDE.md); решта — «Дизайн-проєкт».
Ідемпотентно; landing.py викликає apply() під час збірки, build-all.sh — для ручних сторінок.
"""
import glob, html, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SKIP = set()
NO = re.compile(r'(?:^|/)(?:blog|proekty|ozdoba|kabinet|styleguide)(?:/|\.html$)')
R, D = 'done', 'design'
STATUS = {'uk': {R: 'Реалізовано', D: 'Дизайн-проєкт'}, 'ru': {R: 'Реализовано', D: 'Дизайн-проект'},
          'en': {R: 'Completed', D: 'Design project'}}
# назва: (slug сторінки /proekty/, uk, ru, en, статус) — з розділу «Коротко про проєкт» на сторінках проєктів
P = {
    'Tetris Hall': ('tetris-hall', 'квартира: дизайн, ремонт і комплектація', 'квартира: дизайн, ремонт и комплектация', 'apartment: design, renovation and furnishing', R),
    'Dolls Salon': ('dolls-salon', 'салон краси: дизайн і ремонт під ключ', 'салон красоты: дизайн и ремонт под ключ', 'beauty salon: design and turnkey fit-out', R),
    'Office Chicago': ('office-chicago', 'офіс у ЖК Chicago, Київ: дизайн і реалізація', 'офис в ЖК Chicago, Киев: дизайн и реализация', 'office in the Chicago complex, Kyiv: design and fit-out', R),
    'Linden Penthouse': ('linden-penthouse', 'пентхаус 210 м², Київ', 'пентхаус 210 м², Киев', 'penthouse, 210 m², Kyiv', D),
    'Diamond': ('diamond', 'квартира: планування, 3D, меблі й світло', 'квартира: планировка, 3D, мебель и свет', 'apartment: layout, 3D, furniture and lighting', D),
    'Edelweiss': ('edelweiss', 'інтерʼєр із гардеробною: планування й 3D', 'интерьер с гардеробной: планировка и 3D', 'interior with a walk-in wardrobe: layout and 3D', D),
    'Petrivtsi House': ('petrivtsi-house', 'будинок 320 м², Петрівці: архітектура й інтерʼєр', 'дом 320 м², Петровцы: архитектура и интерьер', 'house, 320 m², Petrivtsi: architecture and interior', D),
    'Hodos Villa': ('hodos-villa', 'вілла 500 м², Київ', 'вилла 500 м², Киев', 'villa, 500 m², Kyiv', D),
    'Yacht Restaurant': ('yacht-restaurant', 'ресторан: концепція, зал і бар', 'ресторан: концепция, зал и бар', 'restaurant: concept, dining room and bar', D),
    'Monpark': ('monpark', 'ресторан із терасою й павільйоном', 'ресторан с террасой и павильоном', 'restaurant with a terrace and pavilion', D),
    'Pidgirland': ('pidgirland', 'будинок 260 м², Київська обл.', 'дом 260 м², Киевская обл.', 'house, 260 m², Kyiv region', D),
    'A-Frame House': ('a-frame-house', 'будинок A-frame: архітектура й інтерʼєр', 'дом A-frame: архитектура и интерьер', 'A-frame house: architecture and interior', D),
    'Yablu Rest': ('yablu-rest', 'рецепція, відпочинок і конференц-зал', 'рецепция, отдых и конференц-зал', 'reception, lounge and conference hall', D),
    'Smart Villa': ('smart-villa', 'вілла 170 м² з басейном: архітектура', 'вилла 170 м² с бассейном: архитектура', 'villa, 170 m², with a pool: architecture', D),
    'Kitana Beach': ('kitana-beach', 'пляжний комплекс, Бодрум (Туреччина)', 'пляжный комплекс, Бодрум (Турция)', 'beach resort, Bodrum (Turkey)', D),
    'Hoda Estate': ('hoda-estate', 'будинок 180 м² у Карпатах', 'дом 180 м² в Карпатах', 'house, 180 m², Carpathians', D),
    'House 150': ('house-150', 'будинок 150 м² з басейном', 'дом 150 м² с бассейном', 'house, 150 m², with a pool', D),
    'Yacht VIP': ('yacht-vip', 'особняк преміум-класу', 'особняк премиум-класса', 'premium mansion', D),
    'Dubai Villa': ('dubai-villa', 'вілла в Дубаї', 'вилла в Дубае', 'villa in Dubai', D),
    'USA House': ('usa-house', 'будинок 420 м², США', 'дом 420 м², США', 'house, 420 m², USA', D),
}
CAP_RX = re.compile(r'<figcaption(?: class="pc")?>(.*?)</figcaption>', re.S)


def _name(inner):
    m = re.match(r'<a [^>]*>([^<]+)</a>', inner)
    return (m.group(1) if m else inner).replace('→', '').strip()


def gallery(g, lang):
    seen = set()

    def cap(m):
        name = _name(m.group(1))
        if name not in P:
            return m.group(0)
        slug, uk, ru, en, st = P[name]
        hl = '' if lang == 'uk' else ' hreflang="uk"'
        if name in seen:  # друге фото того ж проєкту — лише назва-посилання
            new = f'<figcaption><a href="/proekty/{slug}"{hl}>{name}</a></figcaption>'
        else:
            seen.add(name)
            new = caption(name, lang)
        return m.group(0) if m.group(0).replace('\u00a0', ' ') == new else new  # нерозривні пробіли ставить chrome.py
    return CAP_RX.sub(cap, g)


def caption(name, lang, style=''):
    slug, uk, ru, en, st = P[name]
    desc = {'uk': uk, 'ru': ru, 'en': en}[lang]
    hl = '' if lang == 'uk' else ' hreflang="uk"'
    return f'<figcaption class="pc"{style}><a href="/proekty/{slug}"{hl}>{name}</a> — {desc} · {STATUS[lang][st]}</figcaption>'


# Фото з портфоліо до першого великого текстового блоку (.w.txt) топ-лендингів, де тексту багато, а зображень нема.
# сторінка: (фото, проєкт, alt)
PHOTO = {
    'remont-kvartyr-kyiv.html': ('img/p/1nLXvH7oBWQqht-900.webp', 'Tetris Hall', 'Вітальня з фітостіною й темними панелями — квартира Tetris Hall, реалізована CAS Development'),
    'ru/remont-kvartir-kiev.html': ('img/p/1nLXvH7oBWQqht-900.webp', 'Tetris Hall', 'Гостиная с фитостеной и тёмными панелями — квартира Tetris Hall, реализованная CAS Development'),
    'remont-pid-klyuch-kyiv.html': ('img/p/1AuTOsj6bQ1y2f-900.webp', 'Office Chicago', 'Зона відпочинку з фітостіною в офісі Office Chicago — реалізовано під ключ'),
    'ru/remont-pod-klyuch-kiev.html': ('img/p/1AuTOsj6bQ1y2f-900.webp', 'Office Chicago', 'Зона отдыха с фитостеной в офисе Office Chicago — реализовано под ключ'),
    'remont-novobudovy-kyiv.html': ('img/p/1nLXvH7oBWQqht-900.webp', 'Tetris Hall', 'Вітальня з фітостіною — квартира Tetris Hall: дизайн, ремонт і комплектація від CAS Development'),
    'ru/remont-v-novostroyke-kiev.html': ('img/p/1nLXvH7oBWQqht-900.webp', 'Tetris Hall', 'Гостиная с фитостеной — квартира Tetris Hall: дизайн, ремонт и комплектация от CAS Development'),
    'dyzain-interieru-kyiv.html': ('img/p/1jS6hUJuy_cM08-900.webp', 'Hodos Villa', 'Вітальня з каміном і люстрою — дизайн-проєкт вілли Hodos Villa у Києві'),
    'ru/dizayn-interera-kiev.html': ('img/p/1jS6hUJuy_cM08-900.webp', 'Hodos Villa', 'Гостиная с камином и люстрой — дизайн-проект виллы Hodos Villa в Киеве'),
    'budivnytstvo-budynkiv-kyiv.html': ('img/p/1g5cs3iVIpzLju-900.webp', 'House 150', 'Одноповерховий будинок із басейном і терасою — дизайн-проєкт House 150'),
    'ru/stroitelstvo-domov-kiev.html': ('img/p/1g5cs3iVIpzLju-900.webp', 'House 150', 'Одноэтажный дом с бассейном и террасой — дизайн-проект House 150'),
    'mebliuvannia-kvartyry-kyiv.html': ('img/p/1DL1BY7Tg6L5B5-900.webp', 'Edelweiss', 'Вітальня з кухнею, мʼякими меблями й мистецтвом — дизайн-проєкт Edelweiss'),
    'ru/meblirovka-kvartiry-kiev.html': ('img/p/1DL1BY7Tg6L5B5-900.webp', 'Edelweiss', 'Гостиная с кухней, мягкой мебелью и искусством — дизайн-проект Edelweiss'),
    'dyzainer-interieru-kyiv.html': ('img/p/1xskjqBvCXgXuL-900.webp', 'Hodos Villa', 'Їдальня з мармуром і люстрою — дизайн-проєкт вілли Hodos Villa'),
    'ru/dizayner-interera-kiev.html': ('img/p/1xskjqBvCXgXuL-900.webp', 'Hodos Villa', 'Столовая с мрамором и люстрой — дизайн-проект виллы Hodos Villa'),
}
PH_RX = re.compile(r'<figure class="tph".*?</figure>', re.S)


def photo(s, rel, lang):
    s = PH_RX.sub('', s)
    if rel not in PHOTO:
        return s
    src, name, alt = PHOTO[rel]
    m = re.search(r'<section><div class="w txt"><h2>.*?(?=</div></section>)', s, re.S)
    if not m:
        return s
    from PIL import Image
    w, h = Image.open(os.path.join(ROOT, src)).size
    fig = (f'<figure class="tph" style="margin:24px 0 0;max-width:760px"><img src="/{src}" loading="lazy" decoding="async" width="{w}" height="{h}" alt="{html.escape(alt)}"'
           ' style="display:block;width:100%;height:auto;aspect-ratio:3/2;object-fit:cover;border:1px solid var(--ln)">'
           + caption(name, lang, ' style="padding:8px 0 0;font-size:var(--fs-small);color:var(--mu)"') + '</figure>')
    return s[:m.end()] + fig + s[m.end():]


def apply(s, rel):
    rel = rel.replace(os.sep, '/')
    if rel in SKIP or NO.search(rel):
        return s
    m = re.search(r'<html[^>]*\blang="([a-z]{2})', s)
    lang = m.group(1) if m else 'uk'
    if lang not in STATUS:
        return s
    old = PH_RX.search(s)
    s2 = photo(s, rel, lang)
    if old and s2 != s and PH_RX.search(s2) and PH_RX.search(s2).group(0) == old.group(0).replace('\u00a0', ' '):
        s2 = s  # той самий блок (нерозривні пробіли від chrome.py)
    s = s2
    if 'class="gal"' not in s:
        return s
    return re.sub(r'<div class="gal">.*?</div>', lambda g: gallery(g.group(0), lang), s, flags=re.S)


if __name__ == '__main__':
    bad, n = [], 0
    for f in sorted(glob.glob(os.path.join(ROOT, '**/*.html'), recursive=True)):
        rel = os.path.relpath(f, ROOT).replace(os.sep, '/')
        if rel.startswith(('tools/', '.')):
            continue
        s = open(f, encoding='utf-8').read()
        new = apply(s, rel)
        if new != s:
            if '--check' in sys.argv: bad.append(rel)
            else: open(f, 'w', encoding='utf-8').write(new); n += 1
    if '--check' in sys.argv:
        print('\n'.join(bad) if bad else 'Підписи галерей: OK'); sys.exit(1 if bad else 0)
    print(f'Підписи галерей оновлено: {n} сторінок')
