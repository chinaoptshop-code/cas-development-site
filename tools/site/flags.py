"""Перемикачі сайту (один модуль — імпортують chrome.py, i18n.py, products/build.py, llms.py, blog/light.py).

OZDOBA_PUBLIC — чи показувати Оздобу (/ozdoba, /en/ozdoba, /pl/ozdoba, категорії, товари, комплекти, прайс).
Оздоба прихована з 12.11.2026 (Михайло: «приховаємо поки що вкладку Оздоба, не видаляй, просто приховай»).
False:
  • меню, бургер і футер усіх мов — без пунктів /ozdoba (chrome._live);
  • у текстах сторінок (лендинги, блог, FAQ, умови…) посилання на /ozdoba* знімає chrome.oz_hide() при кожному apply():
    окремі посилання-пункти (списки «Інші послуги», кнопки, картки) — прибирає цілком, посилання в реченні —
    лишає текстом; оригінал зберігається в коментарі <!--ozh:…-->, тож True + перезбирання повертає все як було;
  • самі сторінки Оздоби лишаються за прямою адресою: noindex, nofollow, без JSON-LD і hreflang (chrome.oz_seo),
    без записів у sitemap.xml і з X-Robots-Tag у _headers (products/build.py), без Оздоби в llms.txt;
  • кабінет /kabinet (замовлення, обране) і функції замовлень працюють як були.
Повернути: OZDOBA_PUBLIC = True і `bash tools/build-all.sh`.
"""
import re

OZDOBA_PUBLIC = False

# сторінки самої Оздоби (шлях файлу від кореня): ozdoba.html, ozdoba/*, en/ozdoba.html, pl/ozdoba.html
OZ_FILE = re.compile(r'(?:[a-z]{2}/)?ozdoba(?:\.html$|/)')
# посилання на Оздобу (href): /ozdoba, /ozdoba/…, /ozdoba#…, /en/ozdoba, абсолютні https://cas-develop.com/ozdoba…
OZ_HREF = re.compile(r'^(?:https://cas-develop\.com)?/(?:[a-z]{2}/)?ozdoba(?:[/?#]|$)')


def oz_href(h):
    return bool(OZ_HREF.match(h or ''))
