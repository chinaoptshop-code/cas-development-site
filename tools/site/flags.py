"""Перемикачі сайту (один модуль — імпортують chrome.py, i18n.py, products/build.py, llms.py, blog/light.py).

OZDOBA_PUBLIC — чи показувати Оздобу (/ozdoba, /en/ozdoba, /pl/ozdoba, категорії, товари, комплекти, прайс).
Оздоба прихована з 12.11.2026 (Михайло: «приховаємо поки що вкладку Оздоба, не видаляй, просто приховай»).
False:
  • меню, бургер і футер усіх мов — без пунктів /ozdoba (chrome._live);
  • у текстах сторінок (лендинги, блог, FAQ, умови…) посилання на /ozdoba* знімає chrome.oz_hide() при кожному apply():
    окремі посилання-пункти (списки «Інші послуги», кнопки, картки) — прибирає цілком, посилання в реченні —
    лишає текстом; оригінал зберігається в коментарі <!--ozh:…-->, тож True + перезбирання повертає все як було;
  • тексти («через каталог Оздоба», «мінімальне замовлення від $10 000») — нейтрально «комплектація напряму з фабрик Китаю»
    (tools/site/oztext.py у chrome.apply(), оригінал у <!--ozt:…-->; Михайло 16.11.2026);
  • самі сторінки Оздоби лишаються за прямою адресою: noindex, nofollow, без JSON-LD і hreflang (chrome.oz_seo),
    без записів у sitemap.xml і з X-Robots-Tag у _headers (products/build.py), без Оздоби в llms.txt;
  • кабінет /kabinet (tools/shop/pages.py, kabinet_v2.py → data-oz="0" у kabinet.v2.js): без кошика в шапці, промо Оздоби,
    знижки за обсягом і рекомендацій; вкладки «Замовлення»/«Обране» — лише якщо в клієнта є замовлення чи обране
    (наявні клієнти бачать свої замовлення); API замовлень працює як було.
Повернути: OZDOBA_PUBLIC = True і `bash tools/build-all.sh`.
"""
import re

OZDOBA_PUBLIC = False

# CHAT_PUBLIC — чи показувати чат з AI-помічником (23.11.2026; функції — /api/chat/*, панель — assets/chat.v1.{js,css}, інструкція —
# tools/admin/README.md «Чат на сайті», контракт воркера — tools/chat/API.md). Михайло: «не віконце, а іконка» — чат на сайті лише іконкою.
# False (до перевірки власником): у HTML нічого немає; чат відкривається лише в режимі перевірки — сторінка з ?chat=1 (запамʼятовується
#   в sessionStorage): site-chrome.v1.js сам додає іконку в ряди месенджерів і вантажить панель після тапу. API працює в обох випадках.
# True (з 23.11.2026 — для всіх): на телефоні — кружечок бота a.mb-bot поруч із кружечком дзвінка (chrome.mbar_lead; Михайло 23.11.2026);
#   іконка чату (a.bi-chat[data-chat], aria-label/title мовою сторінки) — ще одна в рядах месенджерів:
#   футер і мобільне меню шапки (chrome.header/footer), під кнопкою форми .lq-alt (leadform.extras); ряди, які будує
#   lead-form.v1.js (.lq-alt, .of-ct-m біля форми), іконку отримують від site-chrome.v1.js. НЕ в шапці на ПК і НЕ плаваюча в куті.
#   Панель — лише після тапу. Увімкнути: CHAT_PUBLIC = True і `bash tools/build-all.sh` (усі сторінки змінюються на кілька сотень байтів).
CHAT_PUBLIC = True  # Михайло 23.11.2026: «так, вмикай для всіх»
CHAT_NAME = {'uk': 'Чат з помічником', 'ru': 'Чат с помощником', 'en': 'Chat with our assistant', 'es': 'Chat con el asistente', 'zh': '与助手聊天',
             'pl': 'Czat z asystentem', 'de': 'Chat mit dem Assistenten', 'fr': 'Discuter avec l’assistant', 'pt': 'Chat com o assistente', 'ar': 'الدردشة مع المساعد'}


def chat_icon(lang, img=False, title=True, circle=False, href='#zayavka'):
    """Іконка чату для ряду месенджерів (лише при CHAT_PUBLIC; інакше '').
    circle=True — кружечок бота поруч із кружечком дзвінка в куті телефона (chrome.mbar_lead; іконка — CSS-маска .mb-bot, без <img>).
    Без JS посилання веде до форми заявки (#zayavka; chrome.apply на сторінці без форми підставляє адресу форми мови), з JS — відкриває панель."""
    if not CHAT_PUBLIC:
        return ''
    n = CHAT_NAME.get(lang, CHAT_NAME['en'])
    if circle:
        return f'<a class="mb-bot" href="{href}" data-chat aria-label="{n}" title="{n}"></a>\n'
    if img:
        return f'<a class="mb-chat" href="{href}" data-chat aria-label="{n}"><img src="/assets/brand/chat.svg" width="32" height="32" alt="" loading="lazy" decoding="async"></a>'
    return f'<a class="bi bi-chat" href="{href}" data-chat aria-label="{n}"' + (f' title="{n}"' if title else '') + '></a>'

# сторінки самої Оздоби (шлях файлу від кореня): ozdoba.html, ozdoba/*, en/ozdoba.html, pl/ozdoba.html
OZ_FILE = re.compile(r'(?:[a-z]{2}/)?ozdoba(?:\.html$|/)')
# посилання на Оздобу (href): /ozdoba, /ozdoba/…, /ozdoba#…, /en/ozdoba, абсолютні https://cas-develop.com/ozdoba…
OZ_HREF = re.compile(r'^(?:https://cas-develop\.com)?/(?:[a-z]{2}/)?ozdoba(?:[/?#]|$)')


def oz_href(h):
    return bool(OZ_HREF.match(h or ''))
