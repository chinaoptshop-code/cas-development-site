#!/usr/bin/env python3
"""Сторінка 404 для кожної мови: <тека мови>/404.html з кореневого 404.html (uk — шаблон, руками його тексти не міняємо тут).

  python3 tools/site/notfound.py

Cloudflare Pages для відсутньої адреси віддає найближчий 404.html угору по теках, тож /en/… → /en/404.html.
Тексти — нижче (T), посилання кнопок — з hreflang-кластерів (home/services/about/contact), шапка й футер — chrome.apply().
У build-all.sh — після chrome (той самий шаблон, ідемпотентно).
"""
import os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import i18n, chrome  # noqa: E402

T = {
    'ru': ('Страница не найдена', 'Такой страницы нет', 'Возможно, ссылка устарела. Начните с главной или посмотрите наши услуги.',
           ('На главную', 'Услуги', 'О студии', 'Контакты')),
    'en': ('Page not found', 'This page does not exist', 'The link may be out of date. Start from the home page or have a look at our services.',
           ('Home', 'Services', 'About', 'Contact')),
    'es': ('Página no encontrada', 'Esta página no existe', 'Puede que el enlace esté desactualizado. Empiece por la página principal o vea nuestros servicios.',
           ('Inicio', 'Servicios', 'Sobre el estudio', 'Contacto')),
    'pl': ('Nie znaleziono strony', 'Takiej strony nie ma', 'Link mógł się zdezaktualizować. Zacznij od strony głównej albo zobacz nasze usługi.',
           ('Strona główna', 'Usługi', 'O studiu', 'Kontakt')),
    'de': ('Seite nicht gefunden', 'Diese Seite gibt es nicht', 'Der Link ist möglicherweise veraltet. Beginnen Sie auf der Startseite oder sehen Sie sich unsere Leistungen an.',
           ('Startseite', 'Leistungen', 'Über uns', 'Kontakt')),
    'fr': ('Page introuvable', 'Cette page n’existe pas', 'Le lien est peut-être obsolète. Commencez par l’accueil ou découvrez nos services.',
           ('Accueil', 'Services', 'À propos', 'Contact')),
    'zh': ('页面未找到', '该页面不存在', '链接可能已失效。请从首页开始，或查看我们的服务。', ('首页', '服务', '关于我们', '联系我们')),
    'ar': ('الصفحة غير موجودة', 'هذه الصفحة غير موجودة', 'ربما أصبح الرابط قديمًا. ابدأ من الصفحة الرئيسية أو اطّلع على خدماتنا.',
           ('الرئيسية', 'الخدمات', 'عن الاستوديو', 'اتصل بنا')),
}
MAIN_RX = re.compile(r'<main id="main">.*?</main>', re.S)


def build(lang, tpl):
    m = i18n.meta(lang)
    title, h1, p, btn = T[lang]
    cl = i18n.clusters()
    hrefs = [cl[k].get(lang) or cl[k]['uk'] for k in ('home', 'services', 'about', 'contact')]
    links = '\n'.join(f'    <a class="btn{" main" if n == 0 else ""}" href="{h}">{b}</a>' for n, (h, b) in enumerate(zip(hrefs, btn)))
    main = (f'<main id="main"><div>\n  <div class="n">404</div>\n  <h1>{h1}</h1>\n  <p>{p}</p>\n'
            f'  <div class="btns">\n{links}\n  </div>\n</div></main>')
    s = re.sub(r'<html lang="[^"]*"[^>]*>', f'<html lang="{m["html"]}"' + (' dir="rtl"' if m.get('dir') == 'rtl' else '') + '>', tpl, count=1)
    s = re.sub(r'<title>[^<]*</title>', f'<title>{title} — CAS Development</title>', s, count=1)
    s = MAIN_RX.sub(lambda _: main, s, count=1)
    rel = m['prefix'] + '404.html'
    return rel, chrome.apply(s, rel)


def main():
    tpl = open(os.path.join(ROOT, '404.html'), encoding='utf-8').read()
    for lang in T:
        if lang not in i18n.LANGS:
            continue
        rel, s = build(lang, tpl)
        p = os.path.join(ROOT, rel)
        old = open(p, encoding='utf-8').read() if os.path.exists(p) else None
        if s != old:
            open(p, 'w', encoding='utf-8').write(s)
            print('404:', rel)


if __name__ == '__main__':
    main()
