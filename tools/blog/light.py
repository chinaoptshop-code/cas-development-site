"""«Легкий блог» (Михайло 02.11.2026): картка «Коротко» з іконками, зміст-плитки, розділи згорнуті до 2–3 рядків,
чеклісти з іконками, у технічних статтях — компактний «пиріг шарів» (дані — tools/site/buildanim_data.py).

Викликає tools/blog/build.py (render_body → body()). Текст лишається в DOM: згортання — атрибут data-c="t" на
<div class="bsc"> (ставить tools/site/ux.py; «Читати далі» — /assets/site-chrome.v1.js), без JS усе відкрито.
Стилі — /assets/blog-light.v1.css. Schema (Article, FAQPage) не змінюється. UI-kit — /styleguide/#blog-light.
"""
import html, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'tools/site'))
CSS = 'assets/blog-light.v1.css'
esc = lambda s: html.escape(s, quote=True)

T = {
    'uk': dict(k='Коротко', toc='Зміст', read='хв читання', parts='Розділів', q='питань', price='Ціни', svc='Послуга', min=1),
    'ru': dict(k='Коротко', toc='Содержание', read='мин чтения', parts='Разделов', q='вопросов', price='Цены', svc='Услуга'),
    'en': dict(k='In short', toc='Contents', read='min read', parts='Sections', q='questions', price='Prices', svc='Service'),
    'pl': dict(k='W skrócie', toc='Spis treści', read='min czytania', parts='Rozdziałów', q='pytań', price='Ceny', svc='Usługa'),
    'es': dict(k='En breve', toc='Contenido', read='min de lectura', parts='Secciones', q='preguntas', price='Precios', svc='Servicio'),
    'de': dict(k='Kurz gesagt', toc='Inhalt', read='Min. Lesezeit', parts='Abschnitte', q='Fragen', price='Preise', svc='Leistung'),
    'fr': dict(k='En bref', toc='Sommaire', read='min de lecture', parts='Sections', q='questions', price='Prix', svc='Service'),
    'zh': dict(k='要点', toc='目录', read='分钟阅读', parts='章节', q='问题', price='价格', svc='服务'),
    'ar': dict(k='باختصار', toc='المحتويات', read='دقائق للقراءة', parts='الأقسام', q='الأسئلة', price='الأسعار', svc='الخدمة'),
}
PRICE = re.compile(r'(?:від|от|from|od|desde|ab|dès|à partir de)\s+\$\s?\d+(?:[  ,]\d{3})*(?:\s?(?:за|per|/|za)\s?(?:м²|m²|сотку))?', re.I)
# технічні статті → пиріг шарів (ключ T[lang]['pie'] у buildanim_data); перший збіг у назві/slug
PIES = [(r'покрівл|кровл|дах|крыш|roof|dach', 'roof'), (r'фундамент|плит[аиу] фундам|foundation|fundament', 'fplate'),
        (r'газоблок|цегл|кирпич|стін|стен|wall|ścian', 'w_block'), (r'каркас|frame|szkielet', 'w_frame'), (r'брус|timber|bali', 'w_brus'),
        (r'\bванн|санвуз|санузл|bathroom|łazien|гідроізол|гидроизол', 'f_wet'), (r'стяжк|підлог|пол[уа]? |floor|podłog|паркет', 'f_floor'),
        (r'перекрит|перекрыт', 'slab'), (r'вікн|окна|window|okna', 'win'), (r'будинок|будівництв|дом|строит|house|budow', 'w_block')]


def _icon(i, ver):
    return f'<svg class="ic" aria-hidden="true"><use href="/assets/icons.v1.svg?v={ver}#{i}"/></svg>'


def _words(body):
    n = 0
    for node in body:
        if node[0] == 'p':
            n += len(node[1].split())
        elif node[0] in ('ul', 'ol'):
            n += sum(len(x.split()) for x in node[1])
    return n


def pie_key(a):
    if a['lang'] not in ('uk', 'ru', 'en', 'pl', 'es', 'de', 'fr', 'zh', 'ar'):
        return None
    src = (a['slug'] + ' ' + a['title']).lower()
    # лише технічні статті: будівництво, конструкції, «мокрі» зони, підлоги, покрівля
    if not re.search(r'будівництв|будинк|будинок|строительств|\bдом[аы]?\b|house|budow|\bванн|bathroom.renovation|łazienk|стяжк|покрівл|кровл|фундамент|пиріг|пирог|технолог|каркас|газоблок|брус|roof', src):
        return None
    for rx, k in PIES:
        if re.search(rx, src):
            return k
    return None


def pie_html(lang, key):
    import buildanim_data as BD
    t = BD.T.get(lang) or BD.T['en']
    title, rows = t['pie'][key]
    typ = t['ui'].get('typ', '')
    li = ''.join(f'<li style="--i:{n}"><b>{esc(a)}</b><span class="bp-t">{esc(th)}</span><span class="bp-n">{esc(no)}</span></li>' for n, (a, th, no) in enumerate(rows))
    return f'<figure class="bpie" aria-label="{esc(title)}"><figcaption>{esc(title)} <small>{esc(typ)}</small></figcaption><ol>{li}</ol></figure>'


def body(a, render_node, inline, ver):
    """HTML статті: «Коротко» → зміст-плитки → розділи (h2 + .bsc) з чеклістами; пиріг — у кінці розділу, де йдеться про тему."""
    lang, t = a['lang'], T.get(a['lang'], T['en'])
    secs, cur = [], None
    pre = []
    for node in a['body']:
        if node[0] == 'h2':
            cur = [node[1], []]; secs.append(cur)
        elif cur is None:
            pre.append(node)
        else:
            cur[1].append(node)
    pk = pie_key(a)
    pie_at = None
    if pk:
        words = {'roof': r'покрівл|кровл|дах|roof', 'fplate': r'фундамент|foundation', 'f_wet': r'гідроізол|гидроизол|waterproof|ванн',
                 'f_floor': r'стяжк|підлог|пол|floor', 'slab': r'перекрит|перекрыт|slab', 'win': r'вікн|окн|window'}.get(pk, r'стін|стен|wall|кладк|газоблок')
        pie_at = next((i for i, (h, nodes) in enumerate(secs) if re.search(words, (h + ' ' + ' '.join(str(n[1]) for n in nodes)).lower())), 0 if secs else None)
    o = [render_node(pre)] if pre else []
    # «Коротко»: час читання, ціни зі статті, розділи й питання, послуга
    mins = max(1, round(_words(a['body']) / 200))
    text = ' '.join(str(n[1]) for n in a['body'] if n[0] in ('p', 'ul', 'ol'))
    prices = []
    for m in PRICE.finditer(text):
        p = re.sub(r'\s+', ' ', m.group(0)).strip()
        if p.lower() not in [x.lower() for x in prices]:
            prices.append(p)
    rows = [('ti', f'≈ {mins} {t["read"]}'), ('st', f'{t["parts"]}: {len(secs)} · {t["q"]}: {len(a.get("faq", []))}')]
    if prices:
        rows.insert(1, ('pr', f'{t["price"]}: ' + ', '.join(prices[:3])))
    su, sl = a['service']
    k = (f'<aside class="bk" aria-label="{esc(t["k"])}"><p class="bk-h">{esc(t["k"])}</p><ul>'
         + ''.join(f'<li>{_icon(i, ver)}<span>{esc(x)}</span></li>' for i, x in rows)
         + f'<li>{_icon("ho", ver)}<span>{esc(t["svc"])}: <a href="{su}">{esc(sl)}</a></span></li></ul></aside>')
    o.append(k)
    if len(secs) >= 3:
        o.append(f'<nav class="btoc" aria-label="{esc(t["toc"])}">' + ''.join(
            f'<a href="#s{i + 1}"><b>{i + 1:02d}</b><span>{esc(h)}</span></a>' for i, (h, _) in enumerate(secs)) + '</nav>')
    for i, (h, nodes) in enumerate(secs):
        inner = render_node(nodes)
        inner = re.sub(r'<ul>', '<ul class="chk">', inner)  # чеклісти з іконками (CSS ::before)
        if i == pie_at:
            inner += '\n' + pie_html(lang, pk)
        o.append(f'<section class="bsec" id="s{i + 1}" aria-labelledby="s{i + 1}h"><h2 id="s{i + 1}h">{esc(h)}</h2><div class="bsc">{inner}</div></section>')
    return '\n'.join(o)
