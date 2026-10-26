# 3D-тури CAS (власний переглядач замість Kuula)

Безкоштовно для нас і клієнтів: статичні сторінки на cas-develop.com, без підписок і реєстрації.
Перегляд: ноутбук — тягнути мишкою; телефон — пальцем або поворотом телефона; VR-окуляри (Quest тощо) — кнопка VR,
переходи — контролером або поглядом (наведення 1,2 с). Стрілки на фото — переходи між кімнатами, «☰ Кімнати» — меню.

## Новий тур
1. 360-фото (equirect 2:1, напр. 6000×3000 з Insta360/Ricoh) — в одну теку; імена файлів = порядок і назви кімнат
   (`1-vitalnia.jpg`, `2-kukhnia.jpg` …).
2. `python3 tools/tours/build.py new <тека> <slug> "Назва туру" --desc "Опис"` — стискає фото до 4096 px (без GPS/EXIF),
   створює `tools/tours/tours/<slug>.json` і сторінку `/tury/<slug>`. Переходи-чернетки: «далі» попереду, «назад» позаду.
3. Редагування на сайті (без JSON вручну): увійти в https://cas-develop.com/kabinet/admin → відкрити
   `/tury/<slug>?edit=1`. Панель: назва туру, «Прихований», назва кімнати, ▲▼ порядок, «Цей напрям — стартовий»,
   «Зробити першою й обкладинкою», стрілки (вибрати кімнату → клік по фото там, де двері; ✕ — видалити).
   **Зберегти на сайт** — коміт через адмінку (/api/admin/repo, файл `tools/tours/tours/<slug>.json`), перезбірка й деплой 2–4 хв.
   Без адмінки (локально) — кнопка **JSON** завантажує файл → покласти в `tools/tours/tours/` → `build.py pages`.
4. `"hidden": true` у JSON — тур не показується у списку /tury і не індексується (посилання для клієнта працює).

## Вставка на сайт / в портфоліо
```html
<iframe src="https://cas-develop.com/tury/<slug>?embed=1" width="100%" height="520" style="border:0"
  allow="xr-spatial-tracking; gyroscope; accelerometer; fullscreen" allowfullscreen loading="lazy"></iframe>
```
`?scene=<id>` — відкрити з конкретної кімнати. Для /tury/* у `_headers` знято X-Frame-Options (можна вставляти на інші сайти).

## Технічно
A-Frame 1.6 (MIT, `/assets/tours/aframe.min.js`, WebXR), `/assets/tours/tour.v1.js|css`, фото — `/img/tury/<slug>/`.
Демо `demo` — CC0-панорами Poly Haven (hotel_room, studio_small_09), прихований.
