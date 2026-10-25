// SLA заявок і щоденний звіт. Викликає GitHub Actions кожні 5 хв (.github/workflows/lead-sla.yml) з заголовком
// x-lead-key = LEAD_INGEST_KEY (секрет репозиторію SHOP_LEAD_INGEST_KEY). Тіло (JSON, необовʼязково):
//   {}                      — нагадування про невзяті заявки (15 хв, повтор через 60, тиша 22:00–08:00 Київ),
//                             звіт о 20:45 Києва (раз на добу) і перевірка вебхука бота (раз на 6 год);
//   {"task": "report"}      — надіслати звіт за сьогодні зараз;
//   {"task": "webhook", "force": true} — поставити вебхук бота, навіть якщо зараз стоїть чужий.
// {"now": "<ISO>"} — підміна годинника лише для локальних тестів (ALERTS_TEST_CLOCK=1 у .dev.vars).
import { bad, json, readJSON, same } from '../../_lib.js';
import { ensureWebhook, runReport, runSla } from '../../_alerts.js';

const WEBHOOK_CHECK_S = 6 * 3600;

export async function onRequestPost({ request, env }) {
  if (!env.LEAD_INGEST_KEY || !same(request.headers.get('x-lead-key') || '', env.LEAD_INGEST_KEY)) return bad('Немає доступу', 403);
  let d = {};
  try { d = await readJSON(request, 4096) || {}; } catch { return bad('Некоректні дані'); }
  let now = new Date();
  if (d.now && env.ALERTS_TEST_CLOCK === '1') now = new Date(d.now);
  if (Number.isNaN(now.getTime())) return bad('Некоректний час');
  const origin = new URL(request.url).origin;

  if (d.task === 'report') return json({ ok: true, report: await runReport(env, now, true) });
  if (d.task === 'webhook') return json({ ok: true, ...(await ensureWebhook(env, origin, !!d.force)) });

  const sla = await runSla(env, now);
  const report = await runReport(env, now);
  let webhook = null;
  const t = Math.floor(Date.now() / 1000);
  const last = await env.DB.prepare("SELECT value FROM settings WHERE key = 'tg_webhook_checked'").first();
  if (!last || t - Number(last.value) > WEBHOOK_CHECK_S) {
    webhook = await ensureWebhook(env, origin);
    if (webhook.webhook === 'ok' || webhook.webhook === 'set' || webhook.webhook === 'foreign')
      await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('tg_webhook_checked', ?1) ON CONFLICT(key) DO UPDATE SET value = ?1").bind(String(t)).run();
  }
  return json({ ok: true, sla, report, webhook });
}
