// /api/bot/* — сервер-сервер API бота пошуку заявок (Mac mini, Telegram-помічник). Опис — tools/admin/README.md, «Партнери і бот пошуку».
// Автентифікація: заголовок X-Bot-Key = секрет Cloudflare Pages LEADBOT_KEY. Порівнюємо рівночасово (sha256 обох → same()),
// тож ні вміст, ні довжина ключа не вгадуються за часом відповіді. Без ключа / невірний → 401; секрет не задано → 503.
// Ліміти (rate_hits, functions/_rate.js): невдалих спроб ключа — 20 / год з IP (далі 429 навіть з вірним ключем — до кінця вікна),
// запитів з вірним ключем — 1200 / год з IP; черга чату на сайті (/api/bot/chat*) — окремий кошик 4000 / год (воркер опитує кожні 3–5 с). Cookie й права працівників тут не діють: бот — не людина.
// CSRF-перевірка спільного middleware (functions/api/_middleware.js) бота не зачіпає: без Origin, тіло — JSON.
import { bad, hexOf, sha256, same } from '../../_lib.js';
import { limited } from '../../_rate.js';

export const BAD_PER_HOUR = 20;
export const OK_PER_HOUR = 1200;
export const CHAT_PER_HOUR = 4000;
const digest = async s => hexOf(await sha256('leadbot|' + s));

export async function onRequest({ request, env, next }) {
  if (!env.LEADBOT_KEY || String(env.LEADBOT_KEY).length < 24) return bad('Бот не налаштований (LEADBOT_KEY)', 503);
  const key = request.headers.get('x-bot-key') || '';
  const good = !!key && key.length <= 512 && same(await digest(key), await digest(String(env.LEADBOT_KEY)));
  if (!good) {
    if (await limited(env, request, 'bot-bad', BAD_PER_HOUR)) return bad('Забагато спроб, спробуйте пізніше', 429);
    return bad(key ? 'Невірний ключ' : 'Потрібен ключ X-Bot-Key', 401);
  }
  if (await limited(env, request, 'bot-bad', BAD_PER_HOUR, 3600, true)) return bad('Забагато спроб, спробуйте пізніше', 429);
  const chat = /^\/api\/bot\/chat(\/|$)/.test(new URL(request.url).pathname);
  if (await limited(env, request, chat ? 'bot-chat' : 'bot', chat ? CHAT_PER_HOUR : OK_PER_HOUR)) return bad('Забагато запитів, спробуйте пізніше', 429);
  return next();
}
