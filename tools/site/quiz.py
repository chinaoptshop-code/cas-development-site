#!/usr/bin/env python3
"""Квіз-калькулятор «4 кроки → телефон» на вибраних сторінках (UI-kit /styleguide/#quiz).

  python3 tools/site/quiz.py            # поставити/оновити блок на сторінках PAGES (ідемпотентно)
  python3 tools/site/quiz.py --check    # лише перевірка (код 1, якщо щось не оновлено)

Блок — між <!--quiz--> і <!--/quiz-->, одразу перед формою заявки (<section id="zayavka">; на головній — перед
«Обговоримо ваш проєкт?»). У HTML — лише <script src="/assets/quiz.v1.js" data-quiz-obj data-quiz-svc defer> (бюджет лендингу 64 КБ):
секцію з заголовком ставить сам скрипт перед тегом, кроки й CSS (/assets/quiz.v1.css) — ліниво, коли блок близько до екрана.
Окремої відправки в квізу немає: телефон і відповіді йдуть через спільну form#of (/assets/lead-form.v1.js), тож на сторінці
лишається одна форма заявки. Тому блок ставимо лише на сторінки з form#of. Ставки орієнтира — лише з CLAUDE.md (див. quiz.v1.js).
Генератори (landing.py) квізу не знають: build-all.sh запускає цей скрипт після них, перед chrome.py.
"""
import html, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# сторінка: (обʼєкт, послуга) за замовчуванням — kv/dim/kom/of, dyz/rem/bud/meb/kl ('' — без підказки)
PAGES = {
    'index.html': ('', ''),
    'remont-kvartyr-kyiv.html': ('kv', 'rem'),
    'vartist-remontu-kvartyry-kyiv.html': ('kv', 'rem'),
    'budivnytstvo-budynkiv-kyiv.html': ('dim', 'bud'),
    'vartist-budivnytstva-budynku-kyiv.html': ('dim', 'bud'),
    'ru/index.html': ('', ''),
    'ru/remont-kvartir-kiev.html': ('kv', 'rem'),
    'ru/stoimost-remonta-kvartiry-kiev.html': ('kv', 'rem'),
    'ru/stroitelstvo-domov-kiev.html': ('dim', 'bud'),
    'ru/stoimost-stroitelstva-doma-kiev.html': ('dim', 'bud'),
    # офіси: тип обʼєкта «офіс» (ставка $350/м²), дизайн — $30/м² (мін. $2 500)
    'remont-ofisu-pid-klyuch-kyiv.html': ('of', 'rem'),
    'vartist-remontu-ofisu-kyiv.html': ('of', 'rem'),
    'dyzain-ofisu-kyiv.html': ('of', 'dyz'),
    'dyzain-ofisu-open-space-kyiv.html': ('of', 'dyz'),
    'ru/remont-ofisa-kiev.html': ('of', 'rem'),
    'ru/stoimost-remonta-ofisa-kiev.html': ('of', 'rem'),
    'ru/dizayn-ofisa-kiev.html': ('of', 'dyz'),
    'ru/dizayn-ofisa-open-space-kiev.html': ('of', 'dyz'),
    'en/office-renovation.html': ('of', 'rem'),
    'en/index.html': ('', ''),
    'en/turnkey-renovation.html': ('kv', 'rem'),
    'en/house-construction.html': ('dim', 'bud'),
}
T = {
    'uk': dict(h='Порахуйте орієнтовну вартість', p='4 короткі питання — і ви побачите орієнтир «від» за базовими ставками студії. '
               'Наприкінці залиште телефон: передзвонимо й уточнимо розрахунок.',
               ns='Калькулятор працює з увімкненим JavaScript. Залиште номер у формі заявки — порахуємо разом по телефону.'),
    'ru': dict(h='Рассчитайте ориентировочную стоимость', p='4 коротких вопроса — и вы увидите ориентир «от» по базовым ставкам студии. '
               'В конце оставьте телефон: перезвоним и уточним расчёт.',
               ns='Калькулятор работает с включённым JavaScript. Оставьте номер в форме заявки — посчитаем вместе по телефону.'),
    'en': dict(h='Get a quick cost estimate', p='Four short questions and you will see a “from” figure based on the studio’s base rates. '
               'Leave your phone number at the end and we will call you to refine it.',
               ns='The calculator needs JavaScript. Leave your number in the request form and we will work it out with you by phone.'),
}
RX = re.compile(r'\n?<!--quiz-->.*?<!--/quiz-->', re.S)
e = lambda s: html.escape(s, quote=True)


def block(lang, obj, svc):
    """Лише тег скрипта: секцію (заголовок, лід, заготовку .qz) вставляє сам quiz.v1.js перед цим тегом —
    у HTML лендингу ~0,1 КБ замість ~0,9 КБ (бюджет 64 КБ). Тексти — у словнику L у quiz.v1.js (uk, ru, en)."""
    return f'\n<!--quiz--><script src="/assets/quiz.v1.js" data-quiz-obj="{obj}" data-quiz-svc="{svc}" defer></script><!--/quiz-->'


def apply(s, rel):
    s = RX.sub('', s)
    if rel not in PAGES or not re.search(r'<form\b[^>]*\bid="of"', s):
        return s
    m = re.search(r'<html[^>]*\blang="([a-z]{2})', s)
    lang = m.group(1) if m and m.group(1) in T else 'uk'
    for mark in ('<section id="zayavka"', '<section class="home-next"'):
        k = s.find(mark)
        if k >= 0:
            return s[:k].rstrip('\n') + block(lang, *PAGES[rel]) + '\n' + s[k:]
    return s


def main():
    import chrome
    check = '--check' in sys.argv
    bad = []
    for rel in PAGES:
        p = os.path.join(ROOT, rel)
        if not os.path.exists(p):
            continue
        s = open(p, encoding='utf-8').read()
        n = apply(s, rel)
        if n != s:
            n = chrome.versions(n)
        if n != s and n.replace('\u00a0', ' ') == s.replace('\u00a0', ' '):
            n = s  # відрізняється лише нерозривними пробілами (їх ставить chrome.nbsp_prices) — не чіпаємо
        if n != s:
            bad.append(rel)
            if not check:
                open(p, 'w', encoding='utf-8').write(n)
    if check:
        print('\n'.join(bad) if bad else 'Квіз: OK')
        sys.exit(1 if bad else 0)
    print(f'Квіз: оновлено {len(bad)} з {len(PAGES)} сторінок')


if __name__ == '__main__':
    main()
