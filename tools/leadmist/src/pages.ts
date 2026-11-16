// Статичні сторінки Worker'а: лендинг, умови (чернетка), сторінка згоди клієнта. Бренд LeadMist / ЛідМіст.

import { CONSENT_VERSION, LEAD_TERMS_VERSION } from './constants';
import { decryptText } from './crypto';
import { type DealRow, leadById, memberById, one, parseList } from './db';
import type { Env } from './env';
import { dict, escapeHtml as e, label } from './i18n';
import { contactKey, maskContact } from './pii';
import { type Ctx, dealByToken, declineConsent, grantConsent, latestConsent, revokeConsent } from './services';
import { Telegram } from './telegram';

const d = dict();

const CSS = `
:root{--bg:#f6f5f2;--fg:#1d1f22;--mut:#5d6168;--card:#fff;--line:#e2e0da;--acc:#1f5f5b;--acc-fg:#fff;--warn:#8a4b12;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#15171a;--fg:#ecebe7;--mut:#a3a7ad;--card:#1e2125;--line:#30343a;--acc:#5fb3ab;--acc-fg:#0d1413;--warn:#e0a46a;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#15171a;--fg:#ecebe7;--mut:#a3a7ad;--card:#1e2125;--line:#30343a;--acc:#5fb3ab;--acc-fg:#0d1413;--warn:#e0a46a;color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.w{max-width:44rem;margin:0 auto;padding:1.5rem 16px 3rem}
header{display:flex;align-items:center;gap:.6rem;padding:1rem 16px;max-width:44rem;margin:0 auto}
.logo{display:inline-grid;place-items:center;width:2rem;height:2rem;border-radius:.6rem;background:var(--acc);color:var(--acc-fg);font-weight:700}
.nm{font-weight:650;letter-spacing:.01em}
h1{font-size:clamp(1.6rem,4.5vw,2.3rem);line-height:1.2;margin:.5rem 0 1rem}
h2{font-size:1.15rem;margin:2rem 0 .6rem}
p,li{color:var(--fg)}
.mut{color:var(--mut)}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:1.1rem 1.2rem;margin:1rem 0}
ol,ul{padding-left:1.2rem}
li{margin:.35rem 0}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:.7rem 1.4rem;border-radius:999px;border:1px solid var(--acc);background:var(--acc);color:var(--acc-fg);font:inherit;font-weight:600;text-decoration:none;cursor:pointer}
.btn.ghost{background:transparent;color:var(--acc)}
.row{display:flex;flex-wrap:wrap;gap:.75rem;margin:1.25rem 0}
dl{display:grid;grid-template-columns:minmax(7rem,auto) 1fr;gap:.4rem 1rem;margin:0}
dt{color:var(--mut)}dd{margin:0}
.warn{color:var(--warn)}
footer{max-width:44rem;margin:0 auto;padding:1.5rem 16px 2.5rem;color:var(--mut);font-size:.9rem;border-top:1px solid var(--line)}
@media (max-width:480px){dl{grid-template-columns:1fr}dt{margin-top:.4rem}}
`;

function page(title: string, body: string, opts: { noindex?: boolean } = {}) {
  return `<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(title)}</title><meta name="description" content="ЛідМіст — закритий клуб компаній, що передають одна одній клієнтів за комісію.">
${opts.noindex ? '<meta name="robots" content="noindex,nofollow">' : ''}<style>${CSS}</style></head><body>
<header><span class="logo" aria-hidden="true">Л</span><span class="nm">ЛідМіст <span class="mut">· LeadMist</span></span></header>
<main class="w">${body}</main>
<footer>© 2026 ЛідМіст · <a href="/terms">Умови й обробка даних</a></footer></body></html>`;
}

export function landing(env: Env) {
  const bot = `https://t.me/${encodeURIComponent(env.BOT_USERNAME)}`;
  return page('ЛідМіст — обмін клієнтами', `
<h1>Передавайте клієнтів, яких не берете, і отримуйте 5–15% від угоди</h1>
<p class="mut">Закритий клуб перевірених компаній дизайну, архітектури, будівництва, ремонту й нерухомості в Україні.</p>
<div class="row"><a class="btn" href="${bot}">Вступити через Telegram</a><a class="btn ghost" href="/terms">Умови</a></div>
<h2>Як це працює</h2>
<ol>
<li>Ви створюєте в боті анонімну картку: тип робіт, регіон, площа, бюджет, строки. Без імен і телефонів.</li>
<li>Бот показує її п’ятьом найвідповіднішим учасникам на 24 години, потім — усім відповідним.</li>
<li>Компанія натискає «Взяти» і підтверджує умови одноразовим кодом.</li>
<li>Клієнт за посиланням погоджується на передачу контакту саме цій компанії. Лише тоді контакт відкривається.</li>
<li>Компанія оновлює статус угоди, а з кожної оплати клієнта нараховується ваша комісія.</li>
</ol>
<h2>Скільки це коштує</h2>
<div class="card"><dl>
<dt>Рекомендувачу</dt><dd>5–15% від суми договору, відсоток задаєте ви. Платить компанія, що взяла клієнта.</dd>
<dt>Платформі</dt><dd>15% від комісії рекомендувача, мінімум $50 за угоду. Платить отримувач.</dd>
<dt>Клієнту</dt><dd>Безкоштовно. Ціна для нього не змінюється.</dd>
</dl></div>
<h2>Чому це безпечно</h2>
<ul>
<li>Умови фіксуються до розкриття контакту: версія тексту, час, одноразовий код.</li>
<li>Контакт клієнта зберігається зашифровано й передається лише з його згоди.</li>
<li>Учасників перевіряє модератор: ЄДР, сайт, рекомендації.</li>
<li>Пряма угода в обхід платформи заборонена 24 місяці.</li>
</ul>`);
}

export function terms(env: Env) {
  return page('Умови — ЛідМіст', `
<h1>Умови користування (чернетка)</h1>
<p class="warn">Чернетка для перевірки юристом. Остаточний текст оферти буде опубліковано до запуску.</p>
<div class="card"><dl>
<dt>Оферта платформи</dt><dd>${e(env.TERMS_VERSION)}</dd>
<dt>Додаток по ліду</dt><dd>${LEAD_TERMS_VERSION}</dd>
<dt>Згода клієнта</dt><dd>${CONSENT_VERSION}</dd>
</dl></div>
<h2>Основне</h2>
<ul>
<li>Учасники — лише ФОП і юридичні особи, перевірені модератором.</li>
<li>Комісія рекомендувачу (5–15%) нараховується з фактично отриманих від клієнта оплат за договором, пропорційно траншам. Виплата — напряму рекомендувачу протягом 5 робочих днів після кожного траншу.</li>
<li>Плата платформи — 15% від комісії рекомендувача, мінімум $50 за угоду; платить отримувач.</li>
<li>Заборонено укладати угоду з клієнтом, отриманим через платформу, без сплати комісії протягом 24 місяців від розкриття контакту, зокрема через пов’язаних осіб. Штраф — подвійна сума комісії й виключення з клубу.</li>
<li>Якщо клієнт уже був у базі отримувача до розкриття — заява модератору протягом 48 годин із доказом.</li>
<li>Картка ліда не містить персональних даних. Контакт клієнта шифрується й розкривається лише після акцепту умов отримувачем і згоди клієнта.</li>
<li>Строк зберігання контакту — 24 місяці, далі зберігається лише хеш для захисту від обходу.</li>
</ul>`);
}

function consentBody(token: string, referrer: string, receiver: { company: string; categories: string; regions: string }, masked: string) {
  return `
<h1>Згода на передачу ваших контактів</h1>
<p>Компанія <b>${e(referrer)}</b> пропонує передати ваш контакт компанії <b>${e(receiver.company)}</b>, щоб вона зв’язалася з вами щодо вашого запиту.</p>
<div class="card"><dl>
<dt>Кому</dt><dd>${e(receiver.company)}<br><span class="mut">${e(receiver.categories)} · ${e(receiver.regions)}</span></dd>
<dt>Які дані</dt><dd>Ім’я та контакт, які ви повідомили компанії ${e(referrer)} (${e(masked)})</dd>
<dt>Мета</dt><dd>Зв’язатися з вами й підготувати пропозицію щодо робіт</dd>
<dt>Строк</dt><dd>До 24 місяців, далі — лише знеособлений хеш</dd>
<dt>Ваші права</dt><dd>Відкликати згоду, отримати інформацію про обробку, вимагати видалення — на цій сторінці або в компанії ${e(referrer)}</dd>
</dl></div>
<p class="mut">Для вас послуга безкоштовна, ціна робіт від передачі контакту не змінюється.</p>
<form method="post" action="/c/${e(token)}" class="row">
<button class="btn" name="action" value="agree">Погоджуюся</button>
<button class="btn ghost" name="action" value="decline">Не погоджуюся</button>
</form>
<p class="mut" style="font-size:.85rem">Версія тексту: ${CONSENT_VERSION}</p>`;
}

function msgPage(title: string, text: string, extra = '') {
  return page(title, `<h1>${e(title)}</h1><p>${e(text)}</p>${extra}`, { noindex: true });
}

async function consentContext(env: Env, deal: DealRow) {
  const lead = (await leadById(env.DB, deal.lead_id))!;
  const referrer = (await memberById(env.DB, lead.referrer_id))!;
  const receiver = (await memberById(env.DB, deal.receiver_id))!;
  const c = await one<{ enc_payload: string }>(env.DB, 'SELECT enc_payload FROM lead_contacts WHERE lead_id = ?', lead.id);
  let masked = '—';
  if (c) {
    const key = contactKey(await decryptText(env.CONTACT_KEY, c.enc_payload));
    if (key) masked = maskContact(key);
  }
  return {
    referrer: referrer.company,
    receiver: {
      company: receiver.company,
      categories: parseList(receiver.categories).map((x) => label(d, 'cat', x)).join(', '),
      regions: parseList(receiver.regions).map((x) => label(d, 'region', x)).join(', '),
    },
    masked,
  };
}

const html = (body: string, status = 200) => new Response(body, {
  status,
  headers: {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  },
});

export async function consentGet(env: Env, token: string) {
  const deal = await dealByToken(env.DB, token);
  if (!deal) return html(msgPage('Посилання недійсне', 'Перевірте посилання або зверніться до компанії, яка його надіслала.'), 404);
  const consent = await latestConsent(env.DB, deal.id);
  if (consent?.granted_at && !consent.revoked_at) {
    return html(msgPage('Згоду надано', 'Дякуємо! Компанія зв’яжеться з вами найближчим часом.',
      `<form method="post" action="/c/${e(token)}" class="row"><button class="btn ghost" name="action" value="revoke">Відкликати згоду</button></form>`));
  }
  if (consent?.revoked_at) return html(msgPage('Згоду відкликано', 'Ваші дані більше не передаватимуться.'));
  if (!deal.active || deal.status !== 'reserved') return html(msgPage('Запит неактуальний', 'Цей запит уже закрито.'), 410);
  const c = await consentContext(env, deal);
  return html(page('Згода на передачу контактів — ЛідМіст', consentBody(token, c.referrer, c.receiver, c.masked), { noindex: true }));
}

export async function consentPost(env: Env, token: string, req: Request, now = new Date()) {
  const deal = await dealByToken(env.DB, token);
  if (!deal) return html(msgPage('Посилання недійсне', 'Перевірте посилання.'), 404);
  const form = await req.formData().catch(() => null);
  const action = String(form?.get('action') ?? '');
  const ctx: Ctx = { env, db: env.DB, tg: new Telegram(env), now };
  const meta = { ip: req.headers.get('cf-connecting-ip'), ua: (req.headers.get('user-agent') ?? '').slice(0, 300) };
  if (action === 'agree') {
    const r = await grantConsent(ctx, deal, 'link', { ...meta, actor: 'client' });
    if (!r.ok && r.reason === 'inactive') return html(msgPage('Запит неактуальний', 'Цей запит уже закрито.'), 410);
    return html(msgPage('Згоду надано', 'Дякуємо! Компанія зв’яжеться з вами найближчим часом.'));
  }
  if (action === 'decline') {
    await declineConsent(ctx, deal, meta);
    return html(msgPage('Дякуємо', 'Ваші контакти не буде передано.'));
  }
  if (action === 'revoke') {
    await revokeConsent(ctx, deal);
    return html(msgPage('Згоду відкликано', 'Ваші дані більше не передаватимуться, компанію повідомлено про видалення.'));
  }
  return html(msgPage('Помилка', 'Невідома дія.'), 400);
}

export { html };
