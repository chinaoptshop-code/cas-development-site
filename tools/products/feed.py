# Фід товарів Оздоби для Google Merchant Center, Pinterest і Meta-каталогу — /ozdoba/feed.xml (RSS 2.0 з g:-полями).
# Викликається з tools/products/build.py (функція build(mod)); окремо: python3 tools/products/feed.py
# Товари без фото пропускаємо. Ціна — базова з каталогу, UAH. Мінімум 10 шт позиції — у описі (мін. замовлення $500 — там само).
# Інструкція для Михайла — tools/products/MERCHANT.md. Акаунтів не створюємо — лише фід.
import json, os, re, sys, html, datetime
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SITE = 'https://cas-develop.com'
OUT = os.path.join(ROOT, 'ozdoba', 'feed.xml')
GPC = {  # google_product_category (назви з таксономії Google; категорія «Оздоблення» — будматеріали)
    'Освітлення': 'Home & Garden > Lighting', 'Меблі': 'Furniture', 'Сантехніка': 'Hardware > Plumbing > Plumbing Fixtures',
    'Оздоблення': 'Hardware > Building Materials', 'Текстиль': 'Home & Garden > Linens & Bedding',
    'Декор': 'Home & Garden > Decor', 'Сервіровка': 'Home & Garden > Kitchen & Dining > Tableware', 'Каміни': 'Home & Garden > Fireplaces',
    'Кухня': 'Home & Garden > Kitchen & Dining', 'Тераса й сад': 'Home & Garden > Lawn & Garden > Outdoor Living', 'Двері': 'Hardware > Building Materials > Doors',
}
def esc(s): return html.escape(str(s or ''), quote=False)
def build(mod=None):
    d = json.load(open(os.path.join(ROOT, 'assets/ozdoba/catalog.json'), encoding='utf-8'))
    minq = int(d.get('min_qty') or 10); items = []
    for i in d['items']:
        if not i.get('img') or not i.get('slug'): continue
        price = float(str(i.get('price') or 0).replace(' ', '') or 0)
        if price <= 0: continue
        desc = re.sub(r'\s+', ' ', str(i.get('desc') or i['name'])).strip()
        desc = f"{desc} Мінімальна кількість — {minq} {i.get('unit', 'шт')} позиції, мінімальне замовлення від $500; поставка з Китаю 30–60 днів. Можливе виготовлення під замовлення."
        items.append(f"""  <item>
   <g:id>ozd-{i['id']}</g:id>
   <g:title>{esc(i['name'][:150])}</g:title>
   <g:description>{esc(desc[:5000])}</g:description>
   <g:link>{SITE}/ozdoba/{i['slug']}</g:link>
   <g:image_link>{SITE}/{i['img']}-800.webp</g:image_link>
{''.join(f'   <g:additional_image_link>{SITE}/{b}-800.webp</g:additional_image_link>{chr(10)}' for b in (i.get('imgs') or [])[:10])}   <g:price>{price:.2f} UAH</g:price>
   <g:availability>in_stock</g:availability>
   <g:condition>new</g:condition>
   <g:brand>CAS Ozdoba</g:brand>
   <g:mpn>ozd-{i['id']}</g:mpn>
   <g:identifier_exists>no</g:identifier_exists>
   <g:google_product_category>{esc(GPC.get(i['cat'], 'Home & Garden'))}</g:google_product_category>
   <g:product_type>{esc(i.get('sub') or i['cat'])}</g:product_type>
   <g:multipack>{minq}</g:multipack>
  </item>""")
    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
 <channel>
  <title>Оздоба — каталог CAS Development</title>
  <link>{SITE}/ozdoba</link>
  <description>Меблі, світло, сантехніка, оздоблення й декор для квартир, будинків і закладів — комплектація з Китаю. Оновлено {datetime.date.today().isoformat()}.</description>
{chr(10).join(items)}
 </channel>
</rss>
"""
    os.makedirs(os.path.dirname(OUT), exist_ok=True); open(OUT, 'w', encoding='utf-8').write(xml)
    return len(items)
if __name__ == '__main__':
    print(f'фід: {build()} товарів → ozdoba/feed.xml')
