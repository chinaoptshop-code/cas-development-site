// Другий рубіж для /api/admin/*: лише активний працівник студії (staffCtx, functions/_roles.js) — інакше 401/403 ще до обробника.
// Конкретні права (leads.view_all, finance.view, staff.manage…) перевіряє КОЖЕН обробник через need(); цей middleware страхує
// від нового файлу, де перевірку забули: клієнт і вимкнений працівник сюди не пройдуть.
// Виняток — /api/admin/lead-sla: його викликає GitHub Actions без cookie, з секретом x-lead-key (перевірка в обробнику).
// Спільні CSRF/CORS/заголовки — functions/api/_middleware.js (виконується раніше за цей).
import { bad } from '../../_lib.js';
import { need } from '../../_roles.js';

const OPEN = new Set(['/api/admin/lead-sla']);

export async function onRequest({ request, env, next }) {
  const path = new URL(request.url).pathname.replace(/\/+$/, '');
  if (OPEN.has(path)) return next();
  if (!env.DB) return bad('Немає доступу', 403);
  const { error } = await need(request, env);
  return error || next();
}
