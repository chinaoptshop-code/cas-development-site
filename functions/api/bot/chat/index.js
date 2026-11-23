// /api/bot/chat — черга чату на сайті для воркера Mac mini (ключ X-Bot-Key, functions/api/bot/_middleware.js). Контракт — tools/chat/API.md.
//
// GET ?limit=1..10&lock=30..600 — розмови, де останнє слово за відвідувачем і відповіді ще немає (стан bot або waiting; staff і closed — ні).
//   Кожну видану розмову блокуємо на lock секунд (типово 120): другий воркер її не отримає, поки не мине час або не прийде відповідь.
//   → {items: [{sid, lang, page, state, lead: {number}|null, lock_until, last_user_id, budget: {answers_left, msgs_left, voice_left}, history: [...], pending: [...]}],
//      budget: {day_answers_left, day_answers_max}}
//   Розмови на стелі (handoff_reason = limit) у черзі немає; добову стелю відповідей вичерпано — items: [] (воркер нічого не витрачає).
//   history — до 30 останніх повідомлень розмови, крім pending (відповіді бота й людини, системні, вже відповідені повідомлення відвідувача), pending — повідомлення відвідувача без відповіді (до 20), з файлами {id, name, mime, kind, size}.
// POST {sid, reply_to, text?, audio?: {mime, data (base64), dur}, estimate?, handoff?, handoff_reason?, reason?, renotify?} — відповідь у розмову.
//   renotify: true (лише з handoff і reason) — розмова вже waiting, а для людини є нове (обраний час дзвінка): сповістити ще раз.
//   reply_to — id ОСТАННЬОГО повідомлення відвідувача з pending: якщо відтоді прийшло нове — 409 {conflict, last_user_id} (перечитати чергу).
//   Стан staff або closed — 409 {state} (людина вже веде розмову). Стеля: розмова (L.convAnswers) — 409 {limit: 'conv'} і розмова переходить до людини;
//   доба (L.dayAnswers) — 409 {limit: 'day'}. Голос понад L.voiceConv на розмову — аудіо не зберігаємо, текст лишається ({audio_dropped: true}).
//   handoff: true — стан waiting і сповіщення (handoff_reason: asks_human | big_project | complaint | complex | other; reason — коротко своїми словами) власнику й менеджерам у Telegram.
// POST {sid, typing: true} — «друкує…» ще 30 с і продовжити блокування; POST {sid, release: true} — зняти блокування без відповіді.
import { bad, json, readJSON, str } from '../../../_lib.js';
import { ChatError, HANDOFF, L, addMessage, botCounts, capConversation, clean, dayCount, dayFull, dayInc, estimateOf, handoff, isCapped, lim, messages, now, putFile, setPing, wrap } from '../../../_chat.js';

const AUDIO = { 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/webm': 'webm', 'audio/wav': 'wav', 'audio/aac': 'aac' };

export const onRequestGet = ({ request, env }) => wrap(async () => {
  const u = new URL(request.url);
  const limit = Math.max(1, Math.min(10, parseInt(u.searchParams.get('limit'), 10) || 5));
  const lock = Math.max(30, Math.min(600, parseInt(u.searchParams.get('lock'), 10) || L.lock));
  const t = now();
  await setPing(env, t, 30); // забрати чергу = бути живим (запис у базу — не частіше ніж раз на 30 с)
  const X = lim(env), dayLeft = Math.max(0, X.dayAnswers - await dayCount(env, 'answers'));
  const budget = { day_answers_left: dayLeft, day_answers_max: X.dayAnswers };
  if (!dayLeft) { await dayFull(env, 'answers'); return json({ items: [], budget }); }
  const { results } = await env.DB.prepare(`SELECT * FROM chat_sessions WHERE state IN ('bot', 'waiting') AND last_user_id > answered_upto
      AND COALESCE(handoff_reason, '') <> 'limit' AND (lock_until IS NULL OR lock_until < ?) ORDER BY last_user_at, id LIMIT ?`).bind(t, limit * 3).all();
  const items = [];
  for (const s of results) {
    if (items.length >= limit) break;
    const r = await env.DB.prepare('UPDATE chat_sessions SET lock_until = ? WHERE id = ? AND last_user_id > answered_upto AND (lock_until IS NULL OR lock_until < ?)')
      .bind(t + lock, s.id, t).run();
    if (!r.meta.changes) continue; // інший воркер устиг
    const history = await messages(env, s.id, "NOT (m.role = 'user' AND m.id > ?)", [s.answered_upto], 30, true);
    const pending = (await messages(env, s.id, "m.id > ? AND m.role = 'user'", [s.answered_upto], 20)).map(({ id, text, files, at }) => ({ id, text, files, at }));
    const lead = s.order_id ? await env.DB.prepare('SELECT number FROM orders WHERE id = ?').bind(s.order_id).first() : null;
    const c = await botCounts(env, s.id);
    items.push({ sid: s.sid, lang: s.lang, page: s.page, state: s.state, lead: lead ? { number: lead.number } : null, lock_until: t + lock,
      last_user_id: s.last_user_id, budget: { answers_left: Math.max(0, X.convAnswers - c.answers), msgs_left: Math.max(0, X.convMsgs - s.msgs), voice_left: Math.max(0, X.voiceConv - c.voice) },
      history, pending });
  }
  return json({ items, budget });
});

export const onRequestPost = ({ request, env }) => wrap(async () => {
  let d;
  try { d = await readJSON(request, 9 * 1024 * 1024) || {}; } catch { throw new ChatError('Некоректні дані'); }
  if (typeof d !== 'object' || Array.isArray(d)) throw new ChatError('Некоректні дані');
  const sid = String(d.sid || '');
  if (!/^[0-9a-f]{32}$/.test(sid)) throw new ChatError('sid: 32 hex');
  const s = await env.DB.prepare('SELECT * FROM chat_sessions WHERE sid = ?').bind(sid).first();
  if (!s) return bad('Розмову не знайдено', 404);
  const t = now();
  if (d.release === true) {
    await env.DB.prepare('UPDATE chat_sessions SET lock_until = NULL, typing_until = NULL WHERE id = ?').bind(s.id).run();
    return json({ ok: true, released: true });
  }
  const hasReply = d.text != null || d.audio != null || d.estimate != null;
  if (d.typing === true && !hasReply && !d.handoff) {
    if (s.state === 'staff' || s.state === 'closed') throw new ChatError('Розмову веде людина', 409, { state: s.state });
    await env.DB.prepare('UPDATE chat_sessions SET typing_until = ?, lock_until = MAX(COALESCE(lock_until, 0), ?) WHERE id = ?').bind(t + L.typing, t + L.lock, s.id).run();
    return json({ ok: true, typing: true });
  }
  if (s.state === 'staff' || s.state === 'closed') throw new ChatError('Розмову веде людина — бот не відповідає', 409, { state: s.state });
  const replyTo = Number(d.reply_to);
  if (!Number.isInteger(replyTo) || replyTo < 1) throw new ChatError('reply_to: id останнього повідомлення відвідувача з pending');
  // відвідувач написав ще: знімаємо блокування — розмова одразу знову в черзі з усіма повідомленнями
  if (replyTo !== s.last_user_id) await env.DB.prepare('UPDATE chat_sessions SET lock_until = NULL WHERE id = ?').bind(s.id).run();
  if (replyTo !== s.last_user_id) throw new ChatError('Відвідувач уже написав ще — перечитайте чергу', 409, { conflict: true, last_user_id: s.last_user_id });
  if (d.text != null && typeof d.text !== 'string') throw new ChatError('text: рядок');
  const text = clean(d.text, L.botText);
  const estimate = estimateOf(d.estimate);
  if (d.handoff_reason != null && !Object.hasOwn(HANDOFF, d.handoff_reason)) throw new ChatError('handoff_reason: ' + Object.keys(HANDOFF).join(' | '));
  const X = lim(env), willReply = !!(text || d.audio != null || estimate);
  let c = { answers: 0, voice: 0 };
  if (willReply) {
    // стелі — до запису (воркер тоді нічого не зберігає й не витрачає далі)
    if (isCapped(s)) throw new ChatError('Ліміт розмови: далі відповідає людина', 409, { limit: 'conv' });
    if (await dayFull(env, 'answers')) throw new ChatError('Добовий ліміт відповідей бота вичерпано', 409, { limit: 'day' });
    c = await botCounts(env, s.id);
    if (c.answers >= X.convAnswers) {
      await capConversation(env, s, `бот дав ${X.convAnswers} відповідей`);
      throw new ChatError('Ліміт розмови: далі відповідає людина', 409, { limit: 'conv' });
    }
  }
  let audioId = null, dur = null, audioDropped = false;
  if (d.audio != null && c.voice >= X.voiceConv) { audioDropped = true; d.audio = null; } // голос — не більше voiceConv на розмову, далі лише текст
  if (d.audio != null) {
    const a = d.audio;
    if (!a || typeof a !== 'object' || !Object.hasOwn(AUDIO, a.mime)) throw new ChatError('audio.mime: ' + Object.keys(AUDIO).join(' | '));
    let bytes;
    try { bytes = Uint8Array.from(atob(String(a.data || '')), c => c.charCodeAt(0)); } catch { throw new ChatError('audio.data: base64'); }
    if (!bytes.length || bytes.length > L.audio) throw new ChatError('audio: від 1 байта до 6 МБ', 413);
    dur = a.dur == null ? null : Number(a.dur);
    if (dur != null && !(dur >= 0 && dur <= 600)) throw new ChatError('audio.dur: секунди 0…600');
    audioId = await putFile(env, s, { role: 'bot', name: 'reply.' + AUDIO[a.mime], mime: a.mime, kind: 'audio' }, bytes);
  }
  if (!text && !audioId && !estimate && !d.handoff) throw new ChatError('Порожня відповідь: text, audio, estimate або handoff', 422);
  let id = null;
  if (text || audioId || estimate) {
    id = await addMessage(env, s, 'bot', text, { audio_id: audioId, audio_dur: dur, estimate });
    if (audioId) await env.DB.prepare('UPDATE chat_files SET message_id = ? WHERE id = ?').bind(id, audioId).run();
    await dayInc(env, 'answers');
  }
  // атомарно: якщо поки ми писали, відвідувач надіслав ще — відповідь лишається, а розмова знову в черзі (answered_upto = reply_to)
  await env.DB.prepare("UPDATE chat_sessions SET answered_upto = MAX(answered_upto, ?), lock_until = NULL, typing_until = NULL, last_bot_at = datetime('now'), last_at = datetime('now') WHERE id = ?")
    .bind(replyTo, s.id).run();
  let notified = 0, limit = null;
  if (d.handoff === true && d.handoff_reason === 'limit') { notified = (await capConversation(env, s, str(d.reason, 200) || 'бюджет воркера вичерпано')) ? 1 : 0; limit = 'conv'; }
  else if (d.handoff === true) notified = await handoff(env, s, d.handoff_reason, d.reason, d.renotify === true);
  // ця відповідь — остання дозволена: розмова одразу переходить до людини (наступне повідомлення відвідувача — менеджеру)
  if (id && !limit && c.answers + 1 >= X.convAnswers) { await capConversation(env, s, `бот дав ${X.convAnswers} відповідей`); limit = 'conv'; }
  const fresh = await env.DB.prepare('SELECT state FROM chat_sessions WHERE id = ?').bind(s.id).first();
  return json({ ok: true, id, state: fresh.state, notified, limit, ...(audioDropped ? { audio_dropped: true } : {}) });
});
