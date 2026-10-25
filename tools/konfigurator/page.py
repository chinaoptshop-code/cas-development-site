#!/usr/bin/env python3
"""Збирає /konfigurator (uk) і /ru/konfigurator (ru) з однієї розмітки + i18n-рядків.

  python3 tools/konfigurator/textures.py   # (разово) процедурні текстури → assets/konfigurator/tex/
  python3 tools/konfigurator/bake.py       # (після зміни масок/кадрів) фото, маски, scene.json
  python3 tools/konfigurator/page.py       # свотчі, assets/konfigurator/app.js + kf.css, konfigurator.html, ru/konfigurator.html

Матеріали, кімнати, стилі — config.json; логіка сцени й інтерфейсу — kf.js; стилі — kf.css.
Сторінки проходять chrome.apply() (шапка/футер) і hreflang з tools/site/lang/clusters-konfigurator.json.
Спільні файли підключаються з ?v=<хеш вмісту> (у /assets/* кеш на рік).
"""
import hashlib, html, json, os, re, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, 'assets', 'konfigurator')
sys.path.insert(0, os.path.join(ROOT, 'tools', 'site'))
import chrome, i18n  # noqa: E402

CFG = json.load(open(os.path.join(HERE, 'config.json'), encoding='utf-8'))
SCENE = json.load(open(os.path.join(HERE, 'scene.json'), encoding='utf-8'))
B = 'https://cas-develop.com'


# ── свотчі: «матеріальні кульки» в одному спрайті ─────────────────────────
def lin(c):
    c = np.asarray(c, float)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def hx(h):
    return lin([int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)])


def swatches(cell=96):
    ids = list(CFG['mat'])
    cols = 8
    rows = (len(ids) + cols - 1) // cols
    sheet = np.zeros((rows * cell, cols * cell, 3))
    y, x = (np.mgrid[0:cell, 0:cell] + 0.5) / cell * 2 - 1
    r2 = x * x + y * y
    z = np.sqrt(np.clip(1 - r2, 0, 1))
    lx, ly, lz = -0.45, -0.55, 0.7
    nl = np.clip(x * lx + y * ly + z * lz, 0, 1)
    shade = 0.42 + 0.75 * nl
    hv = np.clip(z * 0.5 + 0.5 * (x * lx + y * ly + z * lz), 0, 1)
    spec = np.clip(((x * lx + y * ly + z * lz) * 2 * z - lz), 0, 1)
    tex = {}
    for i, mid in enumerate(ids):
        m = CFG['mat'][mid]
        if m.get('t'):
            if m['t'] not in tex:
                tex[m['t']] = np.asarray(Image.open(os.path.join(OUT, 'tex', m['t'] + '.webp')).convert('RGB')).astype(float) / 255
            T = tex[m['t']]
            n = T.shape[0]
            k = {'planks': 0.5, 'herring': 0.7, 'marble': 0.35, 'boucle': 0.3, 'linen': 0.25}.get(m['t'], 0.45)
            crop = Image.fromarray((T[:int(n * k), :int(n * k)] * 255).astype(np.uint8)).resize((cell, cell), Image.LANCZOS)
            T = np.asarray(crop).astype(float) / 255
            R, G = T[..., :1], T[..., 1:2]
            if m['kind'] == 'tex':
                alb = (hx(m['c1']) * (1 - R) + hx(m['c2']) * R) * (0.7 + 0.6 * G)
            else:
                alb = hx(m['c']) * (0.62 + 0.76 * G)
        else:
            alb = np.broadcast_to(hx(m['c']), (cell, cell, 3))
        if m['kind'] == 'metal':
            env = 0.25 + 1.1 * hv ** 2.2
            col = alb * env[..., None] + (spec ** 18)[..., None] * 0.9
        else:
            col = alb * shade[..., None] + (spec ** 30)[..., None] * (0.15 + m.get('gl', 0) * 0.6)
        a = np.clip((1 - np.sqrt(r2)) * cell / 2 + 0.5, 0, 1)[..., None]
        col = srgb(col) * a + np.array([0.09, 0.08, 0.07]) * (1 - a)
        rr, cc = divmod(i, cols)
        sheet[rr * cell:(rr + 1) * cell, cc * cell:(cc + 1) * cell] = col
    Image.fromarray((np.clip(sheet, 0, 1) * 255 + .5).astype(np.uint8)).save(os.path.join(OUT, 'sw.webp'), 'WEBP', quality=84, method=6)
    return dict(ids=ids, cols=cols, rows=rows)


def h8(path):
    return hashlib.sha1(open(path, 'rb').read()).hexdigest()[:8]


# ── i18n ──────────────────────────────────────────────────────────────────
T = {
    'uk': dict(
        path='/konfigurator', file='konfigurator.html', home='/', home_t='Головна',
        title='Конфігуратор інтерʼєру онлайн — стилі й матеріали | CAS Development',
        desc='Змініть стіни, підлогу, тканини, камінь і метал у реальних інтерʼєрах CAS і побачте результат одразу: Japandi, Modern classic, Dark luxury, Warm minimal. Збережіть картинку й отримайте проєкт у цьому стилі.',
        crumb='Конфігуратор інтерʼєру', eyebrow='Конфігуратор CAS', h1='Спробуйте інтерʼєр на смак',
        lead='Перемикайте стіни, підлогу, тканини й камінь у реальних проєктах студії — світло й тіні фото зберігаються.',
        rooms='Кімната', tools='Інструменти', ba='До / після', eve='Вечір', share='Поділитися', save='Зберегти',
        ba_l='Порівняти до і після', eve_l='Вечірнє світло', share_l='Поділитися посиланням на цю конфігурацію', save_l='Зберегти картинку PNG',
        panel='Матеріали', zones='Зони інтерʼєру', sw='Варіанти матеріалу', styles='Готові стилі', choice='Ваш вибір',
        cta='Хочу проєкт у цьому стилі', reset='Скинути до оригіналу', grab='Розгорнути панель матеріалів',
        note='Візуалізація орієнтовна: кольори екрана відрізняються від живих зразків. Реальні матеріали підберемо на консультації.',
        hint='← проведіть, щоб роздивитися →', before='до', after='після', split='Межа до і після',
        canvas='Інтерактивна візуалізація: натисніть на предмет, щоб змінити його матеріал',
        dlg_t='Проєкт у цьому стилі', dlg_p='Залиште телефон — дизайнер звʼяжеться, обговорить вашу добірку й підбере реальні зразки. Консультація по телефону безкоштовна.',
        prev_alt='Ваша конфігурація інтерʼєру', close='Закрити', name='Імʼя', phone='Телефон *', msg='Ваш вибір і побажання', send='Надіслати заявку',
        ok_t='Заявку отримано', ok_p='Звʼяжемося найближчим часом і обговоримо проєкт у вашому стилі.',
        service='Конфігуратор інтерʼєру', source='cas-develop.com/konfigurator',
        how='Як це працює', steps=[('Оберіть кімнату', 'Вітальня, кухня чи спальня — це візуалізації наших реальних проєктів.'),
                                   ('Натисніть на предмет', 'Стіни, підлога, диван, фасади, камінь, метал — у кожної зони свої матеріали.'),
                                   ('Порівняйте', 'Готові стилі одним кліком, слайдер «до/після» і вечірнє світло.'),
                                   ('Отримайте проєкт', 'Надішліть добірку — дизайнер підбере справжні матеріали під ваш обʼєкт.')],
        next='Від картинки — до реального інтерʼєру',
        links=[('/dyzain-interieru-kyiv', 'Дизайн інтерʼєру', 'Дизайн-проєкт від $30/м² (мінімум $2 500): планування, 3D-візуалізації, креслення, підбір матеріалів.'),
               ('/remont-pid-klyuch-kyiv', 'Ремонт під ключ', 'Від $550/м² — роботи й чорнові матеріали; чистові матеріали, меблі й техніка — окремо, за кошторисом.'),
               ('/ozdoba', 'Оздоба — комплектація з Китаю', 'Меблі, світло й декор напряму з фабрик; виготовлення під замовлення (колір, розмір, матеріал), мінімум 10 шт кожної позиції.'),
               ('/kalkuliator-remontu', 'Калькулятор вартості', 'Порахуйте орієнтовний бюджет ремонту, дизайну й меблювання за нашими базовими ставками.')],
        more='Детальніше', noscript='Конфігуратор працює з увімкненим JavaScript. Напишіть нам — підберемо матеріали разом:',
        contact='/contact'),
    'ru': dict(
        path='/ru/konfigurator', file='ru/konfigurator.html', home='/ru/', home_t='Главная',
        title='Конфигуратор интерьера онлайн — стили и материалы | CAS Development',
        desc='Меняйте стены, пол, ткани, камень и металл в реальных интерьерах CAS и сразу видьте результат: Japandi, Modern classic, Dark luxury, Warm minimal. Сохраните картинку и получите проект в этом стиле.',
        crumb='Конфигуратор интерьера', eyebrow='Конфигуратор CAS', h1='Примерьте интерьер',
        lead='Переключайте стены, пол, ткани и камень в реальных проектах студии — свет и тени фото сохраняются.',
        rooms='Комната', tools='Инструменты', ba='До / после', eve='Вечер', share='Поделиться', save='Сохранить',
        ba_l='Сравнить до и после', eve_l='Вечерний свет', share_l='Поделиться ссылкой на эту конфигурацию', save_l='Сохранить картинку PNG',
        panel='Материалы', zones='Зоны интерьера', sw='Варианты материала', styles='Готовые стили', choice='Ваш выбор',
        cta='Хочу проект в этом стиле', reset='Сбросить к оригиналу', grab='Развернуть панель материалов',
        note='Визуализация ориентировочная: цвета экрана отличаются от живых образцов. Реальные материалы подберём на консультации.',
        hint='← проведите, чтобы рассмотреть →', before='до', after='после', split='Граница до и после',
        canvas='Интерактивная визуализация: нажмите на предмет, чтобы сменить его материал',
        dlg_t='Проект в этом стиле', dlg_p='Оставьте телефон — дизайнер свяжется, обсудит вашу подборку и подберёт реальные образцы. Консультация по телефону бесплатная.',
        prev_alt='Ваша конфигурация интерьера', close='Закрыть', name='Имя', phone='Телефон *', msg='Ваш выбор и пожелания', send='Отправить заявку',
        ok_t='Заявка получена', ok_p='Свяжемся в ближайшее время и обсудим проект в вашем стиле.',
        service='Конфигуратор интерьера', source='cas-develop.com/ru/konfigurator',
        how='Как это работает', steps=[('Выберите комнату', 'Гостиная, кухня или спальня — это визуализации наших реальных проектов.'),
                                      ('Нажмите на предмет', 'Стены, пол, диван, фасады, камень, металл — у каждой зоны свои материалы.'),
                                      ('Сравните', 'Готовые стили одним кликом, слайдер «до/после» и вечерний свет.'),
                                      ('Получите проект', 'Отправьте подборку — дизайнер подберёт настоящие материалы под ваш объект.')],
        next='От картинки — к реальному интерьеру',
        links=[('/ru/dizayn-interera-kiev', 'Дизайн интерьера', 'Дизайн-проект от $30/м² (минимум $2 500): планировка, 3D-визуализации, чертежи, подбор материалов.'),
               ('/ru/remont-pod-klyuch-kiev', 'Ремонт под ключ', 'От $550/м² — работы и черновые материалы; чистовые материалы, мебель и техника — отдельно, по смете.'),
               ('/ozdoba', 'Оздоба — комплектация из Китая', 'Мебель, свет и декор напрямую с фабрик; изготовление под заказ (цвет, размер, материал), минимум 10 шт каждой позиции.'),
               ('/ru/kalkulyator-remonta', 'Калькулятор стоимости', 'Посчитайте ориентировочный бюджет ремонта, дизайна и меблировки по нашим базовым ставкам.')],
        more='Подробнее', noscript='Конфигуратор работает с включённым JavaScript. Напишите нам — подберём материалы вместе:',
        contact='/contact'),
}

ICON = {
    'ba': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M5 7l-3 5 3 5M19 7l3 5-3 5"/></svg>',
    'eve': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
    'share': '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/></svg>',
    'save': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
}


def head_bits():
    """Шрифти (id=cas-fonts) і ui-polish (токени розмірів, фокус) — з наявної ручної сторінки, щоб не розходились."""
    s = open(os.path.join(ROOT, 'kalkuliator-remontu.html'), encoding='utf-8').read()
    fonts = re.search(r'<style id="cas-fonts">.*?</style>', s, re.S).group(0)
    polish = re.search(r'<!--ui-polish--><script>document\.documentElement\.classList\.add\(\'js\'\)</script><style id="ui-polish">.*?</style><!--/ui-polish-->', s, re.S).group(0)
    clarity = chrome.CLARITY
    return fonts, polish, clarity


BASE_CSS = (':root{--bg:#080709;--bg2:#100e0c;--tx:#EDE8DF;--mu:#938c84;--ac:#BF9148;--ln:rgba(191,145,72,.22)}'
            '*{box-sizing:border-box}html{scroll-behavior:smooth}'
            'body{margin:0;background:var(--bg);color:var(--tx);font-family:"Manrope","Manrope Fallback",system-ui,sans-serif;line-height:1.65;font-size:var(--fs-body)}'
            'a{color:inherit}.w{max-width:1080px;margin:0 auto;padding:0 16px}'
            '.crumbs{font-size:var(--fs-small);color:var(--mu);padding:14px 0 0}.crumbs a{text-decoration:none}'
            'h1,h2,h3{font-family:\'Cormorant Garamond\',\'Cormorant Fallback\',Georgia,serif;font-weight:300;line-height:1.15;margin:0}'
            '.btn{display:inline-block;text-decoration:none;border:1px solid var(--ac);padding:13px 22px;border-radius:999px;font-size:var(--fs-small);font-weight:600;cursor:pointer;background:none;color:var(--tx);font-family:inherit}'
            '.btn.main{background:var(--ac);color:#140f08}'
            'section{padding:56px 0;border-top:1px solid var(--ln)}section h2{font-size:var(--fs-h2);margin-bottom:24px}'
            '.card{border:1px solid var(--ln);padding:22px;background:var(--bg2)}.card h3{font-size:var(--fs-h3);margin-bottom:8px}'
            '.card p{color:var(--mu);font-size:var(--fs-body);margin:0}'
            'ol.steps{counter-reset:s;list-style:none;padding:0;margin:0;display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}'
            'ol.steps li{counter-increment:s;display:grid;grid-template-columns:48px 1fr;gap:12px;align-items:start;border-bottom:1px solid var(--ln);padding-bottom:12px}'
            'ol.steps li::before{content:counter(s,decimal-leading-zero);font-family:\'Cormorant Garamond\',\'Cormorant Fallback\',Georgia,serif;font-size:var(--fs-h3);color:var(--ac);line-height:1.15}'
            'ol.steps b{display:block}ol.steps span{color:var(--mu);font-size:var(--fs-body)}'
            'form{display:grid;gap:12px;max-width:520px}label{font-size:var(--fs-small);color:var(--mu)}'
            'input,textarea{width:100%;background:var(--bg);border:1px solid var(--ln);color:var(--tx);padding:13px 14px;font:inherit;border-radius:6px}'
            'input:focus,textarea:focus{outline:none;border-color:var(--ac)}'
            '.err{color:#e07a6a;font-size:var(--fs-small);min-height:1em}.ok{display:none;border:1px solid var(--ac);padding:28px;max-width:520px}'
            '.kf-note-p{color:var(--mu);font-size:var(--fs-small);max-width:70ch;margin:28px 0 0}')


def page(lang, v):
    t = T[lang]
    e = html.escape
    fonts, polish, clarity = head_bits()
    url = B + t['path']
    rooms = ''.join(f'<button type="button" data-room="{r}" aria-pressed="{"true" if r == "living" else "false"}">{e(c[lang])}</button>'
                    for r, c in CFG['rooms'].items())
    ld = {'@context': 'https://schema.org', '@graph': [
        {'@type': 'WebPage', 'name': t['crumb'], 'url': url, 'description': t['desc'], 'inLanguage': lang,
         'isPartOf': {'@type': 'WebSite', 'name': 'CAS Development', 'url': B + '/'}},
        {'@type': 'BreadcrumbList', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': t['home_t'], 'item': B + t['home']},
            {'@type': 'ListItem', 'position': 2, 'name': t['crumb'], 'item': url}]}]}
    alt = CFG['rooms']['living']['alt_' + lang]
    steps = ''.join(f'<li><div><b>{e(a)}</b><span>{e(b)}</span></div></li>' for a, b in t['steps'])
    links = ''.join(f'<a class="card" href="{h}"><h3>{e(n)}</h3><p>{e(p)}</p><span class="kf-more">{e(t["more"])} →</span></a>' for h, n, p in t['links'])
    tool = lambda k: (f'<button type="button" class="kf-tool" id="kf{ {"ba": "BA", "eve": "Eve", "share": "Share", "save": "Save"}[k] }" '
                      + ('aria-pressed="false" ' if k in ('ba', 'eve') else '') + f'aria-label="{e(t[k + "_l"])}" title="{e(t[k + "_l"])}">{ICON[k]}<span>{e(t[k])}</span></button>')
    return f'''<!DOCTYPE html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
{clarity}
<title>{e(t["title"])}</title>
<meta name="description" content="{e(t["desc"])}">
<link rel="canonical" href="{url}">
<meta property="og:type" content="website">
<meta property="og:title" content="{e(t["title"])}">
<meta property="og:description" content="{e(t["desc"])}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{B}/assets/konfigurator/og.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preload" href="/fonts/manrope-cyrillic.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/cormorant-cyrillic.woff2" as="font" type="font/woff2" crossorigin>
{fonts}
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False, separators=(",", ":"))}</script>
<style>{BASE_CSS}</style>
<link rel="stylesheet" href="/assets/konfigurator/kf.css?v={v["css"]}">
{polish}
</head>
<body>
<main id="main">
<div class="kf">
<div class="kf-stage" id="kfStage">
  <img id="kfPoster" src="/assets/konfigurator/living-900.webp?v={v["k"]}" srcset="/assets/konfigurator/living-900.webp?v={v["k"]} 900w, /assets/konfigurator/living-1800.webp?v={v["k"]} 1800w" sizes="100vw" width="900" height="506" alt="{e(alt)}" fetchpriority="high" decoding="async">
  <canvas id="kfCv" role="img" aria-label="{e(t["canvas"])}"></canvas>
  <div class="kf-shade" aria-hidden="true"></div>
  <div class="kf-head"><span class="kf-eyebrow">{e(t["eyebrow"])}</span><h1>{e(t["h1"])}</h1><p>{e(t["lead"])}</p></div>
  <div class="kf-bar">
    <div class="kf-rooms kf-glass" id="kfRooms" role="group" aria-label="{e(t["rooms"])}">{rooms}</div>
    <div class="kf-tools kf-glass" role="group" aria-label="{e(t["tools"])}">{tool("ba")}{tool("eve")}{tool("share")}{tool("save")}</div>
  </div>
  <button type="button" class="kf-split" id="kfSplit" role="slider" aria-label="{e(t["split"])}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50" hidden><span></span><em>{e(t["before"])}</em><strong>{e(t["after"])}</strong></button>
  <div class="kf-tip kf-glass" id="kfTip" hidden></div>
  <div class="kf-hint kf-glass" aria-hidden="true">{e(t["hint"])}</div>
  <p class="kf-nogl-msg kf-glass" id="kfNoGl" hidden></p>
  <noscript><p class="kf-nogl-msg kf-glass">{e(t["noscript"])} <a href="{t["contact"]}">{t["contact"]}</a></p></noscript>
  <aside class="kf-panel kf-glass" id="kfPanel" aria-label="{e(t["panel"])}">
    <button type="button" class="kf-grab" id="kfGrab" aria-expanded="false" aria-controls="kfScroll" aria-label="{e(t["grab"])}"><span></span></button>
    <div class="kf-scroll" id="kfScroll">
      <p class="kf-lbl">{e(t["panel"])} <b id="kfCur" aria-live="polite"></b></p>
      <div class="kf-zones" id="kfZones" role="tablist" aria-label="{e(t["zones"])}"></div>
      <div class="kf-sw" id="kfSw" role="tabpanel" aria-label="{e(t["sw"])}"></div>
      <h2 class="kf-h3">{e(t["styles"])}</h2>
      <div class="kf-ps" id="kfPresets" role="group" aria-label="{e(t["styles"])}"></div>
      <h2 class="kf-h3">{e(t["choice"])}: <span id="kfStyleName"></span></h2>
      <ul class="kf-sum" id="kfSum"></ul>
      <button type="button" class="btn main kf-cta" data-kf-form>{e(t["cta"])}</button>
      <button type="button" class="kf-reset" id="kfReset">{e(t["reset"])}</button>
      <p class="kf-note">{e(t["note"])}</p>
    </div>
  </aside>
</div>
</div>
<div class="w crumbs"><a href="{t["home"]}">{e(t["home_t"])}</a> / {e(t["crumb"])}</div>
<section><div class="w">
  <h2>{e(t["how"])}</h2>
  <ol class="steps">{steps}</ol>
</div></section>
<section><div class="w">
  <h2>{e(t["next"])}</h2>
  <div class="kf-links">{links}</div>
  <p class="kf-note-p">{e(t["note"])}</p>
  <p style="margin:24px 0 0"><button type="button" class="btn main" data-kf-form>{e(t["cta"])}</button></p>
</div></section>
<dialog class="kf-dlg" id="zayavka" aria-labelledby="kfDlgT">
  <button type="button" class="kf-dlg-x" id="kfDlgX" aria-label="{e(t["close"])}">×</button>
  <img class="kf-prev" id="kfPrev" width="640" height="360" alt="{e(t["prev_alt"])}" hidden>
  <div class="kf-dlg-in">
    <h2 id="kfDlgT">{e(t["dlg_t"])}</h2>
    <p class="kf-dlg-sub" id="kfDlgStyle"></p>
    <p style="margin:0;color:var(--mu);font-size:var(--fs-small)">{e(t["dlg_p"])}</p>
    <form id="of" data-form="landing" data-service="{e(t["service"])}" data-source="{t["source"]}" novalidate>
      <div><label for="oName">{e(t["name"])}</label><input id="oName" autocomplete="name"></div>
      <div><label for="oPhone">{e(t["phone"])}</label><input id="oPhone" aria-describedby="oErr" type="tel" autocomplete="tel" placeholder="097 123 45 67"><div class="err" id="oErr" role="alert"></div></div>
      <div><label for="oMsg">{e(t["msg"])}</label><textarea id="oMsg" rows="6"></textarea></div>
      <button class="btn main" id="oBtn" type="submit">{e(t["send"])}</button>
    </form>
    <div class="ok" id="oOk" role="status" tabindex="-1"><h3 style="font-size:var(--fs-h3);margin-bottom:8px">{e(t["ok_t"])}</h3><p style="color:var(--mu);margin:0">{e(t["ok_p"])}</p></div>
  </div>
</dialog>
<div class="kf-toast kf-glass" id="kfToast" role="status" aria-live="polite"></div>
</main>
<script src="/assets/lead-form.v1.js" defer></script>
<script src="/assets/konfigurator/app.js?v={v["js"]}" defer></script>
</body>
</html>
'''


def main():
    sw = swatches()
    kv = hashlib.sha1(b''.join(open(os.path.join(OUT, f), 'rb').read() for f in sorted(os.listdir(OUT))
                               if f.endswith('.webp')) + b''.join(open(os.path.join(OUT, 'tex', f), 'rb').read() for f in sorted(os.listdir(os.path.join(OUT, 'tex'))))).hexdigest()[:8]
    cfg = {k: CFG[k] for k in ('tex', 'mat', 'rooms', 'presets')}
    js = ('/* CAS Development — конфігуратор інтерʼєру. Згенеровано tools/konfigurator/page.py з config.json, scene.json і kf.js — не правити руками. */\n'
          'var KF=' + json.dumps({'cfg': cfg, 'scene': SCENE, 'sw': sw, 'v': kv}, ensure_ascii=False, separators=(',', ':')) + ';\n'
          + open(os.path.join(HERE, 'kf.js'), encoding='utf-8').read())
    open(os.path.join(OUT, 'app.js'), 'w', encoding='utf-8').write(js)
    open(os.path.join(OUT, 'kf.css'), 'w', encoding='utf-8').write(open(os.path.join(HERE, 'kf.css'), encoding='utf-8').read())
    v = {'js': h8(os.path.join(OUT, 'app.js')), 'css': h8(os.path.join(OUT, 'kf.css')), 'k': kv}
    members = {l: T[l]['path'] for l in T}
    for lang, t in T.items():
        s = page(lang, v)
        s = i18n.set_alternates(s, members)
        s = chrome.apply(s, t['file'])
        p = os.path.join(ROOT, t['file'])
        os.makedirs(os.path.dirname(p), exist_ok=True)
        open(p, 'w', encoding='utf-8').write(s)
        print(t['file'], len(s.encode()) // 1024, 'KB')
    print('app.js', os.path.getsize(os.path.join(OUT, 'app.js')) // 1024, 'KB; sw.webp', os.path.getsize(os.path.join(OUT, 'sw.webp')) // 1024, 'KB')


if __name__ == '__main__':
    main()
