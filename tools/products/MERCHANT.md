# Фід Оздоби для Google Merchant Center / Pinterest / Meta

Файл: `https://cas-develop.com/ozdoba/feed.xml` (RSS 2.0 з `g:`-полями), оновлюється `python3 tools/products/build.py` разом із каталогом.
Поля: id (`ozd-<id>`), title, description (з мінімумом 10 шт позиції, мін. замовленням $500 і строком 30–60 днів), link, image_link (+ додаткові),
price в UAH, availability in_stock, condition new, brand «CAS Ozdoba», identifier_exists no (без GTIN), google_product_category, product_type, multipack 10.
Товари без фото або без ціни у фід не потрапляють.

## Як підключити (робить Михайло, акаунти не створюємо автоматично)
1. **Google Merchant Center** (merchants.google.com, акаунт china.opt.shop): Products → Feeds → Add primary feed → країна Україна, мова uk →
   «Scheduled fetch» → URL `https://cas-develop.com/ozdoba/feed.xml`, щодня. Підтвердити сайт (вже є в Search Console → Website → Claim).
   Shipping/Return policies: доставка НП 450 ₴, безкоштовно від 20 000 ₴; повернення — за договором/рахунком (менеджер).
2. **Pinterest Business** → Catalogues → Add data source → той самий URL (формат RSS/XML приймається).
3. **Meta Commerce Manager** → Catalogue → Data sources → Scheduled feed → той самий URL.
Перевірка: відкрити URL у браузері — має бути XML без помилок; у Merchant Center — Diagnostics після першого завантаження.
