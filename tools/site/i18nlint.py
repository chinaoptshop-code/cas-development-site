#!/usr/bin/env python3
"""Лінтер якості перекладів (видимий текст зібраних сторінок мов, 18.11.2026).

  python3 tools/site/i18nlint.py              # перевірка всіх мов (код 1 — є помилки)
  python3 tools/site/i18nlint.py --lang de    # одна мова
  python3 tools/site/i18nlint.py --grep 'regex' --lang en   # пошук у видимому тексті (для ручного аудиту)

Що ловить (у тексті, alt/title/aria-label/placeholder, meta description/og, JSON-даних сцен):
  1. кирилицю в мовах без кирилиці (en es pl de fr pt zh ar) — крім перемикача мов;
  2. латиницю в zh/ar поза білим списком (бренди, назви проєктів, месенджери, одиниці, коди матеріалів — «latin_ok»;
     власні назви-фрази: ЖК, забудовники, вулиці — «latin_names», прибираються цілком перед перевіркою);
  3. порушення глосарію tools/site/lang/glossary.json («avoid» — заборонені кальки/варіанти термінів);
  4. pt-BR-слова в pt (pt-PT) — частина глосарію;
  5. українські літери (і ї є ґ) у ru.
Глосарій — tools/site/lang/glossary.json: терміни uk → бажаний переклад кожної мови + «avoid» (регулярні вирази).
"""
import glob, json, os, re, sys
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HERE = os.path.dirname(os.path.abspath(__file__))
LANGS = ['en', 'es', 'pl', 'de', 'fr', 'pt', 'zh', 'ar', 'ru']
NO_CYR = {'en', 'es', 'pl', 'de', 'fr', 'pt', 'zh', 'ar'}
ATTRS = ('alt', 'title', 'aria-label', 'placeholder', 'data-xs')
META = ('description', 'twitter:title', 'twitter:description', 'og:title', 'og:description')
# перемикач мов (назви мов їхніми ж мовами) і шлях перекладу — не помилки
LANG_NAMES = re.compile(r'^(Українська|Русский|English|Español|Polski|Deutsch|Français|Português|中文|العربية)$')


class _Text(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out, self.skip, self.js = [], 0, False

    def handle_starttag(self, t, a):
        a = dict(a)
        if t in ('style', 'svg'):
            self.skip += 1
        elif t == 'script':
            if a.get('type') == 'application/json':
                self.js = True
            else:
                self.skip += 1
        if t == 'meta' and (a.get('name') in META or a.get('property') in META):
            self.out.append(('meta', a.get('content') or ''))
        if t == 'link' or t == 'a' and (a.get('hreflang') or a.get('lang')):
            return
        for k in ATTRS:
            if a.get(k):
                self.out.append((k, a[k]))

    def handle_endtag(self, t):
        if t in ('style', 'svg'):
            self.skip = max(0, self.skip - 1)
        elif t == 'script':
            if self.js:
                self.js = False
            else:
                self.skip = max(0, self.skip - 1)

    def handle_data(self, d):
        if self.js:
            try:
                o = json.loads(d)
            except ValueError:
                return
            st = [o]
            while st:
                x = st.pop()
                if isinstance(x, str):
                    if ' ' in x.strip():  # ключі/ідентифікатори (box, remont, kuula:…) — не текст
                        self.out.append(('json', x))
                elif isinstance(x, dict):
                    st += list(x.values())
                elif isinstance(x, list):
                    st += x
        elif not self.skip and d.strip():
            self.out.append(('text', ' '.join(d.split())))


def texts(path):
    p = _Text()
    p.feed(open(path, encoding='utf-8').read())
    return [(k, t) for k, t in p.out if t and not LANG_NAMES.match(t.strip())]


def pages(lang):
    fs = glob.glob(os.path.join(ROOT, lang, '**', '*.html'), recursive=True)
    return sorted(f for f in fs if '/404.html' not in f or True)


def glossary():
    return json.load(open(os.path.join(HERE, 'lang', 'glossary.json'), encoding='utf-8'))


UKR = re.compile(r'\w*[іїєґІЇЄҐ]\w*')
CYR = re.compile(r'[А-Яа-яЁёІіЇїЄєҐґ]{2,}')
LAT = re.compile(r'[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ0-9\-]*')
URLISH = re.compile(r'\S+@\S+|https?://\S+|\b[\w.-]+\.(?:com|ua|org|net|html|json|jpg|webp|png|svg)\S*|/[a-z]{2}/\S*|@[\w.]+|\{[a-z]\}')


def latin_ok(lang):
    g = glossary()
    return set(w.lower() for w in g['latin_ok']) | set(w.lower() for w in g.get('latin_ok_' + lang, []))


def latin_names():  # власні назви латиницею (ЖК, забудовники, вулиці): фраза цілком, довші — першими
    ns = sorted(glossary().get('latin_names', []), key=len, reverse=True)
    return re.compile(r'(?<![A-Za-z])(?:' + '|'.join(re.escape(n) for n in ns) + r')(?![A-Za-z])') if ns else None


def run(langs, out=print):  # out=None — лише рахувати
    g = glossary()
    errs = 0
    for lang in langs:
        rules = []
        for term in g['terms']:
            for rx in term.get('avoid', {}).get(lang, []):
                rules.append((term['uk'], re.compile(rx), term.get(lang, '')))
        okl = latin_ok(lang) if lang in ('zh', 'ar') else None
        names = latin_names() if okl is not None else None
        seen = {}
        for f in pages(lang):
            rel = os.path.relpath(f, ROOT)
            for kind, t in texts(f):
                bad = []
                if lang in NO_CYR:
                    bad += ['кирилиця: ' + w for w in CYR.findall(t)]
                if lang == 'ru':
                    bad += ['українська літера в ru: ' + w for w in UKR.findall(t)]
                if okl is not None:
                    tt = URLISH.sub(' ', names.sub(' ', t) if names else t)
                    bad += ['латиниця: ' + w for w in LAT.findall(tt) if w.lower().strip('-') not in okl and len(w) > 1 and not re.search(r'\d', w)]  # марки/класи (B04, D500, OSB-3) — не текст
                for uk, rx, use in rules:
                    for m in rx.finditer(t):
                        bad.append(f'глосарій «{uk}»: «{m.group(0)}» → {use}')
                for b in bad:
                    key = (b, t[:80])
                    if key in seen:
                        continue
                    seen[key] = 1
                    errs += 1
                    if out:
                        out(f'{lang} {rel} [{kind}] {b} | {t[:120]}')
    return errs


def main(a):
    langs = LANGS
    if '--lang' in a:
        langs = a[a.index('--lang') + 1].split(',')
    if '--count' in a:  # частоти варіантів терміна: --count 'regex'
        import collections
        rx, c = re.compile(a[a.index('--count') + 1]), collections.Counter()
        for lang in langs:
            for f in pages(lang):
                for kind, t in texts(f):
                    c.update(m.group(0) for m in rx.finditer(t))
        for w, n in c.most_common(40):
            print(n, w)
        return 0
    if '--grep' in a:
        rx = re.compile(a[a.index('--grep') + 1])
        for lang in langs:
            for f in pages(lang):
                for kind, t in texts(f):
                    for m in rx.finditer(t):
                        s = max(0, m.start() - 60)
                        print(f'{os.path.relpath(f, ROOT)} [{kind}] …{t[s:m.end() + 60]}…')
        return 0
    n = run(langs, None if '--quiet' in a else print)
    print(f'i18nlint: {n} помилок' if n else 'i18nlint: OK')
    return 1 if n else 0


if __name__ == '__main__':
    try:
        sys.exit(main(sys.argv[1:]))
    except BrokenPipeError:
        pass
