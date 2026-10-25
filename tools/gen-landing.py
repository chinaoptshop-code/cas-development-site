#!/usr/bin/env python3
"""Посадкові сторінки під пошукові запити — з шаблону remont-ofisu-pid-klyuch-kyiv.html.

Запуск з кореня сайту: python3 tools/gen-landing.py  → створює/оновлює сторінки зі списку PAGES.
Ціни й факти — лише підтверджені Михайлом (150+, 2016, ±5% якщо ремонт робить CAS, ціни сайту).
"""
import json, re, html
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools/site'))
import chrome  # єдина шапка/футер (tools/site/chrome.py)
TPL = (ROOT / "remont-ofisu-pid-klyuch-kyiv.html").read_text(encoding="utf-8")
BASE = "https://cas-develop.com/"

PAGES = [
    dict(
        slug="dyzain-interieru-kvartyry-kyiv",
        title="Дизайн інтерʼєру квартири в Києві — від $30/м²",
        desc="Дизайн-проєкт квартири в Києві від $30/м², мін. бюджет $2 500: планування, 3D, робочі креслення, підбір матеріалів. Реалізуємо самі — кошторис ремонту ±5%.",
        og_desc="Планування, 3D, креслення й підбір матеріалів. Реалізуємо своєю командою.",
        h1="Дизайн інтерʼєру квартири в Києві",
        price="від $30 / м²",
        lead="Проєкт, за яким квартиру можна зробити без сюрпризів: продумане планування, 3D кожної кімнати, креслення для бригади й специфікація матеріалів. Мінімальний бюджет проєкту — $2 500.",
        service="Дизайн інтерʼєру квартири", service_type="Дизайн-проєкт інтерʼєру", price_num=30,
        cards=[
            ("Планування", ["обміри та обмірний план", "варіанти планування", "розстановка меблів", "схеми світла й розеток"]),
            ("Візуалізація", ["стиль і концепція", "3D-візуалізації приміщень", "підбір кольорів і фактур", "правки до погодження"]),
            ("Креслення й матеріали", ["робочі креслення для бригади", "специфікація матеріалів", "підбір меблів і світла", "кошторис ремонту"]),
        ],
        steps=[
            ("Знайомство і заміри", "Дивимось квартиру, обговорюємо, як ви живете: хто, скільки людей, що важливо."),
            ("Планування", "Пропонуємо варіанти розстановки — обираєте один, доопрацьовуємо."),
            ("3D і стиль", "Показуємо, як виглядатиме кожна кімната, вносимо правки до погодження."),
            ("Робочі креслення", "Готуємо креслення й специфікації, за якими бригада працює без здогадок."),
            ("Кошторис", "Рахуємо ремонт за проєктом. Якщо ремонт робимо ми — підсумок у межах ±5% від кошторису."),
            ("Реалізація", "За бажанням беремо ремонт і комплектацію меблями напряму з Китаю."),
        ],
        faq=[
            ("Скільки коштує дизайн-проєкт квартири в Києві?", "Від $30 за м², мінімальний бюджет проєкту — $2 500. Точну суму називаємо після знайомства з квартирою."),
            ("Що входить у дизайн-проєкт?", "Обміри, варіанти планування, 3D-візуалізації, робочі креслення, специфікація матеріалів і меблів, кошторис ремонту."),
            ("Чи можете ви зробити ремонт за проєктом?", "Так, своєю командою. Якщо ремонт за нашим проєктом робимо ми, тоді гарантуємо, що підсумок ремонту не відхилиться від кошторису більше ніж на 5%."),
            ("Чи працюєте з новобудовами?", "Так — і з новобудовами від забудовника, і з вторинним житлом під повну переробку."),
        ],
        form_h2="Розрахувати дизайн-проєкт", area_ph="напр. 110", msg_ph="ЖК чи адреса, стан квартири, бажані терміни",
        sitemap_after="remont-ofisu-pid-klyuch-kyiv",
        llms="Дизайн інтерʼєру квартири в Києві: від $30/м², мінімальний бюджет $2 500, що входить у проєкт",
    ),
    dict(
        slug="remont-budynku-pid-klyuch-kyiv",
        title="Ремонт будинку під ключ у Києві та області — від $550/м²",
        desc="Ремонт будинку під ключ у Києві та області від $550/м²: проєкт, інженерія, оздоблення, меблі. Кошторис ±5% (якщо ремонт наш), регулярні фотозвіти, 150+ проєктів.",
        og_desc="Проєкт, інженерія, оздоблення й меблі однією командою. Кошторис ±5%, якщо ремонт за нашим проєктом робимо ми.",
        h1="Ремонт будинку під ключ у Києві та області",
        price="від $550 / м²",
        lead="Беремо будинок від коробки чи старого ремонту і здаємо готовим до життя: інженерія, оздоблення, меблі, світло. Одна команда, один договір, регулярні фотозвіти.",
        service="Ремонт будинку під ключ", service_type="Ремонт приватного будинку", price_num=550,
        cards=[
            ("Проєкт і кошторис", ["заміри й обстеження будинку", "дизайн-проєкт і креслення", "кошторис робіт і матеріалів", "графік етапів"]),
            ("Інженерія", ["електрика й слабкі струми", "опалення, тепла підлога", "водопостачання й каналізація", "вентиляція й кондиціювання"]),
            ("Оздоблення й комплектація", ["стіни, стелі, підлога", "санвузли й кухня", "меблі та світло з Китаю", "прибирання й здача"]),
        ],
        steps=[
            ("Виїзд на обʼєкт", "Оглядаємо будинок, фіксуємо стан конструкцій та інженерії."),
            ("Проєкт", "Робимо дизайн-проєкт або працюємо за вашим, готуємо креслення."),
            ("Кошторис і договір", "Якщо ремонт за нашим проєктом робимо ми, фіксуємо суму й етапи: підсумок не відхиляється від кошторису більше ніж на 5%."),
            ("Інженерія", "Прокладаємо мережі до чистових робіт — так, щоб потім нічого не довбати."),
            ("Оздоблення й меблі", "Чистові роботи, паралельно — комплектація напряму з Китаю. Регулярні фотозвіти в Telegram."),
            ("Здача", "Прибирання, акт виконаних робіт, гарантійні зобовʼязання за договором."),
        ],
        faq=[
            ("Скільки коштує ремонт будинку під ключ?", "Від $550 за м². Точна сума залежить від стану будинку, інженерії та рівня оздоблення — фіксуємо її в кошторисі після огляду."),
            ("Чи працюєте в Київській області?", "Так: Київ і область — Ірпінь, Буча, Бровари, Бориспіль, Обухів та інші населені пункти. Також працюємо по всій Україні, у Європі та світі."),
            ("Чи може кошторис вирости під час ремонту?", "Якщо ремонт за нашим проєктом робимо ми, ми гарантуємо, що підсумок не відхилиться від погодженого кошторису більше ніж на 5%. Додаткові роботи — лише після вашого письмового погодження."),
            ("Чи можна побачити, як іде ремонт, не приїжджаючи?", "Так, регулярно надсилаємо фотозвіти в Telegram."),
        ],
        form_h2="Розрахувати ремонт будинку", area_ph="напр. 220", msg_ph="населений пункт, стан будинку, бажані терміни",
        sitemap_after="dyzain-interieru-kvartyry-kyiv",
        llms="Ремонт будинку під ключ у Києві та області: від $550/м², інженерія, оздоблення, меблі, кошторис ±5% (якщо ремонт наш)",
    ),
]


def esc(s):
    return html.escape(s, quote=True)


def build(p):
    s = TPL
    url = BASE + p["slug"]
    sub = lambda pat, rep: re.sub(pat, lambda m: rep, s, count=1, flags=re.S)
    s = sub(r"<title>.*?</title>", f"<title>{esc(p['title'])}</title>")
    s = sub(r'<meta name="description" content="[^"]*">', f'<meta name="description" content="{esc(p["desc"])}">')
    s = s.replace(BASE + "remont-ofisu-pid-klyuch-kyiv", url)
    s = sub(r'<meta property="og:title" content="[^"]*">', f'<meta property="og:title" content="{esc(p["h1"])} — {esc(p["price"].replace(" / ", "/"))}">')
    s = sub(r'<meta property="og:description" content="[^"]*">', f'<meta property="og:description" content="{esc(p["og_desc"])}">')
    ld = {"@context": "https://schema.org", "@graph": [
        {"@type": "Service", "name": p["service"], "serviceType": p["service_type"],
         "areaServed": [{"@type": "City", "name": "Київ"}, {"@type": "AdministrativeArea", "name": "Київська область"}, {"@type": "Country", "name": "Україна"}, {"@type": "Continent", "name": "Європа"}],
         "provider": {"@type": "Organization", "@id": BASE + "#business", "name": "CAS Development", "url": BASE, "logo": BASE + "apple-touch-icon.png"},
         "offers": {"@type": "Offer", "priceCurrency": "USD", "priceSpecification": {"@type": "UnitPriceSpecification",
                    "price": p["price_num"], "priceCurrency": "USD", "unitText": "м²", "valueAddedTaxIncluded": False}}},
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Головна", "item": BASE},
            {"@type": "ListItem", "position": 2, "name": "Послуги", "item": BASE + "services"},
            {"@type": "ListItem", "position": 3, "name": p["service"], "item": url}]},
        {"@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in p["faq"]]}]}
    s = sub(r'<script type="application/ld\+json">.*?</script>', '<script type="application/ld+json">\n' + json.dumps(ld, ensure_ascii=False) + "\n</script>")
    s = s.replace("Ремонт офісу під ключ</div>", p["service"] + "</div>", 1)  # хлібні крихти
    s = sub(r"<h1>.*?</h1>", f"<h1>{esc(p['h1'])}</h1>")
    s = sub(r'<div class="price">.*?</div>', f'<div class="price">{esc(p["price"])}</div>')
    s = re.sub(r'(<div class="price">[^<]*</div>\s*<p>).*?(</p>)', lambda m: m.group(1) + esc(p["lead"]) + m.group(2), s, count=1, flags=re.S)
    cards = "\n".join(f'    <div class="card"><h3>{esc(t)}</h3><ul>' + "".join(f"<li>{esc(i)}</li>" for i in items) + "</ul></div>" for t, items in p["cards"])
    s = re.sub(r'(<h2>Що входить</h2>\s*<div class="grid">\n).*?(\n  </div>\n</div></section>)', lambda m: m.group(1) + cards + m.group(2), s, count=1, flags=re.S)
    steps = "\n".join(f"    <li><div><b>{esc(a)}</b><span>{esc(b)}</span></div></li>" for a, b in p["steps"])
    s = re.sub(r'(<ol class="steps">\n).*?(\n  </ol>)', lambda m: m.group(1) + steps + m.group(2), s, count=1, flags=re.S)
    faq = "\n".join(f"  <details><summary>{esc(q)}</summary><p>{esc(a)}</p></details>" for q, a in p["faq"])
    s = re.sub(r'(<h2>Питання та відповіді</h2>\n).*?(\n</div></section>)', lambda m: m.group(1) + faq + m.group(2), s, count=1, flags=re.S)
    s = s.replace("<h2>Розрахувати ремонт офісу</h2>", f"<h2>{esc(p['form_h2'])}</h2>")
    s = s.replace('placeholder="напр. 250"', f'placeholder="{esc(p["area_ph"])}"')
    s = s.replace('placeholder="адреса БЦ, терміни, кількість робочих місць"', f'placeholder="{esc(p["msg_ph"])}"')
    s = s.replace("<label for=\"oArea\">Площа офісу, м²</label>", "<label for=\"oArea\">Площа, м²</label>")
    s = s.replace("service:'Ремонт офісу під ключ'", f"service:'{p['service']}'")
    s = s.replace("source:'cas-develop.com/remont-ofisu-pid-klyuch-kyiv'", f"source:'cas-develop.com/{p['slug']}'")
    assert "офіс" not in re.sub(r"<script.*?</script>", "", s.split("<main>")[1].split("</main>")[0], flags=re.S).lower().replace("офіс:", ""), p["slug"]
    return s


def add_lines():
    sm = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
    ll = (ROOT / "llms.txt").read_text(encoding="utf-8")
    for p in PAGES:
        loc = f"<loc>{BASE}{p['slug']}</loc>"
        if loc not in sm:
            after = f"<loc>{BASE}{p['sitemap_after']}</loc>"
            i = sm.index(after); j = sm.index("</url>", i) + len("</url>")
            sm = sm[:j] + f"\n  <url>{loc}<lastmod>2026-10-21</lastmod></url>" + sm[j:]
        if p["slug"] not in ll:
            ll = ll.replace("- [Портфоліо]", f"- [{p['h1']}]({BASE}{p['slug']}): {p['llms']}\n- [Портфоліо]", 1)
    (ROOT / "sitemap.xml").write_text(sm, encoding="utf-8")
    (ROOT / "llms.txt").write_text(ll, encoding="utf-8")


if __name__ == "__main__":
    for p in PAGES:
        (ROOT / f"{p['slug']}.html").write_text(chrome.apply(build(p), f"{p['slug']}.html"), encoding="utf-8")
        print("✓", p["slug"])
    add_lines()
