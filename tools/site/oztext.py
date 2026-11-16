"""Тексти про Оздобу, поки вона прихована (flags.OZDOBA_PUBLIC = False, Михайло 16.11.2026).

Замість «через каталог Оздоба», «мінімальне замовлення від $10 000» тощо — нейтрально: «комплектація напряму з фабрик Китаю»
(9 мов), без назви бренду й без мінімального замовлення. Джерела (JSON сторінок, статті) не змінюються: заміну робить
chrome.apply() → hide() на кожній збірці, тож OZDOBA_PUBLIC = True + `bash tools/build-all.sh` повертає тексти як були.

• текст у <body> (сусідні шматки тексту разом із <span class="nw"> і маркерами <!--ozh-->) — правила RULES мови сторінки;
  змінений шматок — `<!--ozt:base64(оригінал)-->новий текст<!--/ozt-->`, тож show() повертає оригінал і на ручних сторінках;
• питання FAQ про саму Оздобу (DROP_Q: «Чи можна купити в Оздобі одну річ?», знижки, оплата…) — прибирає цілком
  (<details> і Question у JSON-LD FAQPage);
• атрибути (alt, title, aria-label, content, data-xs), <title> і JSON-LD — ті самі правила (тег/блок — у маркері ozt);
• text(s, lang) — те саме для рядка (blog/light.py: рядок «Ціни:» у «Коротко»).
Перевірка: `python3 tools/site/oztext.py --check` (у зібраних сторінках, крім /ozdoba* і /kabinet, немає назви й мінімуму),
`--dry` — що змінюється.
"""
import base64
import json
import zlib
import html as _html
import os
import re
import sys

NB, NN = '\u00a0', '\u202f'

# Назва бренду (не «оздоблення», «оздоблювальні»)
BRAND = re.compile(r'Оздоб(?!лен|лю|ле)|Ozdoba|奥兹多巴|أوزدوبا')
# Мінімальне замовлення Оздоби: $10 000 / $10,000 / 460 000 ₴ (не $110 000)
MIN = re.compile(r'(?<![\d,.])\$10[ ,]000(?![\d,])|(?<![\d,.])10[ ,]000 ?\$(?![\d,])|(?<![\d])460 000 ?₴|₴ ?460 000')
TRIG = re.compile(BRAND.pattern + '|' + MIN.pattern)

P = '[-]'  # місце вбудованого тегу (<a>, <b>, маркер ozh) у тексті шматка


def _items(t, sep):
    """Рядок-перелік («a · b · c», «Ціни: a, b»): без пунктів з мінімальним замовленням."""
    head, colon, rest = t.partition(': ') if sep == ', ' else ('', '', t)
    keep = [x for x in rest.split(sep) if not MIN.search(x)]
    if len(keep) == len(rest.split(sep)):
        return t
    return (head + colon + sep.join(keep)) if keep else ''


def _r(*pairs):
    """Правила мови: (шаблон, заміна); заміна None — прибрати все речення, в якому є шаблон."""
    out = []
    for a, b in pairs:
        if isinstance(a, str):
            a = a.replace('«?', '[«\ue000-\uf8ff]*').replace('»?', '[»\ue000-\uf8ff]*').replace('ⓟ', P)
        if b is None:
            pre = '' if a.startswith('⌂') else r'[^.!?。؟]*?'
            a = r'(?:(?<=^)|(?<=[.!?;。؟] ))' + pre + '(?:' + a.lstrip('⌂') + r')[^.!?。؟]*(?:[.!?。؟] ?|$)'
            b = ''
        out.append((re.compile(a, re.S), b))
    return out


# Спільне для всіх мов: «(≈460 000 ₴)», «шт.,» (крапка не кінець речення)
COMMON = _r(
    (r' ?\((?:≈|ca\.|ok\.|about|около|приблизно|env\.|aprox\.|约)? ?(?:460 000 ?₴|₴ ?460 000)\)', ''),
    (r'(?<=\d) (шт|szt|uds|pcs|pz|St)\.(?=[,;]| [a-zа-яіїєґ])', r' \1'),
    (r'^(?:Ціни|Цены|Prices|Ceny|Preise|Prix|Precios|Preços|价格|الأسعار): .*', lambda m: _items(m.group(0), ', ')),
    (r'^.* · .*$', lambda m: _items(m.group(0), ' · ')),
)
UA, RU = 'напряму з фабрик Китаю', 'напрямую с фабрик Китая'
EN, PL, DE = 'directly from factories in China', 'bezpośrednio z fabryk w Chinach', 'direkt von Fabriken in China'
FR, ES = 'directement auprès d’usines en Chine', 'directamente de fábricas en China'
PT = 'diretamente de fábricas na China'

# ── Правила (порядок важливий). Текст нормалізований: NBSP/NNBSP → пробіл. ─────────────────────────────────────────
# Спершу — мінімальне замовлення (фрази, потім цілі речення), далі — фрази з назвою бренду, наприкінці — повтори.
RULES = {
    'uk': COMMON + _r(
        (r'⌂(?:Мінімальн\w* замовлення|У (?:нашому )?каталозі «?Оздоба»? мінімальне|Так, мінімальне замовлення)[^.]*?\$10 000', None),
        (r'⌂Умови прості:', None),
        (r'Мінімальне замовлення, (строки|терміни)', lambda m: m.group(1).capitalize()),
        (r'^(Замовлення) Оздоби$', r'\1 меблів з Китаю'),
        (r'Послуга: Оздоба —', 'Послуга:'),
        (r'можна підібрати в каталозі «?Оздоба»?', f'можна підібрати й замовити {UA}'),
        (r'Їх можна замовити напряму з Китаю: у розділі Оздоба мінімальне замовлення від \$10 000, поштучно ми не продаємо, а поставка займає', f'Їх можна замовити {UA}: поставка займає'),
        (r'Меблі для офісу з Китаю: що можна замовити, мінімальне замовлення від \$10 000 і 10 шт позиції, ', 'Меблі для офісу з Китаю: що можна замовити, '),
        (r', а мінімум — 10 одиниць кожної позиції й замовлення від \$10 000', ', а фабрики виготовляють партіями'),
        (r', комплектація з каталогу «?Оздоба»? — від \$10 000', f', комплектація {UA}'),
        (r' \(мінімальне замовлення в Оздобі — від \$10 000\)', ''),
        (r'; мінімальне замовлення в (?:нашому )?каталозі «?Оздоба»? — (?:від )?\$10 000', ''),
        (r'(?<=[:—]) (?:мінімальне )?замовлення(?: —)? (?:від )?\$10 000, (?:(?:від|мінімум) 10 (?:шт|одиниць) (?:кожної )?позиції, )?(?:поштучно (?:ми )?не продаємо, )?', ' '),
        (r'(?<=[:—]) від \$10 000, (?:мінімум|від) 10 (?:шт|одиниць) (?:кожної )?позиції(?:, |$)', ' '),
        (r' — від \$10 000, мінімум 10 (?:шт|одиниць) кожної позиції, ', ', '),
        (r' (?:і|із|з) мінімальним замовленням від \$10 000 і (?=поставкою)', ' з '),
        (r',? (?:і|із|з) мінімальним замовленням від \$10 000', ''),
        (r', мінімальне замовлення від \$10 000(?=[,.;]|$)', ''),
        (r', від \$10 000(?=\.)', ''),
        (r'знижк\w* за обсягом[^.]*\$10 000', None),
        (r'[Мм]інімальн\w* замовлення[^.]*?\$10 000', None),
        (r'[Пп]оштучно (?:позиції |ми )?не продаємо', None),
        (r'^Від \$10 000|Каталог працює з партіями|Комплектацію з каталогу «?Оздоба»? можна почати', None),
        (r'готові ⓟ?комплекти під обʼєктⓟ? з каталогу|Переглянути меблі[^.]*каталозі Оздоба', None),
        (r'^(?:від )?\$10 000$', ''),
        (r'мінімальне замовлення — (?=поставка)', ''),
        (r': мінімум 10 шт(?: кожної позиції)?\.', '.'),
        (r' — каталог «Оздоба»', ''),
        (r'Оздоба — комплектація з Китаю', f'Комплектація {UA}'),
        (r': каталог «?Оздоба»?$', ''),
        (r'⌂Знижка за обсягом діє', None),
        (r'Оплата й знижка за обсягом', 'Оплата'),
        (r', знижка за обсягом(?=\.)', ''),
        (r'Оздоба — меблі з Китаю', f'Меблі {UA}'),
        (r'(Меблі (?:й кабіни )?для (?:офісу|open space)) — Оздоба', rf'\1 {UA}'),
        (r'Меблювання й Оздоба', 'Меблювання й комплектація'),
        (r'меблі з Китаю й Оздоба', f'меблі {UA}'),
        (r'Як проходить замовлення через «?Оздобу»?', 'Як проходить замовлення з фабрик Китаю'),
        (r'працюючи через «?Оздобу»?,', 'працюючи з нами,'),
        (r' — «?Оздоба»?(?=:)', ''),
        (r'([Зз]амовлення) Оздоби', r'\1'),
        (r'Позиції Оздоби', 'Меблі'),
        (r'у CAS є каталог «?Оздоба»?: меблі, світло й текстиль із Китаю', f'CAS комплектує {UA}: меблі, світло й текстиль'),
        (r'в нас є каталог «?Оздоба»?:', f'ми комплектуємо {UA}:'),
        (r'[Уу] каталозі «?Оздоба»? є (все|світильники)', rf'{UA[0].upper() + UA[1:]} постачаємо \1'),
        (r'через наш каталог «Оздоба» \(cas-develop\.com/ozdoba\): це позиції напряму з Китаю', UA),
        (r'готові позиції з каталогу «?Оздоба»? і з фабрик Китаю', f'готові позиції {UA}'),
        (r'напряму з фабрик, зокрема через Оздобу', UA),
        (r'Через каталог Оздоба замовляємо меблі й світло з фабрик Китаю', f'Замовляємо меблі й світло {UA}'),
        (r'(?:і|й|та) каталог «?Оздоба»?', f'і комплектацію {UA}'),
        (r'^«?Оздоба»?$', 'Комплектація з Китаю'),
        (r'через (?:наш |власний )?(?:каталог|розділ|напрям) «?Оздоба»?', UA),
        (r'[Чч]ерез «?Оздобу»?', UA),
        (r'(?:з|із) (?:нашого |власного )?(?:каталогу|розділу) «?Оздоба»?|з «?Оздоби»?', UA),
        (r'(?:в|у) (?:нашому )?(?:каталозі|розділі) «?Оздоба»?|в «?Оздобі»?', 'з фабрик Китаю'),
        (r'(?<=' + UA + r': )поставка з Китаю', 'поставка'),
        (r'на фабриках Китаю ' + UA, 'на фабриках Китаю'),
        (r'(?:(?:напряму )?з (?:фабрик )?Китаю |' + UA + ' )' + UA, UA),
        (UA + ' з фабрик Китаю', UA),
        (r'([.!?] |^)' + UA, lambda m: m.group(1) + UA[0].upper() + UA[1:]),
    ),
    'ru': COMMON + _r(
        (r'^Да\. В каталоге «?Оздоба»? минимальный заказ от \$10 000, поштучно не продаём\.$', f'Да, {RU}.'),
        (r'⌂(?:Минимальн\w* заказ|В (?:нашем )?каталоге «?Оздоба»? минимальный|Да, минимальный заказ|Да\. В каталоге «?Оздоба»? минимальный)[^.]*?\$10 000|⌂От \$10 000', None),
        (r'⌂(?:Поштучно|Условия простые:)', None),
        (r'Кухонную мебель можно заказать напрямую из Китая через Оздобу: поштучно мы не продаём, поставка из Китая занимает', f'Кухонную мебель можно заказать {RU}: поставка занимает'),
        (r'Мебель для офиса из Китая: что можно заказать, минимальный заказ от \$10 000 и 10 шт позиции, ', 'Мебель для офиса из Китая: что можно заказать, '),
        (r', а минимум — 10 единиц каждой позиции и заказ от \$10 000', ', а фабрики изготавливают партиями'),
        (r', комплектация из каталога «?Оздоба»? — от \$10 000', f', комплектация {RU}'),
        (r' \(минимальный заказ в Оздобе — от \$10 000\)', ''),
        (r'; минимальный заказ в (?:нашем )?каталоге «?Оздоба»? — (?:от )?\$10 000', ''),
        (r'(?<=[:—]) (?:минимальный )?заказ(?: —)? (?:от )?\$10 000, (?:(?:от|минимум) 10 (?:шт|единиц) (?:каждой )?позиции, )?(?:поштучно (?:мы )?не продаём, )?', ' '),
        (r'(?<=[:—]) поштучно (?:мы )?не продаём, ', ' '),
        (r'(?<=[:—]) от \$10 000, (?:минимум|от) 10 (?:шт|единиц) (?:каждой )?позиции(?:, |$)', ' '),
        (r' — от \$10 000, минимум 10 (?:шт|единиц) каждой позиции, ', ', '),
        (r' (?:и|с) минимальным заказом от \$10 000 и (?=поставкой)', ' с '),
        (r',? (?:и|с) минимальным заказом от \$10 000', ''),
        (r', минимальный заказ от \$10 000(?=[,.;]|$)', ''),
        (r', от \$10 000(?=\.)', ''),
        (r'скидк\w* за объём[^.]*\$10 000', None),
        (r'[Мм]инимальн\w* заказ[^.]*?\$10 000', None),
        (r'[Пп]оштучно (?:позиции |мы )?не прода(?:ём|ются)', None),
        (r'Каталог работает с партиями|Комплектацию из каталога «?Оздоба»? можно начать', None),
        (r'готовые ⓟ?комплекты под объектⓟ? из каталога|Посмотреть мебель[^.]*каталоге Оздоба', None),
        (r'⌂Скидка за объём действует', None),
        (r'Оплата и скидка за объём', 'Оплата'),
        (r', скидка за объём(?=\.)', ''),
        (r'Минимальный заказ, (сроки)', lambda m: m.group(1).capitalize()),
        (r'^(?:от )?\$10 000$', ''),
        (r'минимальный заказ — (?=поставка)', ''),
        (r': минимум 10 шт(?: каждой позиции)?\.', '.'),
        (r'Позиции Оздобы изготавливаются', 'Мебель изготавливается'),
        (r' — каталог «Оздоба»', ''),
        (r': каталог «?Оздоба»?$', ''),
        (r'Оздоба — комплектация из Китая', f'Комплектация {RU}'),
        (r'Услуга: Оздоба —', 'Услуга:'),
        (r'Оздоба — мебель из Китая', f'Мебель {RU}'),
        (r'(Мебель (?:и кабины )?для (?:офиса|open space)) — Оздоба', rf'\1 {RU}'),
        (r'Меблировка и Оздоба', 'Меблировка и комплектация'),
        (r'мебель из Китая и Оздоба', f'мебель {RU}'),
        (r'Каталог «?Оздоба»?: когда подойдёт', 'Комплектация с фабрик Китая: когда подойдёт'),
        (r'У CAS Development есть направление «?Оздоба»? — каталог света, мебели, декора и материалов, который можно посмотреть на сайте по адресу cas-develop\.com/ozdoba\.',
         f'CAS Development комплектует объекты {RU}: свет, мебель, декор и материалы.'),
        (r'Как проходит заказ через «?Оздобу»?', 'Как проходит заказ с фабрик Китая'),
        (r'работая через «?Оздобу»?,', 'работая с нами,'),
        (r' — «?Оздоба»?(?=:)', ''),
        (r'([Зз]аказы) Оздобы', r'\1'),
        (r'^(Заказы)$', r'\1 мебели из Китая'),
        (r'Позиции Оздобы', 'Мебель'),
        (r'у CAS есть каталог «?Оздоба»?: мебель, свет и текстиль из Китая', f'CAS комплектует {RU}: мебель, свет и текстиль'),
        (r'у нас есть каталог «?Оздоба»?:', f'мы комплектуем {RU}:'),
        (r'[Вв] каталоге «?Оздоба»? есть (всё)', rf'{RU[0].upper() + RU[1:]} поставляем \1'),
        (r'можно подобрать в каталоге «?Оздоба»?', f'можно подобрать и заказать {RU}'),
        (r'готовые позиции из каталога «?Оздоба»? и с фабрик Китая', f'готовые позиции {RU}'),
        (r'Через каталог Оздоба заказываем мебель и свет с фабрик Китая', f'Заказываем мебель и свет {RU}'),
        (r' \(каталог на украинском\)', ''),
        (r'(?:и|й) каталог «?Оздоба»?', f'и комплектацию {RU}'),
        (r'^«?Оздоба»?$', 'Комплектация из Китая'),
        (r'через (?:наш |собственное )?(?:каталог|раздел|направление) «?Оздоба»?', RU),
        (r'[Чч]ерез «?Оздобу»?', RU),
        (r'из (?:нашего |собственного )?(?:каталога|раздела) «?Оздоба»?|из «?Оздобы»?', RU),
        (r'в (?:нашем )?(?:каталоге|разделе) «?Оздоба»?|в «?Оздобе»?', 'с фабрик Китая'),
        (r'(?<=' + RU + r': )поставка из Китая', 'поставка'),
        (r'на фабриках Китая ' + RU, 'на фабриках Китая'),
        (r'(?:(?:напрямую )?(?:из|с) (?:фабрик )?Китая |' + RU + ' )' + RU, RU),
        (RU + ' с фабрик Китая', RU),
        (r'([.!?] |^)' + RU, lambda m: m.group(1) + RU[0].upper() + RU[1:]),
    ),
    'en': COMMON + _r(
        (r'^furniture from China: orders from \$10,000$', f'furniture {EN}'),
        (r'directly from China through the (ⓟ?)Ozdoba catalogue(ⓟ?)', r'\1directly from factories in China\2'),
        (r'⌂(?:(?:The )?[Mm]inimum order|In our catalogue, Ozdoba \(in Ukrainian\), the minimum|Our minimum order|From \$10,000|Yes\. The minimum order|Minimum order)[^.]*?\$10,000', None),
        (r'catalogue,? Ozdoba \(in Ukrainian\)', 'Ozdoba catalogue'),
        (r'They can be ordered directly from China: in the Ozdoba catalogue the minimum order is from \$10,000, we do not sell single items, and delivery takes', f'They can be ordered {EN}: delivery takes'),
        (r'(?<=[:—]) (?:minimum )?orders? from \$10,000, (?:(?:at least|minimum) 10 (?:pcs|units) per item, )?(?:we do not sell single items, )?', ' '),
        (r', the minimum is 10 units per item and orders start from \$10,000', ', and factories produce in batches'),
        (r' and the minimum order starts at \$10,000', ''),
        (r',? (?:with|and) a minimum order (?:of|from) \$10,000(?: and (?=delivery))?', lambda m: ' with ' if m.group(0).endswith('and ') else ''),
        (r', furniture from the Ozdoba catalogue with a minimum order of \$10,000', f', furniture {EN}'),
        (r' — from \$10,000, minimum 10 units per item, ', ', '),
        (r', from \$10,000(?=\.)', ''),
        (r'[Mm]inimum order[^.]*?\$10,000', None),
        (r'we do not sell single (?:items|pieces)', None),
        (r'Procurement from the Ozdoba catalogue can start|ready-made project kits', None),
        (r'^(?:from )?\$10,000$', ''),
        (r' — Ozdoba catalogue', ''),
        (r'Ozdoba is the procurement line of CAS Development — our own catalogue of furniture, lighting, sanitary ware and decor sourced directly from factories in China; you can browse it at Ozdoba(?: \(in Ukrainian\))?\.',
         f'CAS Development sources furniture, lighting, sanitary ware and decor {EN}.'),
        (r'Furniture from China and Ozdoba', f'Furniture {EN}'),
        (r'furniture from China and Ozdoba', f'furniture {EN}'),
        (r'Furnishing from China through Ozdoba', f'Procurement {EN}'),
        (r'How ordering through Ozdoba works', 'How ordering from factories in China works'),
        (r'working through Ozdoba,', 'working with us,'),
        (r'Your account and Ozdoba orders', 'Your account and orders'),
        (r'^Ozdoba orders$', 'Orders of furniture from China'),
        (r', Ozdoba orders,', ', furniture orders,'),
        (r'[Ss]ome (furniture, lighting and decor) can also be selected from our own Ozdoba catalogue', rf'Some \1 can also be sourced {EN}'),
        (r'That is what our Ozdoba catalogue is for: (furniture, lighting, sanitary ware, finishes and decor)', rf'That is why we source \1 {EN},'),
        (r'(?:through|via|from|in) (?:our |the )?(?:own )?Ozdoba (?:catalogue|line)', EN),
        (r'(?:through|via) Ozdoba', EN),
        (r'from China ' + EN, EN),
        (EN + ' (?:made to order at|from) factories in China', EN),
        (r'(?<=' + EN + r': )delivery from China', 'delivery'),
        (r'directly ' + EN, EN), (EN + ' ' + EN, EN), (EN + ', made to order at factories in China', EN + ', made to order'),
    ),
    'pl': COMMON + _r(
        (r'^wyposażenie z Chin od \$10 000$', f'wyposażenie {PL}'),
        (r'bezpośrednio z Chin przez (ⓟ?)katalog Ozdoba(ⓟ?)', r'\1bezpośrednio z fabryk w Chinach\2'),
        (r' ?\(ⓟ?opis po polskuⓟ?, katalog \(po ukraińsku\)\)', ''),
        (r' \((?:katalog )?\(?po ukraińsku\)?\)', ''),
        (r'⌂(?:Minimalne zamówienie|Od \$10 000|W naszym katalogu Ozdoba minimalne|Tak\. Minimalne)[^.]*?\$10 000|⌂Od \$10 000', None),
        (r'Można je zamówić bezpośrednio z Chin: w katalogu Ozdoba minimalne zamówienie to od \$10 000, nie sprzedajemy na sztuki, a dostawa', f'Można je zamówić {PL}: dostawa'),
        (r'(?<=[:—]) minimalne zamówienie od \$10 000, (?:nie sprzedajemy na sztuki, )?', ' '),
        (r',? (?:a|i) minimalne zamówienie to \$10 000', ''),
        (r' i minimalnym zamówieniem od \$10 000', ''),
        (r' z minimalnym zamówieniem od \$10 000 i (?=dostawą)', ' z '),
        (r', wyposażenie z katalogu Ozdoba od \$10 000', f', wyposażenie {PL}'),
        (r', od \$10 000(?=\.)', ''),
        (r'[Mm]inimalne zamówienie[^.]*?\$10 000|Nie sprzedajemy pojedynczych sztuk|Wyposażenie z katalogu Ozdoba zaczyna się', None),
        (r'gotowe komplety do projektów', None),
        (r'^(?:od )?\$10 000$', ''),
        (r' — katalog Ozdoba', ''),
        (r'^katalog Ozdoba$', ''),
        (r'Ozdoba to kierunek zaopatrzeniowy CAS Development — nasz własny katalog (mebli, oświetlenia, ceramiki sanitarnej i dekoracji) prosto z fabryk w Chinach; można go przejrzeć na stronie Ozdoba\.',
         rf'CAS Development kompletuje dostawy \1 {PL}.'),
        (r'Meble z Chin i Ozdoba', f'Meble {PL}'), (r'meble z Chin i Ozdoba', f'meble {PL}'),
        (r'Jak działa zamówienie przez Ozdoba', 'Jak działa zamówienie z fabryk w Chinach'),
        (r'przy pracy przez Ozdoba', 'przy pracy z nami'),
        (r'Konto klienta i zamówienia Ozdoba', 'Konto klienta i zamówienia'),
        (r'^Zamówienia Ozdoba$', 'Zamówienia mebli z Chin'), (r', zamówienia Ozdoba,', ', zamówienia mebli,'),
        (r'Do tego służy nasz katalog Ozdoba:', f'Dlatego kompletujemy {PL}:'),
        (r'(?:z|przez|w) (?:naszego |nasz |naszym )?(?:katalog(?:u)?|lini[aię]|linię) Ozdoba|przez (?:naszą )?linię Ozdoba', PL),
        (r'z Chin ' + PL, PL),
        (r'(?<=' + PL + r': )dostawa z Chin', 'dostawa'),
        (r'bezpośrednio ' + PL, PL), (PL + ' ' + PL, PL),
    ),
    'de': COMMON + _r(
        (r'^Ausstattung aus China ab \$10 000$', f'Ausstattung {DE}'),
        (r'⌂(?:Der Mindest\w+|Die Mindest\w+|Ab \$10 000)[^.]*?\$10 000|⌂Ab \$10 000', None),
        (r': Mindestbestellung ab \$10 000, ', ': '),
        (r', Ausstattung aus dem Ozdoba-Katalog ab \$10 000', f', Ausstattung {DE}'),
        (r', ab \$10 000(?=\.)', ''),
        (r'Mindest\w+[^.]*?\$10 000|Einzelstücke verkaufen wir nicht', None),
        (r'^(?:ab )?\$10 000$', ''),
        (r' — Katalog Ozdoba', ''),
        (r'Möbel aus China und Ozdoba', f'Möbel {DE}'),
        (r'Ausstattung aus China über Ozdoba', f'Ausstattung {DE}'),
        (r'Kundenkonto und Ozdoba-Bestellungen', 'Kundenkonto und Bestellungen'),
        (r'^Ozdoba-Bestellungen$', 'Möbelbestellungen aus China'), (r', Ozdoba-Bestellungen,', ', Möbelbestellungen,'),
        (r'über (?:unsere |unseren )?(?:Linie|Katalog) Ozdoba', DE),
        (r'(?:direkt )?(?:aus China|von Herstellern in China) ' + DE, DE),
    ),
    'fr': COMMON + _r(
        (r'^équipement de Chine dès \$10 000$', f'équipement {FR}'),
        (r'⌂(?:La commande minim\w+|\$10 000 dans le catalogue)[^.]*?(?:\$10 000|combinables)', None),
        (r' : commande minimale dès \$10 000, ', ' : '),
        (r', équipement du catalogue Ozdoba dès \$10 000', f', équipement {FR}'),
        (r'Commande dès \$10 000\.', None),
        (r'[Cc]ommande minim\w+[^.]*?\$10 000|Nous ne vendons pas à l’unité', None),
        (r'Le catalogue Ozdoba \(en ukrainien\) présente', None),
        (r'^(?:dès )?\$10 000$', ''),
        (r'Mobilier de Chine et Ozdoba', f'Mobilier {FR}'), (r'mobilier de Chine et Ozdoba', f'mobilier {FR}'),
        (r'Équipement de Chine avec Ozdoba', f'Équipement {FR}'),
        (r'Espace client et commandes Ozdoba', 'Espace client et commandes'),
        (r'^Commandes Ozdoba$', 'Commandes de mobilier de Chine'), (r', commandes Ozdoba,', ', commandes de mobilier,'),
        (r'(?:via|de) notre (?:ligne|catalogue) Ozdoba', FR),
        (r'(?:directement )?(?:de Chine|d’usines en Chine) ' + FR, FR),
    ),
    'es': COMMON + _r(
        (r'^equipamiento de China desde \$10 000$', f'equipamiento {ES}'),
        (r'⌂(?:El pedido mínimo|Desde \$10 000)[^.]*?(?:\$10 000|artículos)', None),
        (r': pedido mínimo desde \$10 000, ', ': '),
        (r', equipamiento del catálogo Ozdoba desde \$10 000', f', equipamiento {ES}'),
        (r'Pedido desde \$10 000\.', None),
        (r'[Pp]edido mínimo[^.]*?\$10 000|No vendemos piezas sueltas|En el catálogo Ozdoba \(en ucraniano\) puede ver', None),
        (r'^(?:desde )?\$10 000$', ''),
        (r'Muebles de China y Ozdoba', f'Muebles {ES}'), (r'muebles de China y Ozdoba', f'muebles {ES}'),
        (r'Equipamiento de China con Ozdoba', f'Equipamiento {ES}'),
        (r'Área personal y pedidos de Ozdoba', 'Área personal y pedidos'),
        (r'^Pedidos de Ozdoba$', 'Pedidos de muebles de China'), (r', pedidos de Ozdoba,', ', pedidos de muebles,'),
        (r'a través de nuestr[ao] (?:línea|catálogo) Ozdoba', ES),
        (r'(?:directamente )?(?:de China|de fábricas en China) ' + ES, ES),
    ),
    'pt': COMMON + _r(
        (r'^equipamento da China a partir de \$10 000$', f'equipamento {PT}'),
        (r'⌂(?:A encomenda mínima|A partir de \$10 000)[^.]*?(?:\$10 000|artigos)', None),
        (r': encomenda mínima a partir de \$10 000, ', ': '),
        (r', equipamento do catálogo Ozdoba a partir de \$10 000', f', equipamento {PT}'),
        (r'Encomenda a partir de \$10 000\.', None),
        (r'[Ee]ncomenda mínima[^.]*?\$10 000|Não vendemos peças avulsas|No catálogo Ozdoba \(em ucraniano\) pode ver', None),
        (r'^(?:a partir de )?\$10 000$', ''),
        (r'Móveis da China e Ozdoba', f'Móveis {PT}'), (r'móveis da China e Ozdoba', f'móveis {PT}'),
        (r'Equipamento da China com a Ozdoba', f'Equipamento {PT}'),
        (r'Área pessoal e encomendas Ozdoba', 'Área pessoal e encomendas'),
        (r'^Encomendas Ozdoba$', 'Encomendas de móveis da China'), (r', encomendas Ozdoba,', ', encomendas de móveis,'),
        (r'através d[oa] noss[ao] (?:linha|catálogo) Ozdoba', PT),
        (r'(?:diretamente )?(?:da China|de fábricas na China) ' + PT, PT),
    ),
    'zh': COMMON + _r(
        (r'Ozdoba 如何下单', '如何从中国工厂订购家具'),
        (r'Ozdoba 最低订单 \$10 000 起；每款至少 10 件，不单件销售。', ''),
        (r'在我们的 Ozdoba 产品目录中最低起订额为 \$10 000，可组合下单；不零售单件。', ''),
        (r'Ozdoba 目录中 \$10 000 起，可组合下单。我们不零售单件，只做项目配套。', ''),
        (r'不零售单件。起订金额 \$10 000，可组合不同产品。', ''),
        (r'起订金额 \$10 000，可组合下单，不零售单件。', ''),
        (r'：起订金额 \$10 000，交货周期', '：交货周期'),
        (r'，起订金额 \$10 000。', '。'),
        (r'，Ozdoba 目录配置 \$10 000 起。', '，家具配置直接从中国工厂采购。'),
        (r'可在 Ozdoba 目录（乌克兰语）中查看[^。]*。', ''),
        (r'^整体配置 \$10 000 起$', '中国工厂直采整体配置'),
        (r'^\$10 000 起$', ''),
        (r'我们的 Ozdoba 业务线与中国工厂直接合作', '我们与中国工厂直接合作'),
        (r'可通过我们的 Ozdoba 目录向工厂直接订购', '可直接从中国工厂订购'),
        (r'通过 Ozdoba 统一配置', '直接从中国工厂统一配置'),
        (r'Ozdoba 配置', '中国工厂直采配置'),
        (r'Ozdoba 家具配置', '中国工厂直采家具配置'),
        (r'个人账户和 Ozdoba 订单', '个人账户和订单'),
        (r'Ozdoba 订单、', '家具订单、'), (r'^Ozdoba 订单$', '中国家具订单'),
    ),
    'ar': COMMON + _r(
        (r': الحد الأدنى للطلب من \$10 000، والتوريد', '، والتوريد'),
        (r'الحد الأدنى للطلب[^.؛]*?\$10 000[^.]*\.', ''),
        (r'من \$10 000 في كتالوج Ozdoba مع إمكانية الجمع بين المنتجات\.', ''),
        (r'، والطلب من \$10 000\.', '.'),
        (r'، والتجهيز من كتالوج Ozdoba من \$10 000\.', '، والتجهيز مباشرة من مصانع الصين.'),
        (r': الحد الأدنى للطلب من \$10 000، والتوريد', ': والتوريد'),
        (r'لا نبيع (?:بالقطعة|القطع منفردة)\.?', ''),
        (r'يمكنك تصفّح الأثاث[^.]*Ozdoba[^.]*\.', ''),
        (r'^التجهيز من الصين بدءًا من \$10 000$', 'التجهيز مباشرة من مصانع الصين'),
        (r'^(?:الطلب من |من )?\$10 000$', ''),
        (r'الأثاث من الصين وOzdoba', 'الأثاث مباشرة من مصانع الصين'),
        (r'التجهيز من الصين عبر Ozdoba', 'التجهيز مباشرة من مصانع الصين'),
        (r'الحساب الشخصي وطلبات Ozdoba', 'الحساب الشخصي والطلبات'),
        (r'^طلبات Ozdoba$', 'طلبات الأثاث من الصين'), (r'، وطلبات Ozdoba،', '، وطلبات الأثاث،'),
        (r' عبر (?:خطّنا|كتالوج) Ozdoba', ''),
    ),
}
# Питання FAQ про саму Оздобу — прибираємо разом з відповіддю (нормалізований текст питання)
DROP_Q = re.compile(r'(?:купити|купить|замовити меблі|заказать мебель)[^?]*(?:Оздоб|одн)[^?]*(?:одну|одной|одну річ|одну вещь|однієї|одной)|'
                    r'знижки в Оздобі|скидки в Оздобе|оплатити замовлення в Оздобі|оплатить заказ в Оздобе|'
                    r'single item from Ozdoba|pojedyncz\w* (?:sztuk|rzecz)\w* (?:w|z) Ozdob|ein einzelnes Stück|un seul article chez Ozdoba|'
                    r'una sola pieza en Ozdoba|uma só peça na Ozdoba|قطعة واحدة من Ozdoba|可以只买一件|окремими позиціями|отдельными позициями|w Ozdobie jedną|'
                    r'мінімальне замовлення|минимальный заказ|minimum order|pedido mínimo|commande minimum|Mindest|minimalne zamówienie|'
                    r'最低起订|起订额|الحد الأدنى للطلب')


def _clean(t):
    t = re.sub(r'[ ]{2,}', ' ', t)
    t = re.sub(r' +([,.;:!?)»])', r'\1', t)
    t = re.sub(r'\( ', '(', t)
    t = re.sub(r'([,;:]){2,}', r'\1', t)
    t = re.sub(r'\(\s*\)', '', t)
    return t.strip(' ') if t.strip() == t.strip(' ') else t


def norm(t):
    return t.replace(NB, ' ').replace(NN, ' ')


def text(t, lang):
    """Рядок без назви Оздоби й мінімального замовлення (якщо змінювати нічого — той самий рядок)."""
    if not TRIG.search(norm(t)):
        return t
    n = norm(t)
    lead, trail = n[:len(n) - len(n.lstrip())], n[len(n.rstrip()):]
    x = n.strip()
    for rx, rep in RULES.get(lang, COMMON):
        x = rx.sub(rep, x)
    x = _clean(x)
    if x.endswith((':', ' —')) and not n.rstrip().endswith((':', '—')):
        x = x.rstrip(' :—')
    if x == n.strip():
        return t
    return (lead + x + trail) if x else ''


def _b64(t):
    return base64.b64encode(zlib.compress(t.encode('utf-8'), 9)).decode('ascii')  # стиснено: бюджет HTML 64 КБ (ui.py)


def _unb64(b):
    return zlib.decompress(base64.b64decode(b)).decode('utf-8')


def _wrap(orig, new):
    return '<!--ozt:' + _b64(orig) + '-->' + new + '<!--/ozt-->'


SHOW_RX = re.compile(r'<!--ozt:([A-Za-z0-9+/=]*)-->.*?<!--/ozt-->', re.S)


def show(s):
    """Повертає оригінальні тексти (OZDOBA_PUBLIC = True)."""
    if '<!--ozt:' not in s:
        return s
    return SHOW_RX.sub(lambda m: _unb64(m.group(1)), s)


_SKIP = re.compile(r'<script\b.*?</script>|<style\b.*?</style>|<template\b.*?</template>|<!--ozt:.*?<!--/ozt-->|<!--(?!ozh:|/ozh).*?-->|<title>.*?</title>|<textarea\b.*?</textarea>', re.S)
_INL = r'<span class="nw">[^<]*</span>|<!--ozh:[A-Za-z0-9+/=]+-->|<!--/ozh-->|</?(?:a|b|strong|em|i)\b[^>]*>'
_UNIT = re.compile(r'(?<![^>])(?:[^<]|' + _INL + r')+')
_INNER = re.compile(_INL)
_ATTR = re.compile(r'(\s(?:alt|title|aria-label|content|data-xs|data-service|placeholder)=")([^"]*)(")')
_TAG = re.compile(r'<[a-zA-Z][^<>]*>')
_DET = re.compile(r'<details\b[^>]*>\s*<summary\b[^>]*>(.*?)</summary>.*?</details>', re.S)
_Q_LD = re.compile(r',?\s*\{"@type":\s*"Question",\s*"name":\s*"((?:[^"\\]|\\.)*)",\s*"acceptedAnswer":\s*\{"@type":\s*"Answer",\s*"text":\s*"(?:[^"\\]|\\.)*"\}\}')
_LD = re.compile(r'<script type="application/ld\+json">.*?</script>', re.S)
_JSTR = re.compile(r'"((?:[^"\\]|\\.)*)"')


def _plain(h):
    return norm(_html.unescape(re.sub(r'<[^>]+>', '', h))).strip()


def _esc(t):
    return t.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def _unit(u, lang):
    """Шматок тексту з вбудованими тегами: теги → символи-місця (P), правила, назад; тег без пари (видалений текст) — прибираємо."""
    tags, toks = [], []
    for m in re.finditer(_INL + r'|[^<]+|<', u):
        x = m.group(0)
        if re.fullmatch(_INL, x):
            if x.startswith(('<!--ozh:', '<!--/ozh')):
                continue  # приховане посилання на Оздобу — уже текст; оригінал лишається в маркері ozt
            if x.startswith('<span class="nw">'):
                toks.append(_html.unescape(x[17:-7]))
                continue
            tags.append(x)
            toks.append(chr(0xE000 + len(tags) - 1))
        else:
            toks.append(_html.unescape(x).replace('⁠', ''))
    plain = ''.join(toks)
    new = text(plain, lang)
    if new == plain:
        return u
    # пари тегів: відкриваючий → закриваючий
    pair, st = {}, []
    for i, t in enumerate(tags):
        if t.startswith('</') or t == '<!--/ozh-->':
            if st:
                j = st.pop(); pair[i] = j; pair[j] = i
        else:
            st.append(i)
    have = {ord(c) - 0xE000 for c in new if '' <= c <= ''}
    out = []
    for c in new:
        if '' <= c <= '':
            i = ord(c) - 0xE000
            if i in pair and pair[i] not in have:
                continue
            out.append(tags[i])
        else:
            out.append(_esc(c))
    return _wrap(u, ''.join(out))


def _tag(t, lang):
    def one(m):
        v = _html.unescape(m.group(2))
        n = text(v, lang)
        return m.group(0) if n == v else m.group(1) + _esc(n).replace('"', '&quot;') + m.group(3)
    n = _ATTR.sub(one, t)
    return t if n == t else _wrap(t, n)


def _ld(block, lang):
    def q(m):
        return '' if DROP_Q.search(norm(m.group(1))) else m.group(0)
    b = _Q_LD.sub(q, block)
    b = re.sub(r'("mainEntity":\s*\[)\s*,\s*', r'\1', b)

    def js(m):
        v = m.group(1)
        if not TRIG.search(norm(v)) and not re.search(r'\\u00a0|\\u202f', v):
            return m.group(0)
        try:
            d = json.loads('"' + v + '"')
        except ValueError:
            return m.group(0)
        n = text(d, lang)
        return m.group(0) if n == d else json.dumps(n, ensure_ascii=False)
    b = _JSTR.sub(js, b)
    return block if b == block else _wrap(block, b)


def hide(s, lang):
    """Тексти сторінки без назви Оздоби й мінімального замовлення. Ідемпотентно."""
    if not TRIG.search(norm(s)):
        return s
    i = s.find('<body')
    head, body = (s, '') if i < 0 else (s[:i], s[i:])
    # head: <title>, meta-атрибути, JSON-LD
    head = re.sub(r'<title>(.*?)</title>', lambda m: m.group(0) if text(_html.unescape(m.group(1)), lang) == _html.unescape(m.group(1))
                  else _wrap(m.group(0), '<title>' + _esc(text(_html.unescape(m.group(1)), lang)) + '</title>'), head, count=1, flags=re.S)
    head = _LD.sub(lambda m: _ld(m.group(0), lang), head)
    head = re.sub(r'<!--ozt:.*?<!--/ozt-->|<meta\b[^>]*>', lambda m: m.group(0) if m.group(0).startswith('<!--') else _tag(m.group(0), lang), head, flags=re.S)
    if not body:
        return head
    body = _LD.sub(lambda m: _ld(m.group(0), lang), body)
    # факти hero «від $10 000 — мінімальне замовлення» і перелік знижок за обсягом — цілком
    body = re.sub(r'<!--ozt:.*?<!--/ozt-->|<div><b>([^<]*)</b><span>[^<]*</span></div>|<ul\b[^>]*>((?:<li>\d+ ?% — [^<]*</li>)+)</ul>',
                  lambda m: m.group(0) if m.group(0).startswith('<!--') or not MIN.search(norm(m.group(1) or m.group(2) or ''))
                  else _wrap(m.group(0), ''), body, flags=re.S)
    # питання FAQ про саму Оздобу — цілком
    body = re.sub(r'<!--ozt:.*?<!--/ozt-->|' + _DET.pattern, lambda m: m.group(0) if m.group(0).startswith('<!--')
                  or not DROP_Q.search(_plain(m.group(1))) else _wrap(m.group(0), ''), body, flags=re.S)
    out, pos = [], 0
    for m in list(_SKIP.finditer(body)) + [None]:
        seg = body[pos:m.start() if m else len(body)]
        if TRIG.search(norm(_html.unescape(seg))):
            seg = _TAG.sub(lambda t: _tag(t.group(0), lang) if TRIG.search(norm(_html.unescape(t.group(0)))) else t.group(0), seg)
            seg = re.sub(r'<!--ozt:.*?<!--/ozt-->|' + _UNIT.pattern, lambda u: u.group(0) if u.group(0).startswith('<!--ozt')
                         or not TRIG.search(norm(_html.unescape(_INNER.sub('', u.group(0))))) else _unit(u.group(0), lang), seg, flags=re.S)
        seg = re.sub(r'<(li|p|figcaption|span|b|strong)\b([^>]*)><!--ozt:([A-Za-z0-9+/=]*)--><!--/ozt--></\1>',
                     lambda e: _wrap('<' + e.group(1) + e.group(2) + '>' + _unb64(e.group(3)) + '</' + e.group(1) + '>', ''), seg)
        out.append(seg)
        if m:
            out.append(m.group(0))
            pos = m.end()
    return head + ''.join(out)


def leftovers(s):
    """Назва бренду або мінімальне замовлення у видимому тексті, атрибутах, <title> і JSON-LD (без маркерів ozt/ozh)."""
    s = re.sub(r'<!--.*?-->', '', s, flags=re.S)
    s = re.sub(r'<script(?! type="application/ld\+json")\b.*?</script>|<style\b.*?</style>', '', s, flags=re.S)
    s = re.sub(r'<b data-est="[^"]*">[^<]*</b>', '', s)  # меблювання 40 м² × $250 = $10 000 — не мінімум Оздоби
    s = re.sub(r'\s(?:href|src|srcset|id|class|data-[\w-]+)="[^"]*"', ' ', s)
    s = re.sub(r'(?<![\w/])#ozdoba\b|/ozdoba\b', '', s)
    out = []
    for m in TRIG.finditer(norm(_html.unescape(s))):
        a = norm(_html.unescape(s))
        out.append(a[max(0, m.start() - 70):m.end() + 50].replace('\n', ' '))
    return out


if __name__ == '__main__':
    ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import flags
    import subprocess
    files = [f for f in subprocess.run(['git', 'ls-files', '*.html'], cwd=ROOT, capture_output=True, text=True).stdout.split()
             if not flags.OZ_FILE.match(f) and not f.startswith(('kabinet', 'styleguide', 'tools/')) and f != 'kabinet.html']
    mode = sys.argv[1] if len(sys.argv) > 1 else '--check'
    bad = 0
    for f in files:
        s = open(os.path.join(ROOT, f), encoding='utf-8').read()
        if mode == '--dry':
            lang = (re.search(r'<html[^>]*\blang="([a-z]{2})', s) or [0, 'uk'])[1]
            n = hide(s, lang)
            for m in SHOW_RX.finditer(n):
                o = _unb64(m.group(1))
                new = m.group(0)[m.group(0).index('-->') + 3:-len('<!--/ozt-->')]
                a = re.split(r'(?<=[.!?。؟"])\s*', _plain(o)); b = set(re.split(r'(?<=[.!?。؟"])\s*', _plain(new)))
                for x in a:
                    if x not in b and TRIG.search(x):
                        print(f'{f}\t{x[:300]}')
                if not _plain(new):
                    print(f'{f}\t   (прибрано цілком)')
                else:
                    sa = set(a)
                    for y in re.split(r'(?<=[.!?。؟"])\s*', _plain(new)):
                        if y not in sa:
                            print(f'{f}\t   → {y[:300]}')
            s = n
        lo = leftovers(s)
        if lo and not flags.OZDOBA_PUBLIC:
            bad += 1
            for x in lo:
                print(f'⚠ {f}: …{x}…')
    if not flags.OZDOBA_PUBLIC:
        print(('❌' if bad else '✓') + f' Оздоба в текстах публічних сторінок: {bad} файлів')
    sys.exit(1 if bad and mode == '--check' else 0)
