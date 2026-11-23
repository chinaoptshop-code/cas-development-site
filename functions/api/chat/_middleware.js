// /api/chat/* — публічний API віконця чату (assets/chat.v1.js). Контракт — tools/chat/API.md, логіка — functions/_chat.js.
// Тут: без D1 — 503; POST — лише зі сторінок свого сайту (Origin обовʼязковий і наш; спільний middleware пропускає запити без Origin
// як сервер-сервер, а чат — лише для браузера). Cookie не читаємо й не ставимо: відвідувача впізнаємо за sid + token.
import { bad } from '../../_lib.js';
import { ownOrigin } from '../../_chat.js';

export async function onRequest({ request, env, next }) {
  if (!env.DB) return bad('Чат тимчасово недоступний', 503);
  if (request.method !== 'GET' && request.method !== 'HEAD' && !ownOrigin(request)) return bad('Запит з іншого сайту відхилено', 403);
  return next();
}
