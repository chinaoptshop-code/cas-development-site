// POST /api/bot/partners — бот пошуку додає або оновлює партнера (підрядник, бригада, постачальник, ріелтор, будівельна
// компанія, дизайнер), якого відсіяв як «не клієнт». Ключ — X-Bot-Key (functions/api/bot/_middleware.js).
// Тіло: {name, company, type: crew|supplier|realtor|builder|designer|other, city, tg: "@username", phone, site,
//        source_name, source_url, tags: [..]} або {items: [до 50 таких обʼєктів]}.
// Дедуплікація (functions/_partners.js): той самий Telegram, телефон, домен сайту або назва компанії → оновлюємо
// (порожні поля, теги, джерело, last_seen, times_seen + 1); статус і нотатки менеджера бот не змінює.
// Відповідь: {ok, id, created, times_seen} або {ok, results: [{id, created, times_seen} | {error}]}.
import { bad, json, readJSON } from '../../_lib.js';
import { Invalid, partnerInput, upsertPartner } from '../../_partners.js';
import { noTable } from '../../_roles.js';

const MAX_ITEMS = 50;

export async function onRequestPost({ request, env }) {
  let d;
  try { d = await readJSON(request, 60 * 1024); } catch { return bad('Некоректні дані'); }
  try {
    if (d && Array.isArray(d.items)) {
      if (!d.items.length || d.items.length > MAX_ITEMS) return bad(`items: від 1 до ${MAX_ITEMS}`);
      const results = [];
      for (const it of d.items) {
        try { results.push(await upsertPartner(env, partnerInput(it, { bot: true }))); }
        catch (e) { if (e instanceof Invalid) results.push({ error: e.message }); else throw e; }
      }
      return json({ ok: true, results });
    }
    return json({ ok: true, ...(await upsertPartner(env, partnerInput(d, { bot: true }))) });
  } catch (e) {
    if (e instanceof Invalid) return bad(e.message);
    if (noTable(e)) return bad('База партнерів ще не готова (міграція 0013)', 503);
    throw e;
  }
}
