// Спільний захист усіх /api/* (Cloudflare Pages Functions middleware): CSRF, розмір тіла, заголовки безпеки.
//
// CSRF. Сесія — cookie cas_s (HttpOnly, Secure, SameSite=Lax). Для POST/PATCH/PUT/DELETE додатково:
//   1) заголовок Origin (браузер ставить його на всі такі запити) має бути нашим: той самий origin, що й запит
//      (cas-develop.com, прев'ю *.pages.dev, localhost у wrangler dev), або cas-develop.com / www. Чужий або «null» → 403;
//   2) Sec-Fetch-Site: cross-site → 403 (на випадок браузерів, що не шлють Origin);
//   3) непорожнє тіло — лише application/json (HTML-форма з чужого сайту не може надіслати JSON без CORS-preflight,
//      а preflight ми не дозволяємо) → інакше 415.
// Сервер-сервер виклики (Telegram → /api/tg/webhook, GitHub Actions → /api/admin/lead-sla, n8n → /api/leads з ключем)
// не мають Origin/Sec-Fetch-Site і шлють JSON — їх перевірка не зачіпає; там свої секрети в заголовках.
//
// Розмір тіла: Content-Length понад 64 КБ → 413 (окрім /api/admin/repo — фото до 30 МБ, ліміти в functions/_gh.js).
// Відповіді API: nosniff, заборона фреймів, CSP default-src 'none', no-store — JSON не може стати сторінкою.

const OWN = ['https://cas-develop.com', 'https://www.cas-develop.com'];
const BIG = { '/api/admin/repo': 31 * 1024 * 1024 };
const MAX = 64 * 1024;
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

const deny = (msg, status) => new Response(JSON.stringify({ error: msg }), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

export function csrfCheck(request) {
  if (SAFE.has(request.method)) return null;
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  if (origin != null && origin !== url.origin && !OWN.includes(origin)) return deny('Запит з іншого сайту відхилено', 403);
  if ((request.headers.get('sec-fetch-site') || '') === 'cross-site') return deny('Запит з іншого сайту відхилено', 403);
  const len = request.headers.get('content-length');
  const hasBody = len ? +len > 0 : !!request.body && request.method !== 'DELETE';
  const ct = request.headers.get('content-type') || '';
  if (hasBody && !/^application\/json\b/i.test(ct)) return deny('Очікуємо JSON', 415);
  if (len && +len > (BIG[url.pathname] || MAX)) return deny('Завеликий запит', 413);
  return null;
}

function harden(res) {
  const r = new Response(res.body, res);
  const h = r.headers;
  h.set('x-content-type-options', 'nosniff');
  h.set('x-frame-options', 'DENY');
  h.set('referrer-policy', 'no-referrer');
  h.set('content-security-policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  if (!h.has('cache-control')) h.set('cache-control', 'no-store');
  h.set('x-robots-tag', 'noindex, nofollow');
  // CORS не дозволяємо: API лише для власних сторінок (Pages сам ставить «*» на статичні відповіді — прибираємо)
  for (const k of ['access-control-allow-origin', 'access-control-allow-credentials', 'access-control-allow-headers', 'access-control-allow-methods']) h.delete(k);
  return r;
}

export async function onRequest({ request, next }) {
  // preflight чужого сайту: без дозволів CORS браузер не надішле запит
  if (request.method === 'OPTIONS') return harden(new Response(null, { status: 204, headers: { allow: 'GET, POST, PATCH, DELETE' } }));
  const blocked = csrfCheck(request);
  if (blocked) return harden(blocked);
  try {
    return harden(await next());
  } catch (e) {
    console.log('api error', new URL(request.url).pathname, e && e.message);
    return harden(deny('Помилка сервера, спробуйте пізніше', 500)); // без стеку й деталей назовні
  }
}
