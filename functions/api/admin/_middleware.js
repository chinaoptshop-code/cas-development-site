// Другий рубіж для /api/admin/*: без адмінської сесії (cookie cas_s + isAdmin) — 403 ще до обробника.
// Кожен обробник і так перевіряє requireAdmin; цей middleware страхує від нового файлу, де перевірку забули.
// Виняток — /api/admin/lead-sla: його викликає GitHub Actions без cookie, з секретом x-lead-key (перевірка в обробнику).
// Спільні CSRF/CORS/заголовки — functions/api/_middleware.js (виконується раніше за цей).
import { bad, requireAdmin } from '../../_lib.js';

const OPEN = new Set(['/api/admin/lead-sla']);

export async function onRequest({ request, env, next }) {
  const path = new URL(request.url).pathname.replace(/\/+$/, '');
  if (OPEN.has(path)) return next();
  if (!env.DB || !await requireAdmin(request, env)) return bad('Немає доступу', 403);
  return next();
}
