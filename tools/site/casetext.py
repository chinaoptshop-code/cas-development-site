#!/usr/bin/env python3
"""Розділ «Про проєкт» на сторінках /proekty/<slug> (uk): Задача → Рішення → Результат + «Що зробили» + посилання на послугу/сцену.

  python3 tools/site/casetext.py            # оновити сторінки (ідемпотентно)
  python3 tools/site/casetext.py --check    # лише перевірка: код 1, якщо сторінка застаріла

Тексти — tools/site/casetext.json (лише факти зі сторінки проєкту й CLAUDE.md: без нових площ, дат, бюджетів, матеріалів,
брендів і історій клієнтів; «реалізовано» — лише там, де це стоїть у «Коротко про проєкт»).
Блок — між <!--case:txt--> і <!--/case:txt-->; першого разу замінює секцію «Про проєкт» сторінки, список «Що зробили» береться з неї.
Розмітка — <section><div class="w txt">: ux.py (chrome.apply) сам ставить data-c="t" — видно «Задачу» (перший абзац),
решта в DOM за «Читати далі». Стилі — кінець /assets/proekt.v1.css (.w.txt). Шапку/футер і атрибути ux ставить chrome.apply() тут же.
"""
import html, json, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import chrome  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, 'tools/site/casetext.json')
BLOCK = re.compile(r'<!--case:txt-->.*?<!--/case:txt-->', re.S)
ORIG = re.compile(r'<section><div class="w">\s*<h2>Про проєкт</h2>.*?</div></section>', re.S)
UL = re.compile(r'<ul(?: style="[^"]*")?>(?:(?!</ul>).)*</ul>', re.S)
e = html.escape


def block(c, ul):
    o = ['<!--case:txt--><section><div class="w txt">', '  <h2>Про проєкт</h2>',
         '  <h3>Задача</h3>', f'  <p>{e(c["task"], quote=False)}</p>',
         '  <h3>Рішення</h3>']
    o += [f'  <p>{e(x, quote=False)}</p>' for x in c['sol']]
    o += ['  <h3>Результат</h3>', f'  <p>{e(c["res"], quote=False)}</p>'] + ([f'  <p>{e(c["how"], quote=False)}</p>'] if c.get('how') else []) + [
          '  <h3>Що зробили</h3>', '  ' + re.sub(r'^<ul style="[^"]*">', '<ul>', ul)]
    links = ' · '.join(f'<a href="{e(h)}">{e(t, quote=False)}</a>' for h, t in c['links'])
    o.append(f'  <p>Детальніше: {links}</p>')
    o.append('</div></section><!--/case:txt-->')
    return '\n'.join(o)


def render(s, c, slug):
    m = BLOCK.search(s) or ORIG.search(s)
    if not m:
        raise SystemExit(f'proekty/{slug}.html: немає секції «Про проєкт»')
    ul = UL.search(m.group(0))
    if not ul:
        raise SystemExit(f'proekty/{slug}.html: немає списку «Що зробили»')
    return s[:m.start()] + block(c, ul.group(0)) + s[m.end():]


def main():
    check = '--check' in sys.argv
    data = {k: v for k, v in json.load(open(DATA, encoding='utf-8')).items() if not k.startswith('_')}
    stale = []
    for slug, c in sorted(data.items()):
        assert {'task', 'sol', 'res', 'links'} <= set(c) <= {'task', 'sol', 'res', 'how', 'links'}, slug
        f = os.path.join(ROOT, 'proekty', slug + '.html')
        s = open(f, encoding='utf-8').read()
        n = chrome.apply(render(s, c, slug), f'proekty/{slug}.html')
        if n != s:
            stale.append(slug)
            if not check:
                open(f, 'w', encoding='utf-8').write(n)
    if check and stale:
        print('casetext: застарілі', ', '.join(stale))
        sys.exit(1)
    print(f'casetext: {len(data)} сторінок' + (f', оновлено {len(stale)}' if stale and not check else ''))


if __name__ == '__main__':
    main()
