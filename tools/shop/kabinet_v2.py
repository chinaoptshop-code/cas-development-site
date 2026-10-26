"""Кабінет клієнта v2: сторінки-вкладки /kabinet, /kabinet/obiekt (онлайн-контроль обʼєкта), /kabinet/zamovlennia, /kabinet/obrane,
/kabinet/proekty, /kabinet/profil.

Викликається з tools/shop/pages.py (shell і page() — звідти). Уся логіка — /assets/kabinet.v2.js, стилі — /assets/kabinet.v2.css,
вхід — /assets/account.v1.js. API — functions/api/account/*. Усі сторінки noindex (shell з pages.py).
"""
import hashlib, os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def ver(rel):
    return hashlib.sha256(open(os.path.join(ROOT, rel), 'rb').read()).hexdigest()[:8]


I = {  # іконки вкладок (stroke)
    'home': '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-5h4v5"/>',
    'box': '<path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9"/>',
    'heart': '<path d="M12 20s-7-4.6-7-9.7A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7 3.3C19 15.4 12 20 12 20z"/>',
    'plan': '<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M3.5 10h17M9 10v10M14 15h6.5"/>',
    'user': '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
    'eye': '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
}

TABS = [  # (ключ, slug, підпис, іконка, title, h1)
    ('overview', 'kabinet', 'Огляд', 'home', 'Кабінет клієнта', 'Кабінет клієнта'),
    ('object', 'kabinet/obiekt', 'Обʼєкт', 'eye', 'Мій обʼєкт — онлайн-контроль', 'Мій обʼєкт: онлайн-контроль'),
    ('orders', 'kabinet/zamovlennia', 'Замовлення', 'box', 'Мої замовлення — кабінет', 'Мої замовлення'),
    ('fav', 'kabinet/obrane', 'Обране', 'heart', 'Обране — кабінет', 'Обране'),
    ('projects', 'kabinet/proekty', 'Проєкти', 'plan', 'Мої проєкти — кабінет', 'Мої проєкти'),
    ('profile', 'kabinet/profil', 'Профіль', 'user', 'Профіль і реквізити — кабінет', 'Профіль і реквізити'),
]

SKEL = '<div class="kb-skel" aria-hidden="true"><i></i><i></i><i></i><i></i></div><p class="kb-sr">Завантажуємо…</p>'

LEAD = """
  <section class="kb-lead" id="kb-lead" hidden aria-labelledby="kb-lead-h">
    <div class="kb-lead-txt">
      <h2 id="kb-lead-h">Обговорити проєкт</h2>
      <p>Дизайн інтерʼєру, ремонт під ключ, будівництво чи комплектація ресторану, готелю або офісу. Залиште номер — менеджер передзвонить і розкаже, з чого почати. Консультація по телефону — безкоштовна.</p>
    </div>
    <form id="of" class="kb-form" data-form="kabinet" data-service="Кабінет" data-source="kabinet" novalidate>
      <div class="field"><label for="oName">Імʼя</label><input id="oName" autocomplete="name"></div>
      <div class="field"><label for="oPhone">Телефон *</label><input id="oPhone" type="tel" autocomplete="tel" placeholder="097 123 45 67" aria-describedby="oErr"><div class="err" id="oErr" role="alert"></div></div>
      <div class="field"><label for="oArea">Площа, м²</label><input id="oArea" inputmode="numeric" placeholder="напр. 120"></div>
      <div class="field"><label for="oMsg">Що плануєте</label><input id="oMsg" placeholder="Обʼєкт, послуга, терміни"></div>
      <button class="btn" id="oBtn" type="submit">Обговорити проєкт</button>
    </form>
    <div class="kb-ok" id="oOk" role="status" tabindex="-1">Дякуємо! Менеджер звʼяжеться з вами найближчим часом.</div>
  </section>"""

# Вкладка «Обʼєкт»: заявка на камеру 24/7 (показує kabinet.v2.js, якщо для обʼєкта ще немає camera_url). Ціну не називаємо — за запитом.
CAM_LEAD = """
  <section class="kb-lead" id="kb-lead" hidden aria-labelledby="kb-lead-h">
    <div class="kb-lead-txt">
      <p class="kb-eyebrow">За доп. оплату</p>
      <h2 id="kb-lead-h">Підключити камеру 24/7</h2>
      <p>Камера на обʼєкті — дивіться, що відбувається, у будь-який момент з телефону чи компʼютера. Встановлюємо й налаштовуємо самі, посилання на трансляцію зʼявиться тут. Вартість — за запитом, залежить від обʼєкта.</p>
    </div>
    <form id="of" class="kb-form" data-form="kabinet" data-service="camera" data-source="kabinet/obiekt" novalidate>
      <div class="field"><label for="oName">Імʼя</label><input id="oName" autocomplete="name"></div>
      <div class="field"><label for="oPhone">Телефон *</label><input id="oPhone" type="tel" autocomplete="tel" placeholder="097 123 45 67" aria-describedby="oErr"><div class="err" id="oErr" role="alert"></div></div>
      <div class="field"><label for="oMsg">Обʼєкт</label><input id="oMsg" placeholder="Назва чи адреса обʼєкта"></div>
      <button class="btn" id="oBtn" type="submit">Запитати вартість камери</button>
    </form>
    <div class="kb-ok" id="oOk" role="status" tabindex="-1">Дякуємо! Менеджер звʼяжеться з вами щодо камери.</div>
  </section>"""


def body(key):
    tab = next(t for t in TABS if t[0] == key)
    crumbs = '<a href="/">Головна</a> / ' + ('Кабінет' if key == 'overview' else f'<a href="/kabinet">Кабінет</a> / {tab[2]}')
    cur = ' aria-current="page"'
    nav = ''.join(
        f'<a href="/{slug}"{cur if k == key else ""}><svg viewBox="0 0 24 24" aria-hidden="true">{I[ic]}</svg><span>{label}</span></a>'
        for k, slug, label, ic, _, _ in TABS)
    scripts = f'<script src="/assets/account.v1.js?v={ver("assets/account.v1.js")}" defer></script>\n' \
              f'<script src="/assets/kabinet.v2.js?v={ver("assets/kabinet.v2.js")}" defer></script>'
    if key in ('projects', 'object'):
        scripts += f'\n<script src="/assets/lead-form.v1.js?v={ver("assets/lead-form.v1.js")}" defer></script>'
    return f"""<main class="acc kb" data-kb="{key}">
  <div class="crumbs">{crumbs}</div>
  <h1 class="kb-h1">{tab[5]}</h1>
  <nav class="kb-tabs" aria-label="Розділи кабінету">{nav}</nav>
  <div id="kb" class="kb-body" aria-busy="true">{SKEL}</div>{LEAD if key == 'projects' else CAM_LEAD if key == 'object' else ''}
</main>
<div class="kb-toast" id="kb-toast" role="status" aria-live="polite"></div>
{scripts}
"""


def build(shell, page):
    css = f'<link rel="stylesheet" href="/assets/kabinet.v2.css?v={ver("assets/kabinet.v2.css")}">\n</head>'
    sh = shell.replace('</head>', css, 1)
    for key, slug, _, _, title, _ in TABS:
        page(sh, title, body(key), slug)
