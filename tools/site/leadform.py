#!/usr/bin/env python3
"""Легка заявка на всіх сторінках: обовʼязковий лише телефон, імʼя — «необовʼязково», коментар згорнуто.

  python3 tools/site/leadform.py            # оновити всі сторінки (форми, швидкі заявки, місця для «номер → передзвонимо»)
  python3 tools/site/leadform.py file ...   # лише вказані файли (шляхи від кореня сайту)
  python3 tools/site/leadform.py --check    # лише перевірка (код 1, якщо щось не оновлено)

Що робить apply() (ідемпотентно; генератори — landing.py — викликають її перед chrome.apply()):
  • form#of: поле телефону — першим, type=tel, inputmode=tel, autocomplete=tel, підказка +380; «Імʼя (необовʼязково)»;
    площа й коментар — у згорнутому <details class="o-more"> «Додати коментар»; кнопка «дієслово + результат»
    («Отримати розрахунок»); під нею вигода в один рядок .o-note (факти CLAUDE.md: передзвонимо й порахуємо орієнтовну
    вартість, консультація по телефону безкоштовна — без «безкоштовного заміру» і «за 15 хвилин»), альтернатива
    «Або напишіть: Telegram · Viber · WhatsApp» (.lq-alt) і рядок довіри .lq-tr (150+ проєктів з 2016, гарантія 36 міс.,
    власні бригади, Google 4,8★ — лише ці факти). Обидва рядки — між <!--lqx--> і <!--/lqx-->.
  • Швидка заявка в один рядок (form.lq, між <!--lq--> і <!--/lq-->) — у hero лендингів послуг одразу після кнопок
    (.w.hero .btns), з рядком месенджерів; стандартна кнопка «Отримати кошторис» над нею стає «Подзвонити» (tel:, вторинна).
  • Місця для компактного «Номер → передзвонимо» (<div class="lq-slot" data-form="…">; саму форму будує
    /assets/lead-form.v1.js — у HTML лише ~60 байтів, бо лендинги на межі бюджету 64 КБ):
      quick-prices — після таблиці цін лендингу (<!--/cas:prices-->), quick-portfolio — після галереї «Наші проєкти»
      лендингу й блоку «Наші проєкти» на головній, quick-project — «Хочу так само» на сторінках /proekty/*,
      quick-blog-mid і quick-blog-end — у статтях блогу (у середині й у блоці CTA наприкінці), quick-services —
      /services після карток послуг, quick-portfolio — /portfolio після списку проєктів (.lq-wide — місця поза
      контейнером .w). data-form відрізняє місце в Clarity (lead_form) і в CRM (source …#місце).
  • Стилі — у /assets/site-chrome.v1.css (розділ «Легка заявка»); старий інлайн <style id="lead-ui"> прибираємо.
Надсилання, перевірку номера, маску, стани «надсилаємо…/дякуємо» і події Clarity (`lead_submit`, `lead_start`, `lead_msg`)
робить спільний /assets/lead-form.v1.js. Без поп-апів і exit-intent.
Сторінки інших агентів (SKIP) не чіпаємо; блог, Оздобу, кабінет і сторінки проєктів — без швидкої заявки в hero.
"""
import glob, html, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SKIP = {'privacy.html', 'terms.html'}
NO_QUICK = re.compile(r'(?:^|/)(?:blog|ozdoba|kabinet|proekty|styleguide|konfigurator)(?:/|\.html$)'
                      r'|(?:^|/)(?:pytannya|voprosy|faq|preguntas-frecuentes)\.html$')  # FAQ — довгі сторінки (бюджет 60 КБ)

T = {
    'uk': dict(name='Імʼя (необовʼязково)', phone='Телефон *', ph='+380 97 123 45 67', more='Додати коментар', send='Отримати розрахунок',
               note='Передзвонимо й порахуємо орієнтовну вартість. Консультація по телефону — безкоштовна.',
               alt='Або напишіть:', tr='150+ проєктів з 2016 · гарантія 36 міс. · власні бригади · Google\u00a04,8★',
               q='Залиште номер — ми передзвонимо', ok='Дякуємо! Перетелефонуємо найближчим часом.', mb='Залишити номер'),
    'ru': dict(name='Имя (необязательно)', phone='Телефон *', ph='+380 97 123 45 67', more='Добавить комментарий', send='Получить расчёт',
               note='Перезвоним и посчитаем ориентировочную стоимость. Консультация по телефону — бесплатная.',
               alt='Или напишите:', tr='150+ проектов с 2016 · гарантия 36 мес. · собственные бригады · Google\u00a04,8★',
               q='Оставьте номер — мы перезвоним', ok='Спасибо! Перезвоним в ближайшее время.', mb='Оставить номер'),
    'en': dict(name='Name (optional)', more='Add a comment', send='Get an estimate',
               note='We will call you back with a rough cost estimate. Phone consultation is free.',
               alt='Or message us:', tr='150+ projects since 2016 · 36-month warranty · in-house crews · Google\u00a04.8★',
               q='Leave your number — we will call you back', ok='Thank you! We will call you back shortly.', mb='Leave number'),
    'es': dict(name='Nombre (opcional)', more='Añadir un comentario', send='Recibir presupuesto',
               note='Le llamamos y le damos un coste orientativo. La consulta por teléfono es gratuita.',
               alt='O escríbanos:', tr='150+ proyectos desde 2016 · garantía de 36 meses · equipos propios · Google\u00a04,8★',
               q='Deje su número y le llamamos', ok='¡Gracias! Le llamaremos en breve.', mb='Dejar número'),
    'zh': dict(name='姓名（选填）', more='添加备注', send='获取估价',
               note='我们会回电并估算大致费用。电话咨询免费。', alt='或发消息：', tr='自2016年起150+个项目 · 36个月保修 · 自有施工队 · Google\u00a04.8★',
               q='留下电话，我们给您回电', ok='谢谢！我们会尽快给您回电。', mb='留下电话'),
    'pl': dict(name='Imię (opcjonalnie)', more='Dodaj komentarz', send='Otrzymaj wycenę',
               note='Oddzwonimy i podamy orientacyjny koszt. Konsultacja telefoniczna jest bezpłatna.',
               alt='Lub napisz:', tr='150+ projektów od 2016 · gwarancja 36 mies. · własne ekipy · Google\u00a04,8★',
               q='Zostaw numer — oddzwonimy', ok='Dziękujemy! Oddzwonimy wkrótce.', mb='Zostaw numer'),
    'de': dict(name='Name (optional)', more='Kommentar hinzufügen', send='Schätzung erhalten',
               note='Wir rufen zurück und nennen die ungefähren Kosten. Die telefonische Beratung ist kostenlos.',
               alt='Oder schreiben Sie:', tr='150+ Projekte seit 2016 · 36 Monate Garantie · eigene Teams · Google\u00a04,8★',
               q='Nummer hinterlassen — wir rufen zurück', ok='Danke! Wir rufen Sie in Kürze zurück.', mb='Rückruf'),
    'fr': dict(name='Nom (facultatif)', more='Ajouter un commentaire', send='Recevoir une estimation',
               note='Nous vous rappelons avec une estimation indicative. La consultation par téléphone est gratuite.',
               alt='Ou écrivez-nous :', tr='150+ projets depuis 2016 · garantie 36 mois · équipes internes · Google\u00a04,8★',
               q='Laissez votre numéro, nous vous rappelons', ok='Merci ! Nous vous rappelons rapidement.', mb='Être rappelé'),
    'ar': dict(name='الاسم (اختياري)', more='إضافة تعليق', send='احصل على تقدير',
               note='سنتصل بك ونقدّم تقديرًا تقريبيًا للتكلفة. الاستشارة الهاتفية مجانية.',
               alt='أو راسلنا:', tr='+150 مشروعًا منذ 2016 · ضمان 36 شهرًا · فرق عمل خاصة بنا · \u2066Google\u00a04.8★\u2069',
               q='اترك رقمك وسنتصل بك', ok='شكرًا! سنعاود الاتصال بك قريبًا.', mb='اترك رقمك'),
}
# месенджери — ті самі, що в шапці й нижній панелі (tools/site/chrome.py, MSG)
MSG = (('Telegram', 'https://t.me/+380978667755'), ('Viber', 'viber://chat?number=%2B380978667755'), ('WhatsApp', 'https://wa.me/380978667755'))

STYLE_RX = re.compile(r'<style id="lead-ui">.*?</style>\n?', re.S)  # старий інлайн-CSS: тепер у /assets/site-chrome.v1.css
QUICK_RX = re.compile(r'\n?[ \t]*<!--lq-->.*?<!--/lq-->', re.S)
X_RX = re.compile(r'<!--lqx-->.*?<!--/lqx-->', re.S)
# слоти, які ставить цей скрипт; quick-build-anim — у блоці «Будинок з нуля» (tools/site/buildanim.py), його не чіпаємо
SLOT_RX = re.compile(r'<div class="lq-slot[^"]*"(?![^>]*data-form="quick-build-anim")[^>]*></div>')
SCRIPT = '<script src="/assets/lead-form.v1.js" defer></script>'

e = lambda s: html.escape(s, quote=False)
a = lambda s: html.escape(s, quote=True)


def _keep(old, new):
    """Не перезаписувати текст, який відрізняється лише нерозривними пробілами (їх ставить chrome.nbsp_prices)."""
    return old if old.replace(' ', ' ') == new.replace(' ', ' ') else new


def lang_of(s):
    m = re.search(r'<html[^>]*\blang="([a-zA-Z]{2})', s)
    return (m.group(1).lower() if m else 'uk') if (m and m.group(1).lower() in T) else 'uk'


def extras(lang, trust=True):
    """Рядок «Або напишіть: Telegram · Viber · WhatsApp» і (для повної форми) рядок довіри."""
    t = T[lang]
    links = ' · '.join(f'<a href="{u}"' + (' target="_blank" rel="noopener"' if u.startswith('http') else '') + f'>{n}</a>' for n, u in MSG)
    x = f'<p class="lq-alt">{e(t["alt"])} {links}</p>'
    if trust:
        x += f'<p class="lq-tr">{e(t["tr"])}</p>'
    return f'<!--lqx-->{x}<!--/lqx-->'


def _wrapper(s, pos, lo, hi):
    """Найближчий елемент-обгортка (<div>/<p>) навколо позиції pos у межах [lo, hi): (start, end) або None."""
    stack = []
    for m in re.finditer(r'<(/?)(div|p)\b[^>]*>', s[lo:pos]):
        if m.group(1):
            if stack: stack.pop()
        else:
            stack.append(lo + m.start())
    if not stack:
        return None
    start, depth = stack[-1], 0
    for m in re.finditer(r'<(/?)(div|p)\b[^>]*>', s[start:hi]):
        depth += -1 if m.group(1) else 1
        if depth == 0:
            return start, start + m.end()
    return None


def _close(s, start, tag='div'):
    """Кінець елемента <tag>, що починається в позиції start (індекс одразу після закривального тега) або -1."""
    depth = 0
    for m in re.finditer(r'<(/?)' + tag + r'\b[^>]*>', s[start:]):
        depth += -1 if m.group(1) else 1
        if depth == 0:
            return start + m.end()
    return -1


def _field(s, fid, lo, hi):
    m = re.compile(r'<(?:label[^>]*\bfor|input[^>]*\bid|textarea[^>]*\bid|select[^>]*\bid)="' + fid + '"').search(s, lo, hi)
    return _wrapper(s, m.start(), lo, hi) if m else None


def upgrade_form(s, lang):
    m = re.search(r'<form\b[^>]*\bid="of"[^>]*>', s)
    if not m:
        return s
    lo = m.start()
    hi = s.find('</form>', lo)
    if hi < 0:
        return s
    t = T[lang]
    f = s[lo:hi]
    tag = m.group(0)
    if 'data-lf=' not in tag:
        f = f.replace(tag, tag[:-1].rstrip() + ' data-lf="2">', 1)
    # підписи
    f = re.sub(r'(<label[^>]*\bfor="oName"[^>]*>)([^<]*)(</label>)', lambda x: x.group(1) + _keep(x.group(2), e(t['name'])) + x.group(3), f, count=1)
    if t.get('phone'):
        f = re.sub(r'(<label[^>]*\bfor="oPhone"[^>]*>)([^<]*)(</label>)', lambda x: x.group(1) + _keep(x.group(2), e(t['phone'])) + x.group(3), f, count=1)
    # поле телефону: type=tel + inputmode=tel (цифрова клавіатура на iPhone), autocomplete=tel (підставляє номер), підказка +380 (uk/ru)
    def ph(x):
        tg = x.group(0)
        if 'inputmode=' not in tg: tg = tg.replace(' id="oPhone"', ' id="oPhone" inputmode="tel"', 1)
        if not re.search(r'\stype=', tg): tg = tg.replace(' id="oPhone"', ' id="oPhone" type="tel"', 1)
        if 'autocomplete=' not in tg: tg = tg.replace(' id="oPhone"', ' id="oPhone" autocomplete="tel"', 1)
        if t.get('ph'):
            tg = re.sub(r'\splaceholder="[^"]*"', '', tg)
            tg = tg.replace(' id="oPhone"', f' id="oPhone" placeholder="{a(t["ph"])}"', 1)
        return tg
    f = re.sub(r'<input[^>]*\bid="oPhone"[^>]*>', ph, f, count=1)
    f = re.sub(r'(<input[^>]*\bid="oName"[^>]*?)\s+required(?:="[^"]*")?', r'\1', f, count=1)
    # кнопка
    f = re.sub(r'(<button[^>]*\bid="oBtn"[^>]*>)(.*?)(</button>)', lambda x: x.group(1) + _keep(x.group(2), e(t['send'])) + x.group(3), f, count=1, flags=re.S)
    s = s[:lo] + f + s[hi:]
    hi = s.find('</form>', lo)
    # телефон — першим (якщо поля імені й телефону — сусіди)
    wn, wp = _field(s, 'oName', lo, hi), _field(s, 'oPhone', lo, hi)
    if wn and wp and wn[1] <= wp[0] and not s[wn[1]:wp[0]].strip():
        gap = s[wn[1]:wp[0]]
        s = s[:wn[0]] + s[wp[0]:wp[1]] + gap + s[wn[0]:wn[1]] + s[wp[1]:]
        hi = s.find('</form>', lo)
    # площа й коментар — у згорнутий блок «Додати коментар»
    if 'class="o-more"' not in s[lo:hi]:
        ws = [w for w in (_field(s, 'oService', lo, hi), _field(s, 'oArea', lo, hi), _field(s, 'oMsg', lo, hi)) if w]
        ws = [w for w in ws if not re.search(r'id="o(?:Phone|Name)"', s[w[0]:w[1]])]
        ws.sort()
        # лише суміжні блоки, що завершуються коментарем
        grp = []
        for w in ws:
            if grp and s[grp[-1][1]:w[0]].strip():
                grp = []
            grp.append(w)
        if grp and re.search(r'id="oMsg"', s[grp[-1][0]:grp[-1][1]]):
            st, en = grp[0][0], grp[-1][1]
            ind = re.search(r'[ \t]*$', s[:st]).group(0)
            s = (s[:st] + f'<details class="o-more"><summary>{e(t["more"])}</summary>\n{ind}  ' + s[st:en].replace('\n', '\n  ')
                 + f'\n{ind}</details>' + s[en:])
            hi = s.find('</form>', lo)
    else:
        s = s[:lo] + re.sub(r'(<details class="o-more"><summary>)([^<]*)', lambda x: x.group(1) + _keep(x.group(2), e(t['more'])), s[lo:hi], count=1) + s[hi:]
        hi = s.find('</form>', lo)
    # вигода під кнопкою, месенджери як альтернатива й рядок довіри
    f = s[lo:hi]
    old = X_RX.search(f)
    f = X_RX.sub('', f)
    if 'class="o-note"' in f:
        f = re.sub(r'(<p class="o-note">)([^<]*)', lambda x: x.group(1) + _keep(x.group(2), e(t['note'])), f, count=1)
    else:
        f = re.sub(r'(<button[^>]*\bid="oBtn"[^>]*>.*?</button>)', lambda x: x.group(1) + f'<p class="o-note">{e(t["note"])}</p>', f, count=1, flags=re.S)
    x = extras(lang)
    if old: x = _keep(old.group(0), x).replace('Google ', 'Google\u00a0')
    f = re.sub(r'(<p class="o-note">[^<]*</p>)', lambda m: m.group(1) + x, f, count=1)
    return s[:lo] + f + s[hi:]


def quick_html(lang, service, source, form='quick-hero', idp='lq'):
    t = T[lang]
    return (f'<!--lq--><form class="lq" id="lead" data-form="{form}" data-service="{a(service)}" data-source="{a(source)}" novalidate>'
            f'<label class="lq-l" for="{idp}P">{e(t["q"])}</label>'
            f'<div class="lq-r"><input id="{idp}P" type="tel" inputmode="tel" autocomplete="tel" placeholder="{a(t.get("ph", "+380 97 123 45 67"))}" aria-describedby="{idp}E">'
            f'<button class="lq-b" type="submit">{e(t["send"])}</button></div>'
            f'<div class="lq-e" id="{idp}E" role="alert"></div><p class="o-note">{e(t["note"])}</p>{extras(lang, trust=False)}</form>'
            f'<div class="lq-ok" role="status" tabindex="-1" hidden>{e(t["ok"])}</div><!--/lq-->')


TEL = 'tel:+380978667755'
CALL_UK = {'uk': ('Подзвонити', 'Отримати кошторис'), 'ru': ('Позвонить', 'Получить смету')}


def _call(lang):
    """(«Подзвонити», стандартний CTA «Отримати кошторис») мовою сторінки: uk/ru — тут, інші — tools/site/lang/<мова>.json (landing)."""
    if lang in CALL_UK:
        return CALL_UK[lang]
    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import i18n
        t = i18n.ui(lang)['landing']
        return t['call'], t['cta']
    except Exception:
        return None


def call_btns(b, lang):
    """Перший екран лендингу (Михайло 01.11.2026): кнопка «Отримати кошторис» над компактною формою → «Подзвонити» (tel:)
    у стилі вторинної кнопки; дубль із номером телефону (та сама дія) прибираємо. Свої CTA сторінок (напр. «Отримати зразок
    договору») не чіпаємо. Ідемпотентно."""
    c = _call(lang)
    if not c:
        return b
    call, cta = c
    # пробіли в CTA могли стати нерозривними (chrome.nbsp_prices)
    rx = re.compile(r'<a class="btn main" href="#zayavka">' + r'[  ]'.join(re.escape(w) for w in e(cta).split(' ')) + '</a>')
    if not rx.search(b):
        return b
    b = re.sub(r'\n?[ \t]*<a class="btn" href="' + re.escape(TEL) + r'">[^<]*</a>', '', b)
    return rx.sub(lambda m: f'<a class="btn" href="{TEL}">{e(call)}</a>', b, 1)


def add_quick(s, lang):
    """Швидка заявка в hero лендингу — одразу після першого рядка кнопок (.w.hero .btns)."""
    old = QUICK_RX.search(s)
    s = QUICK_RX.sub('', s)
    m = re.search(r'<form\b[^>]*\bid="of"[^>]*>', s)
    h = s.find('<div class="w hero">')
    if not m or h < 0:
        return s
    hero = _wrapper(s, h + len('<div class="w hero">'), h, len(s))
    b = s.find('<div class="btns">', h)
    if not hero or b < 0 or b > hero[1]:
        return s
    end = s.find('</div>', b)
    btns = call_btns(s[b:end], lang)
    s = s[:b] + btns + s[end:]
    end = b + len(btns)
    sv = (re.search(r'data-service="([^"]*)"', m.group(0)) or [None, ''])[1]
    src = (re.search(r'data-source="([^"]*)"', m.group(0)) or [None, ''])[1]
    sv = html.unescape(sv)
    q = quick_html(lang, sv, src)
    end += len('</div>')
    q = '\n  ' + q
    if old and _keep(old.group(0), q) == old.group(0):
        q = old.group(0)  # той самий блок (з нерозривними пробілами від chrome.py) — не чіпаємо
    return s[:end] + q + s[end:]


def _slot(form, service='', wide=False):  # wide — поза контейнером .w: власні поля й ширина (див. site-chrome.v1.css)
    return f'<div class="lq-slot{" lq-wide" if wide else ""}" data-form="{form}"' + (f' data-service="{a(service)}"' if service else '') + '></div>'


def add_slots(s, rel):
    """Місця для компактного «Номер → передзвонимо» (форму будує /assets/lead-form.v1.js). Ідемпотентно."""
    s = SLOT_RX.sub('', s)
    ins = []  # (позиція, html)
    if '<!--lq-->' in s:  # лендинг послуги: після таблиці цін і після галереї «Наші проєкти»
        k = s.find('<!--/cas:prices-->')
        j = s.rfind('</div></section>', 0, k) if k > 0 else -1
        if j > 0 and s.find('<!--cas:prices-->') < j:
            ins.append((j, _slot('quick-prices')))
        g = s.find('<div class="gal">')
        ge = _close(s, g) if g > 0 else -1
        if ge > 0:
            ins.append((ge, _slot('quick-portfolio')))
    if re.match(r'(?:[a-z]{2}/)?proekty/[^/]+\.html$', rel):  # сторінка проєкту: «Хочу так само» в «Замовити схожий проєкт»
        g = s.find('<div class="pg"')
        k = s.find('<section><div class="w">', g) if g > 0 else -1
        j = s.find('</div></section>', k) if k > 0 else -1
        h1 = re.search(r'<h1[^>]*>(.*?)</h1>', s, re.S)
        name = re.sub(r'<[^>]+>', '', h1.group(1)).strip() if h1 else ''
        if j > 0:
            ins.append((j, _slot('quick-project', ('Схожий проєкт: ' + html.unescape(name))[:100] if name else '')))
    if re.search(r'(?:^|/)blog/[^/]+\.html$', rel) and '<div class="cta">' in s:  # стаття: м'який CTA в середині й у кінці
        art = s.find('<article')
        cta = s.find('<div class="cta">', art)
        if art >= 0 and cta > art:
            h2 = [art + m.start() for m in re.finditer(r'<h2[\s>]', s[art:cta])]
            if len(h2) >= 4:
                ins.append((h2[len(h2) // 2], _slot('quick-blog-mid')))
            p = s.find('</p>', cta)
            if 0 < p < _close(s, cta):
                ins.append((p + 4, _slot('quick-blog-end')))
    if '<div class="sv-grid">' in s:  # /services: після карток послуг
        g = s.find('<div class="sv-grid">')
        ge = _close(s, g)
        if ge > 0:
            ins.append((ge, _slot('quick-services', wide=True)))
    if 'id="pfRows"' in s:  # /portfolio: після списку проєктів, перед картою
        k = s.find('<!--cas:map-->')  # блок карти перезбирає casmap.py — ставимо перед його маркером
        if k < 0: k = s.find('<section class="pmap"')
        if k > 0:
            ins.append((k, _slot('quick-portfolio', wide=True)))
    if '<section class="proj-covers">' in s:  # головна: після блоку «Наші проєкти»
        k = s.find('<section class="proj-covers">')
        j = s.find('</section>', k)
        if j > 0:
            ins.append((j, _slot('quick-portfolio')))
    for pos, x in sorted(ins, reverse=True):
        s = s[:pos] + x + s[pos:]
    if ins and 'lead-form.v1.js' not in s:
        k = s.rfind('</body>')
        if k > 0:
            s = s[:k] + SCRIPT + '\n' + s[k:]
    return s


def apply(s, rel):
    rel = rel.replace(os.sep, '/')
    if rel in SKIP:
        return s
    s = STYLE_RX.sub('', s)
    if 'id="of"' in s or '<!--lq-->' in s:
        lang = lang_of(s)
        s = upgrade_form(s, lang)
        if not NO_QUICK.search(rel):
            s = add_quick(s, lang)
        else:
            s = QUICK_RX.sub('', s)
    if not rel.startswith(('kabinet', 'ozdoba', 'styleguide', 'tury')):
        s = add_slots(s, rel)
    return s


def pages():
    out = []
    for f in sorted(glob.glob(os.path.join(ROOT, '**/*.html'), recursive=True)):
        rel = os.path.relpath(f, ROOT).replace(os.sep, '/')
        if rel.startswith(('tools/', 'node_modules/', '.')):
            continue
        out.append(rel)
    return out


if __name__ == '__main__':
    args = [x for x in sys.argv[1:] if not x.startswith('--')]
    files = args or pages()
    bad, n = [], 0
    for r in files:
        p = os.path.join(ROOT, r)
        s = open(p, encoding='utf-8').read()
        new = apply(s, r)
        if new != s:
            if '--check' in sys.argv:
                bad.append(r)
            else:
                open(p, 'w', encoding='utf-8').write(new); n += 1
    if '--check' in sys.argv:
        print('\n'.join(bad) if bad else 'Форми заявки: OK')
        sys.exit(1 if bad else 0)
    print(f'Форми заявки оновлено: {n} з {len(files)} сторінок')
