#!/usr/bin/env python3
"""CSV-вивантаження каталогу Оздоби для CRM-таблиці.

  python3 tools/products/export_crm.py                      # → /tmp/ozdoba-crm.csv
  python3 tools/products/export_crm.py -o ~/ozdoba.csv      # свій шлях
  python3 tools/products/export_crm.py --sources файл.json  # джерела фото / постачальники

Колонки: id, категорія, підкатегорія, назва, ціна «від» (грн, як на сайті), базова ціна, одиниця,
мін. кількість (min_qty, 10), кольори, розміри, опції адаптації (custom), slug, URL, фото-URL,
постачальник і джерело фото.

Постачальники й джерела фото в публічний репозиторій не комітимо: вони лежать у
tools/products/sources.local.json (у .gitignore) — {"<id>": {"via", "supplier", "listing"|"file", "image"}}.
Якщо файлу немає, ці колонки порожні. CSV — UTF-8 з BOM (коректно відкривається в Excel і Google Таблицях).
"""
import argparse, csv, json, os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CAT = os.path.join(ROOT, 'assets/ozdoba/catalog.json')
SRC = os.path.join(ROOT, 'tools/products/sources.local.json')
SITE = 'https://cas-develop.com'


def r10(n): return round(n / 10) * 10


def min_price(d, i):
    """Ціна «від», як на картці /ozdoba (tools/products/build.py min_price)."""
    if i.get('price') is None: return None
    ss = d['sizesets'].get(i['ss']) if i.get('ss') else None
    if ss: return r10(i['price'] * min(k for _, k in ss))
    return r10(i['price'] * (1 + d['colorsets'][i['cs']][0][2]))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('-o', '--out', default='/tmp/ozdoba-crm.csv')
    ap.add_argument('--sources', default=SRC, help='JSON з постачальниками й джерелами фото')
    a = ap.parse_args()
    d = json.load(open(CAT, encoding='utf-8'))
    src = json.load(open(a.sources, encoding='utf-8')) if os.path.exists(a.sources) else {}
    mq = d.get('min_qty', 10)
    cols = ['id', 'Категорія', 'Підкатегорія', 'Назва', 'Ціна від, грн', 'Базова ціна, грн', 'Одиниця', 'Мін. кількість',
            'Кольори', 'Розміри', 'Опції адаптації', 'Slug', 'URL', 'Фото-URL', 'Дод. фото', 'Постачальник', 'Джерело фото', 'Посилання на джерело']
    with open(os.path.expanduser(a.out), 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f)
        w.writerow(cols)
        for i in d['items']:
            s = src.get(str(i['id']), {})
            ss = d['sizesets'].get(i['ss']) if i.get('ss') else None
            w.writerow([i['id'], i['cat'], i['sub'], i['name'],
                        min_price(d, i) if i.get('price') is not None else 'за запитом', i.get('price') if i.get('price') is not None else '',
                        i['unit'], mq,
                        '; '.join(c[0] for c in d['colorsets'][i['cs']]), '; '.join(x[0] for x in ss) if ss else '',
                        '; '.join(i.get('custom') or []), i.get('slug', ''), f"{SITE}/ozdoba/{i.get('slug', '')}",
                        f"{SITE}/{i['img']}-800.webp" if i.get('img') else '',
                        ' '.join(f'{SITE}/{b}-800.webp' for b in i.get('imgs') or []),
                        s.get('supplier', ''), s.get('via', ''), s.get('listing') or s.get('file', '')])
    print(f'{len(d["items"])} товарів → {a.out}' + ('' if src else ' (без джерел: немає ' + a.sources + ')'))


if __name__ == '__main__':
    main()
