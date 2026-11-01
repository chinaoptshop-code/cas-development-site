// Розділення інтерфейсів за роллю на рівні сторінок (functions/_roles.js):
//   /kabinet/admin — панель CRM і сайту (panel.admin: власник — майстер-панель, менеджер — робоча панель);
//   /kabinet/team  — кабінет працівника (будь-який активний працівник);
//   /kabinet/*     — кабінет клієнта (усі).
// Увійшов, але інтерфейс не його → 403 зі сторінкою /kabinet/zaboroneno («куди вам»). Не увійшов → сама сторінка покаже вхід.
// Дані однаково захищені на API (functions/api/admin|team/_middleware.js) — це лише зрозуміла відповідь замість порожньої сторінки.
import { staffCtx } from '../_roles.js';

const AREA = [[/^\/kabinet\/admin(?:\.html)?\/?$/, x => x.can('panel.admin')], [/^\/kabinet\/team(?:\.html)?\/?$/, x => !!x.role]];

export async function onRequest({ request, env, next }) {
  const path = new URL(request.url).pathname;
  const rule = AREA.find(([re]) => re.test(path));
  if (!rule || !env.DB || request.method !== 'GET') return next();
  let x;
  try { x = await staffCtx(request, env); } catch { return next(); }
  if (!x.client || rule[1](x)) return next();
  let html = '<!doctype html><meta charset="utf-8"><title>Немає доступу</title><p>Немає доступу. <a href="/kabinet">Мій кабінет</a></p>';
  try {
    const r = await env.ASSETS.fetch(new Request(new URL('/kabinet/zaboroneno', request.url)));
    if (r.ok) html = await r.text();
  } catch { /* лишаємо запасну сторінку */ }
  return new Response(html, { status: 403, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' } });
}
