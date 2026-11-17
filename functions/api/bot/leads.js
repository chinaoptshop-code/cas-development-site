// POST /api/bot/leads — кнопка «В CRM» у боті пошуку: створює заявку CRM (orders.kind = 'lead', source = 'finder').
// Ключ — X-Bot-Key (functions/api/bot/_middleware.js). Тіло (усе необовʼязкове, крім хоча б тексту/послуги і хоча б одного з
// контакту автора чи посилання на повідомлення):
//   {hash, service, city, area, budget, estimate, score: 0..100, source_name, source_url, text,
//    author: {name, tg: "@username", phone}, notify: true|false}
// hash — ідентифікатор ліда в боті: та сама заявка вдруге не створюється ({ok, duplicate: true, number}).
// Сповіщення адмінам у Telegram («Взяв у роботу», SLA) — лише якщо notify === true (functions/_alerts.js notifyNew).
// Лише публічні контакти автора; уривок повідомлення — до 1500 символів; HTML не приймаємо (400).
import { bad, json, nextLeadNumber, readJSON } from '../../_lib.js';
import { notifyNew } from '../../_alerts.js';
import { Invalid, phoneOf, text, tgUser, url } from '../../_partners.js';
import { noTable } from '../../_roles.js';
import { leadHash } from './feedback.js';

function input(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Invalid('Очікуємо JSON-обʼєкт');
  const a = d.author && typeof d.author === 'object' ? d.author : {};
  if (d.hash != null && d.hash !== '' && !leadHash(d.hash)) throw new Invalid('hash: 8–128 символів — латиниця, цифри, _ і -');
  let score = null;
  if (d.score != null && d.score !== '') {
    score = Number(d.score);
    if (!Number.isFinite(score) || score < 0 || score > 100) throw new Invalid('score: число 0–100');
    score = Math.round(score);
  }
  if (d.notify != null && typeof d.notify !== 'boolean') throw new Invalid('notify: true або false');
  const L = {
    hash: leadHash(d.hash), service: text(d.service, 200, 'service'), city: text(d.city, 120, 'city'), area: text(d.area, 40, 'area'),
    budget: text(d.budget, 80, 'budget'), estimate: text(d.estimate, 1000, 'estimate', true), score,
    source_name: text(d.source_name, 160, 'source_name'), source_url: url(d.source_url, 300, 'source_url'),
    text: text(d.text ?? d.message, 1500, 'text', true),
    name: text(a.name ?? d.name, 120, 'name'), tg: tgUser(a.tg ?? d.tg), phone: phoneOf(a.phone ?? d.phone), notify: d.notify === true,
  };
  if (!L.service && !L.text) throw new Invalid('Потрібна послуга (service) або текст повідомлення (text)');
  if (!L.tg && !L.phone && !L.source_url) throw new Invalid('Потрібен публічний контакт автора (author.tg / author.phone) або посилання на повідомлення (source_url)');
  return L;
}

export async function onRequestPost({ request, env, waitUntil }) {
  let d, L;
  try { d = await readJSON(request, 16 * 1024); } catch { return bad('Некоректні дані'); }
  try { L = input(d); } catch (e) { if (e instanceof Invalid) return bad(e.message); throw e; }
  try {
    if (L.hash) {
      const dup = await env.DB.prepare("SELECT id, number FROM orders WHERE kind = 'lead' AND ext_hash = ?").bind(L.hash).first();
      if (dup) return json({ ok: true, duplicate: true, id: dup.id, number: dup.number });
    }
    const comment = [
      L.text ? `Повідомлення: ${L.text}` : null,
      L.area ? `Площа: ${L.area}` : null, L.budget ? `Бюджет: ${L.budget}` : null,
      L.estimate ? `Оцінка бота: ${L.estimate}` : null, L.score != null ? `Скор: ${L.score}/100` : null,
      L.source_name || L.source_url ? `Джерело: ${[L.source_name, L.source_url].filter(Boolean).join(' — ')}` : null,
      L.tg ? `Telegram автора: @${L.tg}` : null,
    ].filter(Boolean).join('\n');
    const number = await nextLeadNumber(env);
    const r = await env.DB.prepare(`INSERT INTO orders (number, kind, name, phone, items, service, source, comment, status, form, city, ext_hash, contact_tg)
        VALUES (?, 'lead', ?, ?, '[]', ?, 'finder', ?, 'new', 'finder', ?, ?, ?)`)
      .bind(number, L.name || (L.tg ? '@' + L.tg : 'Без імені'), L.phone, L.service, comment, L.city, L.hash, L.tg).run();
    const id = r.meta.last_row_id;
    await env.DB.prepare("INSERT INTO order_events (order_id, status, note, author) VALUES (?, 'new', 'Бот пошуку: «В CRM»', 'finder')").bind(id).run();
    if (L.notify) {
      const alert = notifyNew(env, id, { form: 'finder', page: L.source_url });
      if (typeof waitUntil === 'function') waitUntil(alert); else await alert;
    }
    return json({ ok: true, id, number, notified: L.notify });
  } catch (e) {
    if (noTable(e)) return bad('CRM ще не готова до заявок бота (міграція 0013)', 503);
    throw e;
  }
}
