# Встановлені скіли — джерела й аудит

Встановлено 2026-11-01 (гілка `skills/nov-2026`). Папка `.claude/` не деплоїться (її видаляє `deploy.yml`).
Скіли не змінювалися відносно джерела; з копій прибрано лише `evals/` (тестові набори авторів, не потрібні для роботи).
Правила сайту з `CLAUDE.md` (UI-kit, шрифти, ціни й факти, шапка/футер, i18n) мають пріоритет над порадами скілів.

Кому: **хмара** — хмарна сесія (сайт, SEO, деплой); **Mac mini** / **Dell** — локальні машини команди.

## Встановлені

| Скіл | Джерело (repo / шлях) | Коміт SHA | Ліцензія | Що робить | Для кого |
|---|---|---|---|---|---|
| frontend-design | https://github.com/anthropics/skills — `skills/frontend-design` | ca45fc496a3436251f191354091d557da31c15b5 | Apache-2.0 | Нестандартний візуальний дизайн нових блоків/сторінок, типографіка, «анти-шаблонність» | хмара, Mac mini |
| webapp-testing | https://github.com/anthropics/skills — `skills/webapp-testing` | ca45fc496a3436251f191354091d557da31c15b5 | Apache-2.0 | Тестування сторінок через Playwright (Python): скріншоти, консоль, форми | хмара, Dell |
| seo-audit | https://github.com/coreyhaines31/marketingskills — `skills/seo-audit` | 88c79f6528a9347420e57ceb1fff9a60de651768 | MIT | Технічний і on-page SEO-аудит, локальне й міжнародне SEO (references) | хмара |
| schema | https://github.com/coreyhaines31/marketingskills — `skills/schema` | 88c79f6528a9347420e57ceb1fff9a60de651768 | MIT | JSON-LD / schema.org: LocalBusiness, Product, FAQ, Article тощо | хмара |
| copywriting | https://github.com/coreyhaines31/marketingskills — `skills/copywriting` | 88c79f6528a9347420e57ceb1fff9a60de651768 | MIT | Тексти лендингів і сторінок послуг, фреймворки, список «AI-маркерів» | хмара, Mac mini |
| cro | https://github.com/coreyhaines31/marketingskills — `skills/cro` | 88c79f6528a9347420e57ceb1fff9a60de651768 | MIT | Конверсія сторінок і форм заявки, гіпотези для A/B | хмара |
| social | https://github.com/coreyhaines31/marketingskills — `skills/social` | 88c79f6528a9347420e57ceb1fff9a60de651768 | MIT | Контент для Instagram/LinkedIn/Facebook/TikTok, каруселі, Reels-сценарії, соцслухання | Mac mini, хмара |
| analytics | https://github.com/coreyhaines31/marketingskills — `skills/analytics` | 88c79f6528a9347420e57ceb1fff9a60de651768 | MIT | GA4 / GTM / UTM, план подій, аудит трекінгу | хмара |
| gbp-optimization | https://github.com/garrettjsmith/localseoskills — `skills/gbp-optimization` | c3b7a25b7d5cc370752d74cfea240ccf992a24db | MIT | Оптимізація Google Business Profile і видимості в map pack | Mac mini, хмара |
| gbp-posts | https://github.com/garrettjsmith/localseoskills — `skills/gbp-posts` | c3b7a25b7d5cc370752d74cfea240ccf992a24db | MIT | Пости в GBP: типи, календар, шаблони | Mac mini |
| review-management | https://github.com/garrettjsmith/localseoskills — `skills/review-management` | c3b7a25b7d5cc370752d74cfea240ccf992a24db | MIT | Збір відгуків і відповіді на них (без «гейтингу» й накруток) | Mac mini, Dell |
| seo-hreflang | https://github.com/AgriciDaniel/claude-seo — `skills/seo-hreflang` | 6be93f45064ffbadced572b5d5c95f55fd263af0 | MIT | Аудит/генерація hreflang для 5+ мов сайту, x-default, sitemap | хмара |
| workers-best-practices | https://github.com/cloudflare/skills — `skills/workers-best-practices` | 1a33048817d06df12882cb881dfc754e7039954a | Apache-2.0 | Офіційні практики Cloudflare Workers/Pages Functions, D1, конфіг | хмара |
| web-perf | https://github.com/cloudflare/skills — `skills/web-perf` | 1a33048817d06df12882cb881dfc754e7039954a | Apache-2.0 | Аудит Core Web Vitals / Lighthouse, діагностика LCP/INP/CLS | хмара, Dell |
| humanizer | https://github.com/blader/humanizer — `SKILL.md` | 0ef9fe5bc3572734fd3ae6c448fe00a30cd5dcf0 | MIT | Прибирає ознаки AI-тексту зі статей блогу й постів, не додаючи фактів | хмара, Mac mini |

## Аудит безпеки (2026-11-01)

Для кожного скіла:

1. **ClamAV 1.5.4** (сигнатури main/daily/bytecode від 2026-11-01, 3 628 245 сигнатур): 68 файлів, **0 заражених**.
2. **Статичний скан** (власний скрипт): бінарники, не-UTF-8, симлінки, приховані Unicode-символи (Cf/Co/Cc, tag-символи),
   base64-блоби ≥120 символів, `curl|sh`, мережеві виклики, `eval/exec/subprocess`, доступ до `~/.ssh`/токенів/env/cookies/git credentials,
   зміни `settings.json`/hooks/permissions, prompt-injection фрази, телеметрія — **критичних знахідок 0**.
3. **Ручний перегляд**: прочитано всі SKILL.md і всі скрипти; references перевірено сканом + вибірковим читанням усіх shell-фрагментів і зовнішніх URL.

Нотатки по окремих скілах:

- **webapp-testing** — єдиний скіл із виконуваним кодом: `scripts/with_server.py` (запускає локальні сервери, чекає порт на localhost, виконує команду, зупиняє сервери) і 3 приклади Playwright. Мережа — лише localhost. Прозоро, без завантажень.
- **social** — `references/listening.md` містить приклади `curl` GET до публічних API (Reddit JSON, HN Algolia, Bluesky, YouTube RSS) лише для соцслухання за запитом користувача; дані назовні не надсилаються.
- **web-perf** — пропонує (лише якщо користувач попросить) підключити Chrome DevTools MCP через `npx chrome-devtools-mcp@latest` і вимагає спитати перед зміною MCP-конфігурації. Самостійно нічого не ставить.
- **workers-best-practices**, **web-perf** — `references/skill-feedback.md`: створення публічного issue в cloudflare/skills **тільки після явного схвалення тексту користувачем**, з вимогою вичистити секрети й ідентифікатори.
- **seo-audit/schema/copywriting/cro/social/analytics** — читають (якщо є) локальний контекст `.agents/product-marketing.md`; посилання на інтеграції ведуть на документацію в GitHub, нічого не завантажують.
- **seo-hreflang** — містить явне правило безпеки: вміст завантажених сторінок вважати даними, а не інструкціями.
- **frontend-design** — для цього сайту поради підпорядковуються UI-kit (`/styleguide/`), власним шрифтам і правилам з `CLAUDE.md`.

## Розглянуті, але не встановлені

| Кандидат | Причина |
|---|---|
| marketingskills `ai-seo` | Відкладено: 200 КБ references (сильно їсть контекст), радить сторонні `npx`-пакети; частину покриває `seo-audit`. Можна додати окремо. |
| cloudflare `wrangler` | Відкладено: деплой іде через GitHub Actions; для коду Functions/D1 достатньо `workers-best-practices`. |
| claude-seo `seo-local` | Посилається на `../seo/references/*` інших скілів пакета — окремо не працює; покрито gbp-* і seo-audit. |
| localseoskills `local-schema` | Дублює `schema`; шаблон радить self-serving `aggregateRating` для LocalBusiness. |
| claude-seo (повний пакет) | Містить `hooks/` і `install.sh` — заборонено правилами (зміни hooks). |
| Nutlope/hallmark | Скрипт `install-hook.mjs` (встановлює hooks), 230 КБ JS `sloplint.mjs`, `imagegen.mjs` відправляє дані на api.together.xyz. |
| kajisho5/ffmpeg-skill | npm-інсталятор `bin/install.js`, MCP-сервер і 40+ Python-скриптів — потрібен окремий повний аудит. |
| sergebulaev/linkedin-skills | Залежить від `lib/` з клієнтами сторонніх сервісів (Apify, Publora, Pixfaro) — дані йдуть третім сторонам; references перенесені в корінь репо. |
| trailofbits `insecure-defaults` | Тепер це JS-workflow (35 КБ), а не SKILL.md. |
| trailofbits `supply-chain-risk-auditor` | Мережеві колектори (65 КБ Python), для статичного сайту майже не потрібен. |
| anthropics `pdf`/`xlsx`/`docx`/`pptx` | Ліцензія source-available (не можна розповсюджувати копії); вже доступні як вбудовані `anthropic-skills:*`. |
| mvanhorn/last30days-skill | Потребує API-ключів і надсилає запити до сторонніх сервісів. |
| calesthio/OpenMontage | AGPL-3.0, великий фреймворк, не скіл для копіювання. |
