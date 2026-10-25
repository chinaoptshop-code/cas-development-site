#!/usr/bin/env python3
"""Легка заявка на всіх сторінках: обовʼязковий лише телефон, імʼя — «необовʼязково», коментар згорнуто.

  python3 tools/site/leadform.py            # оновити всі сторінки з формою form#of
  python3 tools/site/leadform.py file ...   # лише вказані файли (шляхи від кореня сайту)
  python3 tools/site/leadform.py --check    # лише перевірка (код 1, якщо щось не оновлено)

Що робить apply() (ідемпотентно; генератори — landing.py — викликають її перед chrome.apply()):
  • form#of: поле телефону — першим, з підказкою +380 і inputmode=tel; «Імʼя (необовʼязково)»; площа й коментар —
    у згорнутому <details class="o-more"> «Додати коментар»; кнопка «Передзвоніть мені»; під нею примітка .o-note
    (факти CLAUDE.md: передзвонимо найближчим часом, консультація по телефону безкоштовна — без обіцянок «за 15 хвилин»).
  • Швидка заявка в один рядок (form.lq, між <!--lq--> і <!--/lq-->) — у hero лендингів послуг одразу після кнопок
    (.w.hero .btns); стилі — <style id="lead-ui"> у <head> (той самий CSS вставляє /assets/lead-form.v1.js, якщо його нема).
Надсилання, перевірку номера, маску і подію Clarity `lead_submit` робить спільний /assets/lead-form.v1.js.
Сторінки інших агентів (SKIP) не чіпаємо; блог, Оздобу, кабінет і сторінки проєктів — лише форма, без швидкої заявки.
"""
import glob, html, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SKIP = {'ru/o-nas.html', 'ru/uslugi.html', 'ru/kontakty.html', 'privacy.html', 'terms.html'}
NO_QUICK = re.compile(r'(?:^|/)(?:blog|ozdoba|kabinet|proekty|styleguide|konfigurator)(?:/|\.html$)'
                      r'|(?:^|/)(?:pytannya|voprosy|faq|preguntas-frecuentes)\.html$')  # FAQ — довгі сторінки (бюджет 60 КБ)

T = {
    'uk': dict(name='Імʼя (необовʼязково)', phone='Телефон *', ph='+380 97 123 45 67', more='Додати коментар', send='Передзвоніть мені',
               note='Перетелефонуємо найближчим часом. Консультація по телефону — безкоштовна.',
               q='Залиште номер — ми передзвонимо', ok='Дякуємо! Перетелефонуємо найближчим часом.', mb='Залишити номер'),
    'ru': dict(name='Имя (необязательно)', phone='Телефон *', ph='+380 97 123 45 67', more='Добавить комментарий', send='Перезвоните мне',
               note='Перезвоним в ближайшее время. Консультация по телефону — бесплатная.',
               q='Оставьте номер — мы перезвоним', ok='Спасибо! Перезвоним в ближайшее время.', mb='Оставить номер'),
    'en': dict(name='Name (optional)', more='Add a comment', send='Call me back',
               note='We will call you back shortly. Phone consultation is free.',
               q='Leave your number — we will call you back', ok='Thank you! We will call you back shortly.', mb='Leave number'),
    'es': dict(name='Nombre (opcional)', more='Añadir un comentario', send='Llámenme',
               note='Le llamaremos en breve. La consulta por teléfono es gratuita.',
               q='Deje su número y le llamamos', ok='¡Gracias! Le llamaremos en breve.', mb='Dejar número'),
    'zh': dict(name='姓名（选填）', more='添加备注', send='请回电给我',
               note='我们会尽快给您回电。电话咨询免费。', q='留下电话，我们给您回电', ok='谢谢！我们会尽快给您回电。', mb='留下电话'),
    'pl': dict(name='Imię (opcjonalnie)', more='Dodaj komentarz', send='Oddzwońcie do mnie',
               note='Oddzwonimy wkrótce. Konsultacja telefoniczna jest bezpłatna.',
               q='Zostaw numer — oddzwonimy', ok='Dziękujemy! Oddzwonimy wkrótce.', mb='Zostaw numer'),
    'de': dict(name='Name (optional)', more='Kommentar hinzufügen', send='Rückruf anfordern',
               note='Wir rufen Sie in Kürze zurück. Die telefonische Beratung ist kostenlos.',
               q='Nummer hinterlassen — wir rufen zurück', ok='Danke! Wir rufen Sie in Kürze zurück.', mb='Rückruf'),
    'fr': dict(name='Nom (facultatif)', more='Ajouter un commentaire', send='Rappelez-moi',
               note='Nous vous rappelons rapidement. La consultation par téléphone est gratuite.',
               q='Laissez votre numéro, nous vous rappelons', ok='Merci ! Nous vous rappelons rapidement.', mb='Être rappelé'),
    'ar': dict(name='الاسم (اختياري)', more='إضافة تعليق', send='اتصلوا بي',
               note='سنعاود الاتصال بك قريبًا. الاستشارة الهاتفية مجانية.', q='اترك رقمك وسنتصل بك', ok='شكرًا! سنعاود الاتصال بك قريبًا.', mb='اترك رقمك'),
}

# той самий CSS, що й у /assets/lead-form.v1.js (CSS там — запасний для сторінок без цього блоку)
CSS = ('.lq{display:block;margin:22px 0 0;max-width:540px}.lq-l{display:block;margin:0 0 8px;font-size:var(--fs-small,.8125rem);color:var(--mu,#8a837c)}'
       '.lq-r{display:flex;gap:8px;flex-wrap:wrap}.lq-r input{flex:1 1 160px;min-width:0;width:auto;box-sizing:border-box;min-height:48px;padding:12px 14px;font:inherit;font-size:16px;color:var(--tx,#ede8df);background:var(--bg2,rgba(255,255,255,.04));border:1px solid var(--ln,rgba(191,145,72,.35));border-radius:8px}'
       '.lq-b{flex:0 0 auto;min-height:48px;padding:12px 22px;border:1px solid var(--ac,#bf9148);border-radius:999px;background:var(--ac,#bf9148);color:#140f08;font-family:inherit;font-size:var(--fs-small,.8125rem);font-weight:600;line-height:1.2;cursor:pointer;white-space:nowrap}.lq-b:disabled{opacity:.6;cursor:wait}'
       '.lq-e{color:#e07a6a;font-size:var(--fs-small,.8125rem);margin-top:6px}.lq-e:empty{display:none}.lq .o-note{margin:8px 0 0}'
       '.o-note{color:var(--mu,#8a837c);font-size:var(--fs-small,.8125rem);line-height:1.5;margin:4px 0 0;max-width:52ch}'
       '.lq-ok{margin:22px 0 0;max-width:540px;padding:14px 18px;border:1px solid var(--ac,#bf9148);border-radius:8px;color:var(--tx,#ede8df)}'
       'details.o-more>summary{cursor:pointer;display:inline-block;list-style:none;padding:6px 0;color:var(--ac,#bf9148);font-size:var(--fs-small,.8125rem);font-weight:600}'
       'details.o-more>summary::-webkit-details-marker{display:none}details.o-more>summary::after,details.o-more[open]>summary::after{content:none!important;display:none!important}'
       'details.o-more>summary::before{content:"+ "}details.o-more[open]>summary::before{content:"− "}details.o-more>*+*{margin-top:12px}')
STYLE = f'<style id="lead-ui">{CSS}</style>'
STYLE_RX = re.compile(r'<style id="lead-ui">.*?</style>\n?', re.S)
QUICK_RX = re.compile(r'\n?[ \t]*<!--lq-->.*?<!--/lq-->', re.S)

e = lambda s: html.escape(s, quote=False)
a = lambda s: html.escape(s, quote=True)


def _keep(old, new):
    """Не перезаписувати текст, який відрізняється лише нерозривними пробілами (їх ставить chrome.nbsp_prices)."""
    return old if old.replace('\u00a0', ' ') == new.replace('\u00a0', ' ') else new


def lang_of(s):
    m = re.search(r'<html[^>]*\blang="([a-zA-Z]{2})', s)
    return (m.group(1).lower() if m else 'uk') if (m and m.group(1).lower() in T) else 'uk'


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
    # поле телефону: inputmode, підказка +380 (uk/ru), без placeholder «Імʼя» у полі імені
    def ph(x):
        tg = x.group(0)
        if 'inputmode=' not in tg: tg = tg.replace(' id="oPhone"', ' id="oPhone" inputmode="tel"', 1)
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
    # примітка під кнопкою
    f = s[lo:hi]
    if 'class="o-note"' in f:
        f = re.sub(r'(<p class="o-note">)([^<]*)', lambda x: x.group(1) + _keep(x.group(2), e(t['note'])), f, count=1)
    else:
        f = re.sub(r'(<button[^>]*\bid="oBtn"[^>]*>.*?</button>)', lambda x: x.group(1) + f'<p class="o-note">{e(t["note"])}</p>', f, count=1, flags=re.S)
    return s[:lo] + f + s[hi:]


def quick_html(lang, service, source, form='quick-hero', idp='lq'):
    t = T[lang]
    return (f'<!--lq--><form class="lq" id="lead" data-form="{form}" data-service="{a(service)}" data-source="{a(source)}" novalidate>'
            f'<label class="lq-l" for="{idp}P">{e(t["q"])}</label>'
            f'<div class="lq-r"><input id="{idp}P" type="tel" inputmode="tel" autocomplete="tel" placeholder="{a(t.get("ph", "+380 97 123 45 67"))}" aria-describedby="{idp}E">'
            f'<button class="lq-b" type="submit">{e(t["send"])}</button></div>'
            f'<div class="lq-e" id="{idp}E" role="alert"></div><p class="o-note">{e(t["note"])}</p></form>'
            f'<div class="lq-ok" role="status" tabindex="-1" hidden>{e(t["ok"])}</div><!--/lq-->')


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
    sv = (re.search(r'data-service="([^"]*)"', m.group(0)) or [None, ''])[1]
    src = (re.search(r'data-source="([^"]*)"', m.group(0)) or [None, ''])[1]
    sv = html.unescape(sv)
    q = quick_html(lang, sv, src)
    end += len('</div>')
    q = '\n  ' + q
    if old and _keep(old.group(0), q) == old.group(0):
        q = old.group(0)  # той самий блок (з нерозривними пробілами від chrome.py) — не чіпаємо
    return s[:end] + q + s[end:]


def style(s, need):
    s = STYLE_RX.sub('', s)
    if need:  # перед стилями шапки (chrome.py тримає їх останніми в <head>)
        k = s.find('<link rel="stylesheet" href="/assets/site-chrome.v1.css')
        h = s.find('</head>')
        k = k if 0 <= k < h else h
        s = s[:k] + STYLE + '\n' + s[k:]
    return s


def apply(s, rel):
    rel = rel.replace(os.sep, '/')
    if rel in SKIP or 'id="of"' not in s and '<!--lq-->' not in s:
        return s
    lang = lang_of(s)
    s = upgrade_form(s, lang)
    if not NO_QUICK.search(rel):
        s = add_quick(s, lang)
    else:
        s = QUICK_RX.sub('', s)
    return style(s, 'class="lq"' in s)


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
