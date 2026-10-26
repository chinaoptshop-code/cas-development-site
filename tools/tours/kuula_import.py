#!/usr/bin/env python3
"""Перенесення туру з Kuula (наш профіль CASDevelopment) у власний переглядач /tury — разом із переходами.

  python3 tools/tours/kuula_import.py <id-колекції> <slug> "Назва туру" [--desc "Опис"]
      id — з посилання kuula.co/share/collection/<id>. Бере панораму найбільшого розміру, стискає до 4096 px
      без метаданих (build.resize), переносить назви кімнат (англ. → укр.), стрілки-переходи й стартовий напрям.
      Тур створюється прихованим ("hidden": true) — відкрити після ОК Михайла.

Kuula: KUULA_COLLECTION.data (base64 JSON) → posts[] (uuid, description, photos[0].sizes, options.heading),
addons[] з action.type == 1 → перехід на post.id; pos.start (x, y, z) — напрям на сфері.
"""
import base64, json, math, re, sys, tempfile, urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import build  # resize(), DATA, IMG, pages()

UA = {'User-Agent': 'Mozilla/5.0'}
ROOMS = [(r'hall|corridor|hallway|entr', 'Хол'), (r'living|lounge|gostin', 'Вітальня'), (r'kitchen', 'Кухня'),
         (r'dining', 'Їдальня'), (r'master|bed', 'Спальня'), (r'kid|child|nurs', 'Дитяча'), (r'bath|shower', 'Ванна'),
         (r'\bwc\b|toilet|restroom', 'Санвузол'), (r'dress|wardrobe|closet', 'Гардеробна'), (r'office|cabinet|study', 'Кабінет'),
         (r'terr|balcon|loggia', 'Тераса'), (r'stair', 'Сходи'), (r'pool', 'Басейн'), (r'spa|sauna', 'СПА'),
         (r'garden|yard|outdoor|exterior|facade', 'Двір'), (r'laund', 'Пральня'), (r'gym', 'Спортзал'), (r'show', 'Шоурум')]


def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()


def room_name(desc, i):
    d = (desc or '').lower()
    num = re.search(r'(\d{1,2})', d)
    for rx, ua in ROOMS:
        if re.search(rx, d):
            return f'{ua} {int(num.group(1))}' if num and int(num.group(1)) > 1 else ua
    return f'Точка {i + 1}'


def angles(v):
    # Kuula: y — вгору; напрям «вперед» (центр панорами) — +z, праворуч — +x (перевірено на Edelweiss: стрілки на дверях)
    x, y, z = v['x'], v['y'], v['z']
    r = math.sqrt(x * x + y * y + z * z) or 1
    return round(math.degrees(math.atan2(x, z)), 1), round(math.degrees(math.asin(max(-1, min(1, y / r)))), 1)


def main(cid, slug, title, desc=''):
    html = get(f'https://kuula.co/share/collection/{cid}').decode('utf-8', 'replace')
    m = re.search(r'window\.KUULA_COLLECTION\s*=\s*\{id:"[^"]+",data:"([^"]+)"', html)
    if not m:
        raise SystemExit(f'Колекцію {cid} не знайдено або вона приватна')
    col = json.loads(base64.b64decode(m.group(1)))
    posts = col['posts']
    ids = {p['id']: f's{i + 1:02d}' for i, p in enumerate(posts)}
    names, scenes = {}, []
    tmp = Path(tempfile.mkdtemp())
    for i, p in enumerate(posts):
        ph = p['photos'][0]
        size = max(ph.get('sizes') or ['4096'], key=int)
        src = tmp / f'{i}.jpg'
        src.write_bytes(get(f"https://files.kuula.io/{p['uuid']}/{ph.get('name', '01')}-{size}.jpg"))
        sid = ids[p['id']]
        build.resize(src, build.IMG / slug / f'{sid}.jpg')
        n = room_name(p.get('description'), i)
        names[n] = names.get(n, 0) + 1
        if names[n] > 1:
            n = f'{n} ({names[n]})'
        addons = ph.get('addons') or p.get('addons') or '[]'
        addons = json.loads(addons) if isinstance(addons, str) else addons
        hs = []
        for a in addons or []:
            act = a.get('action') or {}
            to = ids.get(((act.get('post') or {}).get('id')))
            pos = ((a.get('pos') or {}).get('start'))
            if act.get('type') == 1 and to and pos:
                yaw, pitch = angles(pos)
                hs.append({'to': to, 'yaw': yaw, 'pitch': max(-60, min(60, pitch))})
        heading = (ph.get('options') or {}).get('heading') or 0
        scenes.append({'id': sid, 'name': n, 'image': f'/img/tury/{slug}/{sid}.jpg',
                       'yaw': round(math.degrees(heading) - 90, 1) if heading else 0, 'hotspots': hs})
        print(f'  {sid} {n}: {size}px, стрілок {len(hs)}')
    build.DATA.mkdir(parents=True, exist_ok=True)
    (build.DATA / f'{slug}.json').write_text(json.dumps({
        'slug': slug, 'title': title, 'description': desc or f'360-тур «{title}» від CAS Development.',
        'hidden': True, 'source': f'kuula:{cid}', 'start': scenes[0]['id'], 'scenes': scenes}, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'Тур {slug}: {len(scenes)} кімнат (з Kuula {cid} «{col.get("name", "").strip()}»)')
    build.pages()


if __name__ == '__main__':
    a = sys.argv[1:]
    if len(a) < 3:
        raise SystemExit(__doc__)
    main(a[0], a[1], a[2], a[a.index('--desc') + 1] if '--desc' in a else '')
