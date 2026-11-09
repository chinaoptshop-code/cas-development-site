#!/usr/bin/env python3
"""Критичний CSS першого екрана (швидкість, 09.11.2026): /assets/site-chrome.v1.css (~107 КБ, 16 КБ br) більше не блокує рендер.

  <head>  … <link rel=stylesheet href="/assets/crit.v1.css?v=…">      — блокує рендер, лише правила першого екрана
  <body>  … <link rel="stylesheet" href="/assets/site-chrome.v1.css?v=…">  — повний файл останнім у body (chrome.full_css)

Повний файл містить і всі критичні правила (у тому самому порядку), тож після його завантаження каскад точно той самий,
що й раніше (критичні копії завжди програють своїм двійникам — вони раніше в документі). Defer-скрипти body чекають на повний
файл (він останній у body): як і раніше, бачать увесь CSS. Контент браузер малює з критичним — без FOUC і зсувів,
бо до критичного потрапляє кожне правило, що збігається з будь-яким елементом верхніх ~1.25 екрана (приховані — за
попереднім елементом), на вибірці сторінок усіх типів і мов, 9 ширин (tools/tests/critcss.mjs).

  python3 tools/site/critcss.py           # перезібрати assets/crit.v1.css з tools/site/critcss.json (робить і chrome.py при імпорті)
  python3 tools/site/critcss.py --check   # критичний файл актуальний
  python3 tools/site/critcss.py --rules   # JSON усіх правил (для tools/tests/critcss.mjs)
  node tools/tests/critcss.mjs            # оновити список селекторів tools/site/critcss.json (після нових блоків першого екрана)

Завжди в критичному: @font-face, @property, @view-transition, ::view-transition-*, @keyframes, на які посилаються критичні правила.
@media print — ні. Правила, яких немає в списку, діють після завантаження повного файлу.
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, 'assets/site-chrome.v1.css')
OUT = os.path.join(ROOT, 'assets/crit.v1.css')
LIST = os.path.join(ROOT, 'tools/site/critcss.json')
GROUP = ('media', 'supports', 'container', 'layer', 'document', 'scope', 'starting-style')
HEAD = '/* Критичний CSS першого екрана — ЗГЕНЕРОВАНО tools/site/critcss.py з site-chrome.v1.css, руками не правити */\n'


def _strip_comments(s):
    out, i, n = [], 0, len(s)
    while i < n:
        c = s[i]
        if c in '"\'':
            j = i + 1
            while j < n and s[j] != c:
                j += 2 if s[j] == '\\' else 1
            out.append(s[i:j + 1]); i = j + 1
        elif s.startswith('/*', i):
            j = s.find('*/', i + 2)
            i = n if j < 0 else j + 2
        else:
            out.append(c); i += 1
    return ''.join(out)


def parse(s):
    """[(kind, prelude, body_or_children)] — kind: 'rule' | 'group' | 'at' (@-блок без вкладених правил) | 'stmt'."""
    out, i, n = [], 0, len(s)
    while i < n:
        while i < n and s[i] in ' \t\r\n':
            i += 1
        if i >= n:
            break
        j, depth = i, 0
        while j < n:  # прелюдія до { або ;
            c = s[j]
            if c in '"\'':
                k = j + 1
                while k < n and s[k] != c:
                    k += 2 if s[k] == '\\' else 1
                j = k + 1; continue
            if c == '(':
                depth += 1
            elif c == ')':
                depth -= 1
            elif depth == 0 and c in '{;}':
                break
            j += 1
        pre = s[i:j].strip()
        if j >= n or s[j] == '}':
            i = j + 1; continue
        if s[j] == ';':
            if pre: out.append(('stmt', pre, ''))
            i = j + 1; continue
        k, d = j + 1, 1  # блок до парної }
        while k < n and d:
            c = s[k]
            if c in '"\'':
                m = k + 1
                while m < n and s[m] != c:
                    m += 2 if s[m] == '\\' else 1
                k = m + 1; continue
            if c == '{':
                d += 1
            elif c == '}':
                d -= 1
            k += 1
        body = s[j + 1:k - 1]
        if pre.startswith('@'):
            name = re.match(r'@([\w-]+)', pre).group(1).lower()
            if name in GROUP:
                out.append(('group', pre, parse(body)))
            else:
                out.append(('at', pre, body.strip()))
        else:
            out.append(('rule', pre, body.strip()))
        i = k
    return out


def norm(sel):
    return re.sub(r'\s+', ' ', sel).strip()


def rules(tree=None):
    """Усі селектори правил (норм. рядок списку селекторів) — у порядку файлу, без повторів."""
    tree = parse(_strip_comments(open(SRC, encoding='utf-8').read())) if tree is None else tree
    seen, out = set(), []

    def walk(t, ctx):
        for kind, pre, body in t:
            if kind == 'group':
                if not pre.lower().startswith('@media print'):
                    walk(body, ctx + [pre])
            elif kind == 'rule':
                k = norm(pre)
                if k not in seen:
                    seen.add(k); out.append(k)
    walk(tree, [])
    return out


ANIM_RX = re.compile(r'animation(?:-name)?\s*:([^;]+)', re.I)


def build(keep):
    src = _strip_comments(open(SRC, encoding='utf-8').read())
    tree = parse(src)
    always = lambda sel: '::view-transition' in sel
    used_anim = set()

    def sel_ok(pre):
        return norm(pre) in keep or always(pre)

    def collect(t):
        for kind, pre, body in t:
            if kind == 'group':
                if not pre.lower().startswith('@media print'): collect(body)
            elif kind == 'rule' and sel_ok(pre):
                for m in ANIM_RX.finditer(body):
                    used_anim.update(re.findall(r'[-\w]+', m.group(1)))
    collect(tree)

    def emit(t):
        parts = []
        for kind, pre, body in t:
            if kind == 'stmt':
                if not pre.lower().startswith(('@import', '@charset')): parts.append(pre + ';')
            elif kind == 'group':
                if pre.lower().startswith('@media print'): continue
                inner = emit(body)
                if inner: parts.append(pre + '{' + inner + '}')
            elif kind == 'at':
                name = re.match(r'@([\w-]+)', pre).group(1).lower()
                if name in ('font-face', 'property', 'view-transition', 'counter-style', 'font-feature-values'):
                    parts.append(pre + '{' + body + '}')
                elif name.endswith('keyframes'):
                    kn = pre.split(None, 1)[1].strip() if ' ' in pre else ''
                    if kn in used_anim: parts.append(pre + '{' + body + '}')
            elif kind == 'rule' and sel_ok(pre):
                parts.append(norm(pre) + '{' + body + '}')
        return '\n'.join(parts)
    return HEAD + emit(tree) + '\n'


def keep_list():
    try:
        return set(json.load(open(LIST, encoding='utf-8')))
    except FileNotFoundError:
        return set(rules())  # без списку — увесь файл (безпечно)


def write(check=False):
    css = build(keep_list())
    cur = open(OUT, encoding='utf-8').read() if os.path.exists(OUT) else ''
    if cur == css:
        return False
    if not check:
        open(OUT, 'w', encoding='utf-8').write(css)
    return True


if __name__ == '__main__':
    if '--rules' in sys.argv:
        print(json.dumps(rules(), ensure_ascii=False)); sys.exit(0)
    if '--check' in sys.argv:
        stale = write(check=True)
        print('Критичний CSS (assets/crit.v1.css): ' + ('застарів — python3 tools/site/critcss.py' if stale else 'OK'))
        sys.exit(1 if stale else 0)
    ch = write()
    print(('оновлено' if ch else 'без змін') + f': assets/crit.v1.css ({os.path.getsize(OUT)} Б)')
