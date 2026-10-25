#!/usr/bin/env python3
"""Сторінки кабінету: /kabinet, /kabinet/{zamovlennia,obrane,proekty,profil} (клієнт, tools/shop/kabinet_v2.py)
і /kabinet/admin (менеджер). Шапка й стилі — з ozdoba.html.

  python3 tools/shop/pages.py
"""
import hashlib, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'tools/site'))
import chrome  # єдина шапка/футер (tools/site/chrome.py)
import leadform  # noqa: E402  легка заявка (tools/site/leadform.py)


def _chrome_apply(s, rel):
    """Форма заявки (обовʼязковий лише телефон) + єдина шапка/футер."""
    return chrome.apply(leadform.apply(s, rel), rel)


CSS = """
.acc{max-width:1100px;margin:0 auto;padding:0 16px 40px}
.acc h1{font-size:clamp(2rem,1.5rem + 2vw,3rem);margin:8px 0 10px}
.acc .lead{color:var(--muted);max-width:60ch;margin:0 0 22px}
.acc-box{border:1px solid var(--line);background:var(--surface);border-radius:16px;padding:22px;max-width:520px}
.acc-box>*+*{margin-top:12px}.acc-wait,.acc-err{color:var(--muted);font-size:var(--fs-small)}.acc-err{color:#e07a6a}
.acc-box>h2{font-size:var(--fs-h3);line-height:1.15;margin:0}
.acc-grid{display:grid;gap:18px}@media(min-width:900px){.acc-grid{grid-template-columns:340px 1fr;align-items:start}}
.acc-prof img{width:56px;height:56px;border-radius:50%;object-fit:cover;float:left;margin-right:12px}
.acc-prof b{display:block;font-size:var(--fs-lead)}.acc-prof small{color:var(--muted)}
.acc .field input,.acc .field select,.acc .field textarea{width:100%;background:var(--ink);border:1px solid var(--line);border-radius:10px;padding:12px;color:var(--cream);font:inherit}
.ord{border:1px solid var(--line);border-radius:14px;padding:16px;background:var(--surface)}
.ord+.ord{margin-top:12px}
.ord-h{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:baseline;justify-content:space-between}
.ord-h b{font-family:"Cormorant Garamond","Cormorant Fallback",serif;font-size:var(--fs-h3)}
.st{border:1px solid var(--brass);color:var(--glow);border-radius:999px;padding:3px 10px;font-size:var(--fs-small)}
.ord ul{margin:10px 0 0;padding-left:18px;color:var(--muted);font-size:var(--fs-small)}
.ord .tot{margin-top:8px;font-weight:700;color:var(--glow)}
.acc .btn{display:inline-block;width:auto;padding:12px 20px;margin:0;text-decoration:none}
.acc-ph{border-top:1px solid var(--line);padding-top:14px}.acc .acc-ph .btn{display:block;width:100%;text-align:center;margin:10px 0 0}
.acc-ph .field{margin-bottom:0}.acc-ph input:disabled{opacity:.6}.acc-ph .acc-wait{margin:10px 0 0}.acc-ph [hidden]{display:none!important}
.acc .row{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.tabs2{display:flex;gap:18px;border-bottom:1px solid var(--line);margin:6px 0 16px}
.tabs2 button{padding:8px 0 10px;color:var(--muted);font-weight:600;border-bottom:2px solid transparent;margin-bottom:-1px}
.tabs2 button[aria-pressed=true]{color:var(--cream);border-bottom-color:var(--brass)}
table.adm{width:100%;border-collapse:collapse;font-size:var(--fs-small)}table.adm td,table.adm th{border-bottom:1px solid var(--line);padding:8px 6px;text-align:left;vertical-align:top}
"""

# Клієнтські сторінки кабінету (v2, вкладки з окремими URL) — tools/shop/kabinet_v2.py.

# Адмінка: CRM, замовлення, клієнти, коди партнерів і редактор контенту — assets/admin/cms.v1.{js,css}
# (інструкція — tools/admin/README.md). Версії файлів (?v=хеш) — бо /assets/* кешується назавжди.
ADMIN = """<main class="acc">
  <div class="crumbs"><a href="/kabinet">Кабінет</a> / Адмінка</div>
  <h1>Адмінка: CRM і сайт</h1>
  <div id="adm"><p class="acc-wait">Перевіряємо доступ…</p></div>
</main>
<link rel="stylesheet" href="/assets/admin/cms.v1.css?v=__CMSCSS__">
<script src="/assets/account.v1.js?v=__ACCV__" defer></script>
<script src="/assets/admin/cms.v1.js?v=__CMSJS__" defer></script>
"""


def shell():
    s = open(os.path.join(ROOT, 'ozdoba.html'), encoding='utf-8').read()
    s = s.replace('</style>\n<!--ozd:ld-->', CSS + '</style>\n<!--ozd:ld-->', 1)
    s = re.sub(r'<!--ozd:ld-->.*?<!--/ozd:ld-->', '', s, count=1, flags=re.S)
    s = re.sub(r'<link rel="preload" id="ozd-data"[^>]*>\n', '', s)
    s = s.replace(' aria-current="page"', '')  # у кабінеті немає активного пункту меню
    s = s.replace('<meta name="twitter:card"', '<meta name="robots" content="noindex, nofollow">\n<meta name="twitter:card"', 1)
    hdr = re.search(r'<button class="ico" id="btnSearch".*?<span class="badge" id="cartBadge" hidden>0</span></button>', s, flags=re.S)
    if hdr:
        cart_svg = re.search(r'aria-label="Кошик">(<svg.*?</svg>)', hdr.group(0), flags=re.S).group(1)
        acc = re.search(r'<a class="ico" id="accLink".*?</a>', hdr.group(0), flags=re.S)
        s = s.replace(hdr.group(0), (acc.group(0) + '\n  ' if acc else '') + f'<a class="ico" href="/ozdoba" aria-label="Кошик">{cart_svg}</a>')
    return s


def page(s, title, body, path):
    s = re.sub(r'<title>.*?</title>', f'<title>{title} | CAS Development</title>', s, count=1)
    s = re.sub(r'(<link rel="canonical" href=")[^"]*', lambda m: m.group(1) + 'https://cas-develop.com/' + path, s, count=1)
    a, b = s.index('<div class="searchwrap"'), s.index('<!--chrome:f-->')
    h = lambda *f: hashlib.sha256(open(os.path.join(ROOT, *f), 'rb').read()).hexdigest()[:8]
    body = body.replace('__ACCV__', h('assets', 'account.v1.js'))
    if '__CMSJS__' in body:
        body = body.replace('__CMSJS__', h('assets', 'admin', 'cms.v1.js')).replace('__CMSCSS__', h('assets', 'admin', 'cms.v1.css'))
    s = s[:a] + body + '\n' + s[b:]
    a, b = s.index('<div class="bar" id="bar">'), s.index('<!--ui-polish--><script>')
    s = s[:a] + s[b:]
    f = os.path.join(ROOT, path + '.html')
    os.makedirs(os.path.dirname(f), exist_ok=True)
    open(f, 'w', encoding='utf-8').write(_chrome_apply(s, path + '.html'))
    print('✓', path)


if __name__ == '__main__':
    sh = shell()
    import kabinet_v2
    kabinet_v2.build(sh, page)
    page(sh, 'Облік замовлень', ADMIN, 'kabinet/admin')
