"""Версії панелі чату в завантажувачі site-chrome.v1.js (блок /*chat:v*/): ?v=<sha1[:8]> файлів assets/chat.v1.js і chat.v1.css.
/assets/* кешується назавжди — після правки chat.v1.{js,css} запустити: python3 tools/chat/ver.py (--check — лише перевірити, код 1, якщо застаріло).
Тест: node tools/tests/chat.mjs («версії панелі чату»)."""
import hashlib, os, re, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SC = os.path.join(ROOT, 'assets', 'site-chrome.v1.js')
h = lambda f: hashlib.sha1(open(os.path.join(ROOT, 'assets', f), 'rb').read()).hexdigest()[:8]


def block():
    return f'/*chat:v*/var CHV = {{js: "{h("chat.v1.js")}", css: "{h("chat.v1.css")}"}};/*/chat:v*/'


if __name__ == '__main__':
    s = open(SC, encoding='utf-8').read()
    new = re.sub(r'/\*chat:v\*/.*?/\*/chat:v\*/', lambda m: block(), s, count=1)
    if '--check' in sys.argv:
        print('OK' if new == s else 'Застаріло: python3 tools/chat/ver.py')
        sys.exit(0 if new == s else 1)
    if new != s:
        open(SC, 'w', encoding='utf-8').write(new)
    print(block())
