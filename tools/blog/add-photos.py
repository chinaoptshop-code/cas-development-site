#!/usr/bin/env python3
"""Додає поле photos до статей блогу — бере 2-3 фото зі сторінки відповідної послуги.

  python3 tools/blog/add-photos.py          # додати photos до всіх статей без нього
  python3 tools/blog/add-photos.py --force  # перезаписати photos у всіх статей

Після запуску: python3 tools/blog/build.py --check && python3 tools/blog/build.py
"""
import glob, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ART = os.path.join(ROOT, 'tools/blog/articles')
FORCE = '--force' in sys.argv

# Фото кожної service-сторінки (з .gal галерей)
SERVICE_PHOTOS = {
    '/remont-kvartyr-kyiv':          ['img/p/1xqY1KZo2JY5xq-900.webp', 'img/p/1bXytwftMuIHBN-900.webp', 'img/p/1MslU7S5X8gIEp-900.webp', 'img/p/1YQyhjEui9fb6v-900.webp', 'img/p/1iGcqtsUqLNWbB-900.webp', 'img/p/1rfuCVdOfWwhML-900.webp'],
    '/remont-pid-klyuch-kyiv':        ['img/p/1xqY1KZo2JY5xq-900.webp', 'img/p/1bXytwftMuIHBN-900.webp', 'img/p/16fKqdFifd2emf-900.webp', 'img/p/13a8ks6jQlZ5LY-900.webp', 'img/p/1rX1eAn3-aYuHF-900.webp', 'img/p/11-2l13BlD_4wv-900.webp'],
    '/remont-novobudovy-kyiv':        ['img/p/1xqY1KZo2JY5xq-900.webp', 'img/p/1bXytwftMuIHBN-900.webp', 'img/p/1iGcqtsUqLNWbB-900.webp', 'img/p/1rfuCVdOfWwhML-900.webp', 'img/p/1MslU7S5X8gIEp-900.webp', 'img/p/1YQyhjEui9fb6v-900.webp'],
    '/remont-ofisu-pid-klyuch-kyiv':  ['img/p/16fKqdFifd2emf-900.webp', 'img/p/13a8ks6jQlZ5LY-900.webp', 'img/p/172MXziiSXy2Bp-900.webp', 'img/p/1rX1eAn3-aYuHF-900.webp', 'img/p/11-2l13BlD_4wv-900.webp', 'img/p/1S_QdDAbXIVbgH-900.webp'],
    '/remont-vannoi-kimnaty-kyiv':    ['img/p/1Grj8_m7MJwsbE-900.webp', 'img/p/1Xdb_M0v9MyKsV-900.webp', 'img/p/1MslU7S5X8gIEp-900.webp', 'img/p/1YQyhjEui9fb6v-900.webp', 'img/p/1NVeaQcV2TZSN5-900.webp', 'img/p/1OR5i7-rm1k0MU-900.webp'],
    '/remont-budynku-pid-klyuch-kyiv':['img/p/1NVeaQcV2TZSN5-900.webp', 'img/p/1OR5i7-rm1k0MU-900.webp', 'img/p/1FiLI9kKE-C87h-900.webp', 'img/p/1hXV_Pz6_GfnXe-900.webp', 'img/p/1FRa0FI6iMHK5L-900.webp', 'img/p/1f3m1_qf4mDosh-900.webp'],
    '/budivnytstvo-budynkiv-kyiv':    ['img/p/1NVeaQcV2TZSN5-900.webp', 'img/p/1OR5i7-rm1k0MU-900.webp', 'img/p/1F4OovwNYQPfoF-900.webp', 'img/p/1Us4FZpRlnEsqf-900.webp', 'img/p/1g-E1m6cFJ9kvH-900.webp', 'img/p/1pF5ohNHdSnme0-900.webp'],
    '/dyzain-restoranu-kafe-kyiv':    ['img/p/18ej1fH-11uoyr-900.webp', 'img/p/1OGn3TXnLkQenE-900.webp', 'img/p/1jKOiN3xyCjZCL-900.webp', 'img/p/12HcLhMA1BYGfJ-900.webp', 'img/p/1GqqKXz4Ax1_cM-900.webp', 'img/p/16Do4G_08hSZtl-900.webp'],
    '/komplektatsiia-pid-kliuch-kyiv':['img/p/1jKOiN3xyCjZCL-900.webp', 'img/p/12HcLhMA1BYGfJ-900.webp', 'img/p/1OGn3TXnLkQenE-900.webp', 'img/p/18ej1fH-11uoyr-900.webp', 'img/p/16fKqdFifd2emf-900.webp', 'img/p/1iGcqtsUqLNWbB-900.webp'],
    '/mebliuvannia-kvartyry-kyiv':    ['img/p/1MslU7S5X8gIEp-900.webp', 'img/p/1YQyhjEui9fb6v-900.webp', 'img/p/1iGcqtsUqLNWbB-900.webp', 'img/p/1rfuCVdOfWwhML-900.webp', 'img/p/1jKOiN3xyCjZCL-900.webp', 'img/p/12HcLhMA1BYGfJ-900.webp'],
    '/dyzain-interieru-kyiv':         ['img/p/1MslU7S5X8gIEp-900.webp', 'img/p/1YQyhjEui9fb6v-900.webp', 'img/p/1Grj8_m7MJwsbE-900.webp', 'img/p/1Xdb_M0v9MyKsV-900.webp', 'img/p/1DL1BY7Tg6L5B5-900.webp', 'img/p/1HMtnMX7Fgpwg5-900.webp'],
    '/remontna-bryhada-kyiv':         ['img/p/1xqY1KZo2JY5xq-900.webp', 'img/p/1bXytwftMuIHBN-900.webp', 'img/p/16fKqdFifd2emf-900.webp', 'img/p/13a8ks6jQlZ5LY-900.webp', 'img/p/1rX1eAn3-aYuHF-900.webp', 'img/p/11-2l13BlD_4wv-900.webp'],
    '/baza-vidpochynku-pid-klyuch':   ['img/p/1A9yy4nI-gf9h3-900.webp', 'img/p/1XdhtH1mjWRTli-900.webp', 'img/p/1g-E1m6cFJ9kvH-900.webp', 'img/p/1pF5ohNHdSnme0-900.webp', 'img/p/1GqqKXz4Ax1_cM-900.webp', 'img/p/16Do4G_08hSZtl-900.webp'],
    '/remont-komertsiinykh-prymishchen-kyiv': ['img/p/1rX1eAn3-aYuHF-900.webp', 'img/p/11-2l13BlD_4wv-900.webp', 'img/p/16fKqdFifd2emf-900.webp', 'img/p/13a8ks6jQlZ5LY-900.webp', 'img/p/1jKOiN3xyCjZCL-900.webp', 'img/p/12HcLhMA1BYGfJ-900.webp'],
}

# Ru-псевдоніми → uk сторінка
RU_ALIAS = {
    '/ru/remont-kvartir-kiev':        '/remont-kvartyr-kyiv',
    '/ru/remont-pod-klyuch-kiev':     '/remont-pid-klyuch-kyiv',
    '/ru/remont-v-novostroyke-kiev':  '/remont-novobudovy-kyiv',
    '/ru/remont-ofisa-kiev':          '/remont-ofisu-pid-klyuch-kyiv',
    '/ru/remont-vannoy-komnaty-kiev': '/remont-vannoi-kimnaty-kyiv',
    '/ru/remont-doma-pid-klyuch':     '/remont-budynku-pid-klyuch-kyiv',
    '/ru/stroitelstvo-doma-kyiv':     '/budivnytstvo-budynkiv-kyiv',
    '/ru/dizayn-restorana-kafe-kiev': '/dyzain-restoranu-kafe-kyiv',
    '/ru/komplektaciya-kyiv':         '/komplektatsiia-pid-kliuch-kyiv',
    '/ru/meblirovanie-kvartiry-kyiv': '/mebliuvannia-kvartyry-kyiv',
    '/ru/dizayn-interera-kyiv':       '/dyzain-interieru-kyiv',
    '/ru/remontna-brigada-kiev':      '/remontna-bryhada-kyiv',
}


def pick_photos(a):
    """Повертає список 2-4 фото для статті, не дублюючи hero-фото."""
    svc = a['service'][0]
    pool = SERVICE_PHOTOS.get(svc) or SERVICE_PHOTOS.get(RU_ALIAS.get(svc, ''))
    if not pool:
        # Fallback: перша uk-подібна сторінка з пулу
        pool = SERVICE_PHOTOS['/remont-pid-klyuch-kyiv']

    hero = a.get('photo', '')
    candidates = [p for p in pool if p != hero]

    # Кількість фото: від 2 до 4, різна для різних статей (через хеш slug)
    slug_hash = sum(ord(c) for c in a['slug'])
    count = 2 + (slug_hash % 3)  # 2, 3 або 4
    return candidates[:count]


n_updated = 0
for f in sorted(glob.glob(os.path.join(ART, '*.json'))):
    a = json.load(open(f, encoding='utf-8'))
    if not FORCE and a.get('photos'):
        continue
    photos = pick_photos(a)
    # Перевіряємо що файли існують
    photos = [p for p in photos if os.path.exists(os.path.join(ROOT, p))]
    if not photos:
        print(f'SKIP {a["slug"]} — фото не знайдено')
        continue
    a['photos'] = photos
    # Зберігаємо з відступами, зберігаємо порядок ключів
    text = json.dumps(a, ensure_ascii=False, indent=1)
    open(f, 'w', encoding='utf-8').write(text + '\n')
    print(f'OK   {a["slug"]} → {len(photos)} фото')
    n_updated += 1

print(f'\nОновлено {n_updated} статей.')
