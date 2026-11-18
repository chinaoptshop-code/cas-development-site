"""Кабінет клієнта v2: сторінки-вкладки /kabinet, /kabinet/obiekt (онлайн-контроль обʼєкта), /kabinet/zamovlennia, /kabinet/obrane,
/kabinet/proekty, /kabinet/profil.

Викликається з tools/shop/pages.py (shell і page() — звідти). Уся логіка — /assets/kabinet.v2.js, стилі — /assets/kabinet.v2.css,
вхід — /assets/account.v1.js. API — functions/api/account/*. Усі сторінки noindex (shell з pages.py).
"""
import glob, hashlib, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'tools/site'))
import flags  # noqa: E402  OZDOBA_PUBLIC (tools/site/flags.py)
import i18n  # noqa: E402  мови сайту (tools/site/i18n.py)

# Оздоба прихована (flags.OZDOBA_PUBLIC = False): вкладки «Замовлення»/«Обране» — hidden (kabinet.v2.js показує їх, лише якщо
# у клієнта є замовлення чи обране), у JS — data-oz="0": без промо Оздоби, знижки за обсягом і рекомендацій. True — усе як було.
OZ_TABS = ('orders', 'fav')


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
    crumbs = '<a href="/">Головна</a> / ' + ('<span>Кабінет</span>' if key == 'overview' else f'<a href="/kabinet">Кабінет</a> / <span>{tab[2]}</span>')
    cur = ' aria-current="page"'
    oz = flags.OZDOBA_PUBLIC

    def attrs(k):
        a = cur if k == key else ''
        if not oz and k in OZ_TABS:  # Оздоба прихована: вкладку показує JS, якщо є дані (поточну — одразу)
            a += f' data-kb-tab="{k}"' + ('' if k == key else ' hidden')
        return a
    nav = ''.join(
        f'<a href="/{slug}"{attrs(k)}><svg viewBox="0 0 24 24" aria-hidden="true">{I[ic]}</svg><span>{label}</span></a>'
        for k, slug, label, ic, _, _ in TABS)
    scripts = f'<script src="/assets/kabinet-i18n.v1.js?v={ver("assets/kabinet-i18n.v1.js")}" defer></script>\n' \
              f'<script src="/assets/account.v1.js?v={ver("assets/account.v1.js")}" defer></script>\n' \
              f'<script src="/assets/kabinet.v2.js?v={ver("assets/kabinet.v2.js")}" defer></script>'
    if key in ('projects', 'object'):
        scripts += f'\n<script src="/assets/lead-form.v1.js?v={ver("assets/lead-form.v1.js")}" defer></script>'
    return f"""<main class="acc kb" data-kb="{key}"{"" if oz else ' data-oz="0"'}>
  <div class="kb-top"><div class="crumbs">{crumbs}</div>{lang_switch()}</div>
  <h1 class="kb-h1">{tab[5]}</h1>
  <nav class="kb-tabs" aria-label="Розділи кабінету">{nav}</nav>
  <div id="kb" class="kb-body" aria-busy="true">{SKEL}</div>{LEAD if key == 'projects' else CAM_LEAD if key == 'object' else ''}
</main>
<div class="kb-toast" id="kb-toast" role="status" aria-live="polite"></div>
{scripts}
"""


# ── Мови кабінету клієнта (10 мов сайту, RTL — ar). URL один (/kabinet…), noindex; працівники й адмінка — українською. ──────────
# Тексти: ключ — український рядок (у JS — літерал з кирилицею в assets/kabinet.v2.js і account.v1.js, у HTML — текст сторінки,
# помилки API — ERR), переклад — tools/shop/kabinet-i18n/<мова>.json. Бракує перекладу → збірка падає. Результат — словник
# /assets/kabinet/l10n/<мова>.js (+ шапка й футер мови з chrome.py), його вантажить HEAD_JS лише для мови ≠ uk.
LANGS = i18n.enabled()
L10N_SRC = os.path.join(ROOT, 'tools/shop/kabinet-i18n')
L10N_OUT = os.path.join(ROOT, 'assets/kabinet/l10n')
# помилки API, які бачить клієнт (functions/api/auth/*, functions/api/account/*, functions/_lib.js, _rate.js) — показуємо мовою кабінету
ERR = ['Потрібно увійти', 'Очікуємо JSON', 'Некоректні дані', 'Некоректний запит', 'Завеликий запит', 'Забагато запитів — спробуйте за кілька хвилин',
       'Помилка сервера, спробуйте пізніше', 'Запит з іншого сайту відхилено', 'Розділ оновлюється — спробуйте за кілька хвилин',
       'Оберіть тип адреси', 'Адресу не знайдено', 'Телефон отримувача: 0XX XXX XX XX', 'Вкажіть імʼя', 'Перевірте email',
       'Телефон у форматі 0XX XXX XX XX або +380XXXXXXXXX', 'Перевірте номер: формат 0XX XXX XX XX або +380XXXXXXXXX',
       'Для ТОВ — ЄДРПОУ з 8 цифр', 'Для ФОП — ІПН з 10 цифр', 'ЄДРПОУ — 8 цифр, ІПН — 10 цифр', 'Невідома мова', 'Невідомий тип клієнта',
       'Замовлення не знайдено', 'Google не підтвердив вхід', 'Пошта Google не підтверджена', 'Токен Google застарів', 'Немає токена Google',
       'Токен не для цього сайту', 'Підпис Telegram не збігся', 'Сесія Telegram застаріла, увійдіть ще раз', 'Вхід через Telegram ще не налаштовано',
       'Вхід через Google ще не налаштовано', 'Вхід за номером ще не налаштовано', 'Забагато спроб входу. Спробуйте через годину.',
       'Забагато спроб входу. Спробуйте через годину або увійдіть через Telegram чи Google.', 'Запит на вхід не знайдено',
       'Почніть вхід у цьому браузері ще раз', 'Цей вхід уже підтверджено', 'Час на підтвердження минув — почніть вхід на сайті ще раз',
       'Номер не збігається з тим, що введено на сайті', 'Скасовано',
       'Етап не знайдено', 'Етап ще не готовий до погодження', 'Етап уже погоджено', 'Опишіть, що змінити']
# сторінки сайту, на які веде кабінет (демо онлайн-контролю, послуги) — мовою кабінету, якщо така сторінка є (кластери i18n)
LINKS = ['/onlain-kontrol', '/dyzain-interieru-kyiv', '/remont-kvartyr-kyiv', '/budivnytstvo-budynkiv-kyiv', '/remont-ofisu-pid-klyuch-kyiv',
         '/dyzain-restoranu-kafe-kyiv', '/dyzain-hotelu-kyiv']
SKIP_TXT = 'Перейти до змісту'


def _js_keys(rel):
    """Рядки з кирилицею в JS (крім коментарів і HTML-фрагментів працівників) — ключі словника."""
    s = open(os.path.join(ROOT, rel), encoding='utf-8').read()
    s = re.sub(r'/\*.*?\*/', '', s, flags=re.S)
    s = re.sub(r'(?m)^\s*//.*$', '', s)
    s = re.sub(r' // [^\n]*', '', s)
    out = []
    for m in re.finditer(r"'((?:[^'\\\n]|\\.)*)'", s):
        k = m.group(1)
        if re.search('[А-Яа-яІіЇїЄєʼ]', k) and '<' not in k:
            out.append(k)
    return out


def _html_keys(html):
    """Текст сторінки (вузли між тегами, placeholder/aria-label/title) — як їх шукає assets/kabinet-i18n.v1.js."""
    html = re.sub(r'<(script|style|svg)\b.*?</\1>', '', html, flags=re.S)
    out = [re.sub(r'\s+', ' ', t).strip() for t in re.findall(r'>([^<]+)<', html)]
    out += re.findall(r'\s(?:placeholder|aria-label|title)="([^"]+)"', html)
    return [k for k in out if re.search('[А-Яа-яІіЇїЄєʼ]', k)]


def _keys():
    k = _js_keys('assets/kabinet.v2.js') + _js_keys('assets/account.v1.js') + ERR + [SKIP_TXT, 'Кабінет клієнта']
    for t in TABS:
        k += _html_keys(body(t[0])) + [t[4]]
    seen, out = set(), []
    for x in k:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out


def _loc_url(path, lang):
    """Сторінка мовою кабінету: переклад з кластера i18n, інакше англійська (як на сайті), інакше українська."""
    if lang == 'uk':
        return path
    m = i18n.cluster_of(path) or {}
    return m.get(lang) or m.get('en') or path


def lang_switch():
    """Перемикач мов у кабінеті (select#kb-lang; міняє мову assets/kabinet-i18n.v1.js; без JS — форма з ?lang=)."""
    opts = ''.join(f'<option value="{l}" lang="{i18n.meta(l)["html"]}"{" selected" if l == "uk" else ""}>{i18n.meta(l)["name"]}</option>' for l in LANGS)
    return (f'<form class="kb-lng" method="get" action=""><label for="kb-lang" class="kb-sr">Мова кабінету</label>'
            f'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 3.9 5.6 3.9 9s-1.3 6.4-3.9 9c-2.6-2.6-3.9-5.6-3.9-9S9.4 5.6 12 3z"/></svg>'
            f'<select id="kb-lang" name="lang">{opts}</select><noscript><button class="btn ghost sm" type="submit">OK</button></noscript></form>')


def _chrome(lang):
    import chrome  # noqa: E402  (tools/site, шлях — з pages.py)
    alts = {l: f'/kabinet?lang={l}' for l in LANGS}
    h = chrome.header(lang, '/kabinet', alts, 'KBTOOLS', None)
    f = chrome.footer(lang, alts)
    fix = lambda x: chrome.kab_lang(chrome.local_cases('<body>' + x, lang), lang)[6:]
    return fix(h), fix(f)


def l10n():
    """assets/kabinet/l10n/<мова>.js з tools/shop/kabinet-i18n/<мова>.json; повертає {мова: версія} для HEAD_JS."""
    keys = _keys()
    os.makedirs(L10N_OUT, exist_ok=True)
    vers, bad = {}, []
    for lang in LANGS:
        if lang == 'uk':
            continue
        p = os.path.join(L10N_SRC, lang + '.json')
        src = json.load(open(p, encoding='utf-8')) if os.path.exists(p) else {}
        miss = [k for k in keys if not src.get(k)]
        if miss:
            bad.append(f'{lang}: бракує {len(miss)} — ' + ' | '.join(miss[:8]))
            continue
        h, f = _chrome(lang)
        u = {x: _loc_url(x, lang) for x in LINKS}
        data = {'l': lang, 't': {k: src[k] for k in keys}, 'u': {k: v for k, v in u.items() if v != k}, 'h': h, 'f': f}
        js = ('/* ЗГЕНЕРОВАНО tools/shop/kabinet_v2.py з tools/shop/kabinet-i18n/' + lang + '.json — руками не правити */\n'
              'window.CASKabL10n=' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
        out = os.path.join(L10N_OUT, lang + '.js')
        if not os.path.exists(out) or open(out, encoding='utf-8').read() != js:
            open(out, 'w', encoding='utf-8').write(js)
        vers[lang] = hashlib.sha256(js.encode()).hexdigest()[:8]
    if bad:
        sys.exit('Кабінет: немає перекладу рядків (tools/shop/kabinet-i18n/<мова>.json):\n  ' + '\n  '.join(bad))
    return vers


# Переходи між сторінками кабінету — без View Transitions (шапку мови підставляє скрипт; анімація шапки ламалась би).
HEAD_JS = """<script>(function(d,h){var L=__LANGS__,V=__VERS__,HL=__HTML__,l=null,s=0;
function ok(x){x=String(x||'').slice(0,2).toLowerCase();return L.indexOf(x)>=0?x:null}
try{l=ok(new URLSearchParams(location.search).get('lang'));if(l)s=1}catch(e){}
if(!l)try{l=ok(localStorage.getItem('cas-kab-lang'))}catch(e){}
if(!l){var m=d.cookie.match(/(?:^|; )cas_lang=([a-z]{2})/);l=ok(m&&m[1])}
if(!l&&d.referrer)try{var r=new URL(d.referrer);if(r.host===location.host&&!/^\\/kabinet/.test(r.pathname)){var p=r.pathname.match(/^\\/([a-z]{2})(?:\\/|$)/);l=p&&ok(p[1])||'uk';s=1}}catch(e){}
if(!l)(navigator.languages||[navigator.language]).some(function(x){l=ok(x);return l});
l=l||'uk';if(s){try{localStorage.setItem('cas-kab-lang',l)}catch(e){}d.cookie='cas_lang='+l+';path=/;max-age=31536000;samesite=lax'}
h.setAttribute('data-kb-lang',l);
if(l!=='uk'&&V[l]){h.lang=HL[l]||l;if(l==='ar')h.dir='rtl';h.classList.add('kb-l10n');setTimeout(function(){h.classList.remove('kb-l10n')},4000);
d.write('<script src="/assets/kabinet/l10n/'+l+'.js?v='+V[l]+'"><\\/script>')}
function vt(e){var t=e.viewTransition;if(t){t.ready.catch(function(){});t.finished.catch(function(){});t.skipTransition()}}
addEventListener('pageswap',vt);addEventListener('pagereveal',vt)})(document,document.documentElement)</script>
<style>.kb-l10n body>header,.kb-l10n main,.kb-l10n body>footer{visibility:hidden}</style>"""


def head_js(vers):
    return (HEAD_JS.replace('__LANGS__', json.dumps(LANGS)).replace('__VERS__', json.dumps(vers, sort_keys=True))
            .replace('__HTML__', json.dumps({l: i18n.meta(l)['html'] for l in LANGS if i18n.meta(l)['html'] != l})))


def build(shell, page):
    vers = l10n()
    css = f'<link rel="stylesheet" href="/assets/kabinet.v2.css?v={ver("assets/kabinet.v2.css")}">\n</head>'
    sh = shell.replace('</head>', head_js(vers) + '\n' + css, 1)
    for key, slug, _, _, title, _ in TABS:
        page(sh, title, body(key), slug)
