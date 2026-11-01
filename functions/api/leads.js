// Прийом заявки в CRM (orders.kind = 'lead'). Формат — як у форми сайту (/assets/lead-form.v1.js → n8n):
// {name, phone, area, message, service, source, form, lang, page, utm_*}. Обовʼязковий лише телефон (мін. 9 цифр);
// без імені — «Без імені» (форма «лише номер», Михайло 25.10.2026).
// Нова заявка → миттєве сповіщення адмінам у Telegram з кнопкою «Взяв у роботу» (functions/_alerts.js).
// З заголовком x-lead-key = LEAD_INGEST_KEY (n8n, інтеграції) — без ліміту; без ключа — до 5 заявок на годину з IP
// і не більше GLOBAL_PER_HOUR на весь сайт (захист D1 і Telegram від ботнету; справжніх заявок у рази менше).
// Аналітика (migrations/0009_lead_meta.sql): form, lang, utm — окремими колонками; без міграції заявка зберігається без них.
import { bad, hexOf, json, nextLeadNumber, readJSON, same, sha256, str } from '../_lib.js';
import { notifyNew } from '../_alerts.js';
import { ipKey } from '../_rate.js';

const GLOBAL_PER_HOUR = 300;
const noColumn = e => /no such column|has no column/i.test(String(e && e.message));

export async function onRequestPost({ request, env, waitUntil }) {
  let d;
  try { d = await readJSON(request, 16 * 1024); } catch { return bad('Некоректні дані'); }
  const key = request.headers.get('x-lead-key') || '';
  const trusted = !!env.LEAD_INGEST_KEY && same(key, env.LEAD_INGEST_KEY);
  if (key && !trusted) return bad('Невірний ключ', 403);
  // антиспам без капчі: приховане поле (hp / website) заповнює лише бот; t_ms — мс від відкриття сторінки до відправки
  // (assets/lead-form.v1.js). Людина не встигає за 1,5 с; поле необовʼязкове — старі версії скрипта його не шлють.
  // Бот отримує «успіх», але заявка не зберігається й сповіщення немає.
  if (!trusted && (d.website || d.hp || (d.t_ms != null && Number(d.t_ms) >= 0 && Number(d.t_ms) < 1500))) return json({ ok: true });
  const phone = String(d.phone || '').replace(/[^\d+]/g, '').slice(0, 16);
  if (phone.replace(/\D/g, '').length < 9) return bad('Вкажіть телефон');
  if (!trusted) {
    const ip = hexOf(await sha256('lead|' + ipKey(request))), now = Math.floor(Date.now() / 1000);
    await env.DB.prepare('DELETE FROM lead_checks WHERE created_at < ?').bind(now - 3600).run();
    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM lead_checks WHERE ip_hash = ?').bind(ip).first();
    if ((row?.n || 0) >= 5) return bad('Забагато заявок, спробуйте пізніше', 429);
    const all = await env.DB.prepare('SELECT COUNT(*) AS n FROM lead_checks').first(); // таблиця тримає лише останню годину
    if ((all?.n || 0) >= GLOBAL_PER_HOUR) return bad('Забагато заявок, спробуйте пізніше', 429);
    await env.DB.prepare('INSERT INTO lead_checks (ip_hash, created_at) VALUES (?, ?)').bind(ip, now).run();
  }
  // та сама заявка двічі за 10 хв (наприклад, і з сайту, і з n8n) — не дублюємо
  const dup = await env.DB.prepare("SELECT id, number FROM orders WHERE kind = 'lead' AND phone = ? AND created_at > datetime('now', '-10 minutes')").bind(phone).first();
  if (dup) return json({ ok: true, number: dup.number, duplicate: true });
  const comment = [str(d.message, 1500), d.area ? `Площа: ${str(d.area, 40)}` : null,
    d.utm_source ? `UTM: ${[d.utm_source, d.utm_medium, d.utm_campaign].filter(Boolean).map(x => str(x, 60)).join(' / ')}` : null].filter(Boolean).join('\n') || null;
  const number = await nextLeadNumber(env);
  const base = [number, str(d.name, 120) || 'Без імені', phone, str(d.service, 200), str(d.source || d.page, 200), comment];
  const utm = d.utm_source ? [d.utm_source, d.utm_medium, d.utm_campaign].filter(Boolean).map(x => str(x, 60)).join(' / ') : null;
  let r;
  try {
    r = await env.DB.prepare(`INSERT INTO orders (number, kind, name, phone, items, service, source, comment, status, form, lang, utm)
        VALUES (?, 'lead', ?, ?, '[]', ?, ?, ?, 'new', ?, ?, ?)`)
      .bind(...base, str(d.form, 40), str(d.lang, 8), utm).run();
  } catch (e) {
    if (!noColumn(e)) throw e; // міграція 0009 ще не застосована — зберігаємо як раніше
    r = await env.DB.prepare(`INSERT INTO orders (number, kind, name, phone, items, service, source, comment, status)
        VALUES (?, 'lead', ?, ?, '[]', ?, ?, ?, 'new')`).bind(...base).run();
  }
  await env.DB.prepare("INSERT INTO order_events (order_id, status, author) VALUES (?, 'new', ?)").bind(r.meta.last_row_id, str(d.form, 40) || 'site').run();
  const alert = notifyNew(env, r.meta.last_row_id, {
    page: str(d.page, 300), form: str(d.form, 40), message: str(d.message, 1500) || '', area: str(d.area, 40),
    utm_source: str(d.utm_source, 60), utm_medium: str(d.utm_medium, 60), utm_campaign: str(d.utm_campaign, 60),
  });
  if (typeof waitUntil === 'function') waitUntil(alert); else await alert;
  return json({ ok: true, number });
}
