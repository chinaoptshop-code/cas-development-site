# OG-картинки (img/og/<slug>.jpg)

Генератор Open Graph картинок 1200×630 для сторінок `/proekty/*.html` і `/blog/*.html`
(Osocor пропускається). Тека `tools/` не деплоїться; HTML скрипт не змінює —
підключати `og:image` на сторінках окремо.

## Як перегенерувати

```bash
python3 -m venv /tmp/ogvenv && /tmp/ogvenv/bin/pip install pillow
/tmp/ogvenv/bin/python tools/og/make-og.py            # усі сторінки
/tmp/ogvenv/bin/python tools/og/make-og.py diamond    # лише вказані slug
```

- Назва — з `<title>` без « | CAS Development». У проєктів «Назва — опис» → назва великим, опис рядком нижче.
- Фото проєкту — його `og:image` (або перше `img/…` на сторінці). Статті блогу власних фото не мають —
  фото задано вручну в `BLOG_PHOTOS` у `make-og.py` (з повʼязаної послуги чи проєкту за темою).
- Шрифт — Cormorant Garamond (`fonts/`, ліцензія SIL OFL 1.1, `fonts/OFL.txt`), з Google Fonts (google/fonts, ofl/cormorantgaramond).
- Знак — текстовий «CAS DEVELOPMENT» (логотип SVG не рендериться й не перемальовується).
- JPEG progressive + optimize, якість підбирається автоматично, щоб файл був ≤ 120 КБ.

## Slug → фото

| slug | фото |
|---|---|
| a-frame-house | `img/p/1g-E1m6cFJ9kvH-900.webp` |
| diamond | `img/p/1iGcqtsUqLNWbB-900.webp` |
| dolls-salon | `img/p/1rX1eAn3-aYuHF-900.webp` |
| dubai-villa | `img/p/1uBxYPk7W36Rp0-900.webp` |
| edelweiss | `img/p/1DL1BY7Tg6L5B5-900.webp` |
| hoda-estate | `img/p/1FRa0FI6iMHK5L-900.webp` |
| hodos-villa | `img/p/1Grj8_m7MJwsbE-900.webp` |
| house-150 | `img/p/1F4OovwNYQPfoF-900.webp` |
| kitana-beach | `img/p/1A9yy4nI-gf9h3-900.webp` |
| linden-penthouse | `img/p/1MslU7S5X8gIEp-900.webp` |
| monpark | `img/p/1jKOiN3xyCjZCL-900.webp` |
| office-chicago | `img/p/16fKqdFifd2emf-900.webp` |
| petrivtsi-house | `img/p/1NVeaQcV2TZSN5-900.webp` |
| pidgirland | `img/p/1FiLI9kKE-C87h-900.webp` |
| smart-villa | `img/p/1kHF6cjS291puf-900.webp` |
| tetris-hall | `img/p/1xqY1KZo2JY5xq-900.webp` |
| usa-house | `img/p/18V9n96tOhjKjh-900.webp` |
| yablu-rest | `img/p/1GqqKXz4Ax1_cM-900.webp` |
| yacht-restaurant | `img/p/18ej1fH-11uoyr-900.webp` |
| yacht-vip | `img/p/1_0wYN-6Q8LZFX-900.webp` |
| avtorskyi-nahliad-navishcho | `img/p/1DL1BY7Tg6L5B5-900.webp` |
| dyzain-malenkoi-kvartyry-zberihannia | `img/p/1YQyhjEui9fb6v-900.webp` |
| dyzain-restoranu-z-choho-pochaty | `img/p/1OGn3TXnLkQenE-900.webp` |
| etapy-remontu-kvartyry-pid-kliuch | `img/p/1bXytwftMuIHBN-900.webp` |
| mebli-z-kytaiu-dlia-interieru | `img/p/1iGcqtsUqLNWbB-900.webp` |
| remont-ofisu-pid-kliuch-shcho-vrakhuvaty | `img/p/13a8ks6jQlZ5LY-900.webp` |
| shcho-vkhodyt-u-dyzain-proekt-interieru | `img/p/1MslU7S5X8gIEp-900.webp` |
| skilky-koshtuie-dyzain-proekt-kvartyry-kyiv | `img/p/1_0wYN-6Q8LZFX-900.webp` |
| skilky-koshtuie-remont-budynku-pid-kliuch | `img/p/1F4OovwNYQPfoF-900.webp` |
| skilky-koshtuie-remont-v-novobudovi-kyiv | `img/p/1xqY1KZo2JY5xq-900.webp` |
| suchasnyi-minimalizm-teplyi-interier | `img/p/1Grj8_m7MJwsbE-900.webp` |
| yak-splanuvaty-bazu-vidpochynku | `img/p/1XdhtH1mjWRTli-900.webp` |
| yak-vybraty-dyzainera-interieru | `img/p/1jKOiN3xyCjZCL-900.webp` |
