#!/usr/bin/env python3
"""Скільки тексту сторінки збережено після переходу на шаблон: порівнює видимий текст <main> з версією в git.

  python3 tools/site/parity.py index.html about.html          # проти origin/main (за замовчуванням)
  python3 tools/site/parity.py --ref <коміт> contact.html     # проти будь-якого коміту
  python3 tools/site/parity.py --min 98 ...                   # код 1, якщо збережено менше за поріг (за замовчуванням 98)

Збережене — частка слів старої сторінки, що є й у новій (мультимножина: порядок блоків може змінитися).
Друкує речення старої сторінки, яких у новій немає, — їх варто перевірити руками (ціни, факти, посилання).
Скрипти, стилі, шапку й футер (chrome.py) не рахуємо; alt зображень — теж ні.
"""
import collections, html, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def text(s):
    i, j = s.find('<main'), s.find('</main>')
    s = s[i:j] if i >= 0 and j > i else s
    s = re.sub(r'<(script|style|template)\b[^>]*>.*?</\1>', ' ', s, flags=re.S)
    s = re.sub(r'<!--chrome:h-->.*?<!--/chrome:h-->|<!--chrome:f-->.*?<!--/chrome:f-->', ' ', s, flags=re.S)
    s = re.sub(r'<br\s*/?>|</(p|div|li|h\d|summary|figcaption|a|span|b|button)>', ' ', s)
    s = html.unescape(re.sub(r'<[^>]+>', ' ', s)).replace(' ', ' ').replace('ʼ', "'").replace('’', "'")
    return re.sub(r'\s+', ' ', s).strip()


def words(t):
    return re.findall(r"[\w$€₴%±'.,/-]+", t.lower())


def norm(w):
    return w.strip('.,')


def compare(old, new):
    a = collections.Counter(norm(w) for w in words(old) if norm(w))
    b = collections.Counter(norm(w) for w in words(new) if norm(w))
    kept = sum(min(n, b[w]) for w, n in a.items())
    total = sum(a.values()) or 1
    miss = [s for s in re.split(r'(?<=[.!?…])\s+', old) if len(s) > 25 and s not in new]
    if '--words' in sys.argv:  # які слова зникли (з кількістю)
        print('   слова:', ' '.join(f'{w}×{n - b[w]}' for w, n in a.most_common() if n > b[w]))
    return 100.0 * kept / total, miss


def main():
    args = [x for x in sys.argv[1:] if x != '--words']
    ref, lim = 'origin/main', 98.0
    if '--ref' in args:
        k = args.index('--ref'); ref = args[k + 1]; del args[k:k + 2]
    if '--min' in args:
        k = args.index('--min'); lim = float(args[k + 1]); del args[k:k + 2]
    bad = 0
    for rel in args:
        old = subprocess.run(['git', 'show', f'{ref}:{rel}'], cwd=ROOT, capture_output=True, text=True).stdout
        new = open(os.path.join(ROOT, rel), encoding='utf-8').read()
        pct, miss = compare(text(old), text(new))
        ok = pct >= lim
        bad |= not ok
        print(f'{"✓" if ok else "✗"} {rel}: збережено {pct:.1f}% тексту ({ref})')
        for s in miss[:40]:
            print('   − ' + s[:160])
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
