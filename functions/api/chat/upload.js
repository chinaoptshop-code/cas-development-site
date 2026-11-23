// POST /api/chat/upload — сирі байти файлу в тілі (не JSON). Заголовки: x-chat-sid, x-chat-token, x-file-name (encodeURIComponent),
// content-type (підказка браузера; тип визначаємо за розширенням і сигнатурою). → {ok, file_id, name, mime, kind, size}
// Типи — TYPES у functions/_chat.js (фото, відео, аудіо, PDF, Excel/CSV, Word, DWG/DXF/3DS, SKP/IFC/RVT/ZIP); інше — 415.
// Розмір: з R2 — до 50 МБ на файл і 150 МБ на розмову; без R2 (байти в D1) — до 1,5 МБ на файл і 6 МБ на розмову
// (413 {too_big, max, alt} — віконце пропонує надіслати великий файл у Telegram/WhatsApp). До 30 файлів на розмову,
// 60 завантажень на годину й 200 на добу з адреси. Файл привʼязується до повідомлення в POST /api/chat/send.
import { json } from '../../_lib.js';
import { limited } from '../../_rate.js';
import { ChatError, L, MSG_LINKS, fileName, limits, putFile, readCapped, session, typeOf, wrap } from '../../_chat.js';

export const onRequestPost = ({ request, env }) => wrap(async () => {
  const s = await session(env, request);
  const lim = limits(env);
  let raw = request.headers.get('x-file-name') || new URL(request.url).searchParams.get('name') || '';
  try { raw = decodeURIComponent(raw); } catch { /* як є */ }
  const name = fileName(raw);
  if (!name) throw new ChatError('Немає імені файлу');
  const t = typeOf(name, request.headers.get('content-type'));
  if (!t) throw new ChatError('Такий тип файлу не приймаємо', 415, { unsupported: true });
  const big = { alt: MSG_LINKS, r2: lim.r2 };
  const len = Number(request.headers.get('content-length') || 0);
  if (len > lim.file) throw new ChatError('Файл завеликий', 413, { too_big: true, max: lim.file, ...big });
  const cnt = await env.DB.prepare("SELECT COUNT(*) AS n FROM chat_files WHERE session_id = ? AND role = 'user'").bind(s.id).first();
  if ((cnt && cnt.n) >= L.filesSess) throw new ChatError(`У розмові вже ${L.filesSess} файлів — більше надішліть у Telegram або WhatsApp`, 413, { too_many: true, ...big });
  if (s.bytes + len > lim.session) throw new ChatError('Ліміт файлів у розмові вичерпано', 413, { session_full: true, max: lim.session, ...big });
  if (await limited(env, request, 'chat-up-h', L.upIpHour) || await limited(env, request, 'chat-up-d', L.upIpDay, 86400)) throw new ChatError('Забагато файлів поспіль — зачекайте трохи', 429);
  let bytes;
  try { bytes = await readCapped(request, lim.file); }
  catch (e) { if (e instanceof ChatError) { e.extra = { ...e.extra, ...big }; } throw e; }
  if (!bytes.length) throw new ChatError('Порожній файл');
  if (s.bytes + bytes.length > lim.session) throw new ChatError('Ліміт файлів у розмові вичерпано', 413, { session_full: true, max: lim.session, ...big });
  if (!t.sig(bytes)) throw new ChatError('Вміст файлу не відповідає його типу', 415, { mismatch: true });
  // атомарно рахуємо байти розмови (паралельні завантаження не перевищать ліміт)
  const u = await env.DB.prepare('UPDATE chat_sessions SET bytes = bytes + ?1, last_at = datetime(\'now\') WHERE id = ?2 AND bytes + ?1 <= ?3').bind(bytes.length, s.id, lim.session).run();
  if (!u.meta.changes) throw new ChatError('Ліміт файлів у розмові вичерпано', 413, { session_full: true, max: lim.session, ...big });
  const id = await putFile(env, s, { name, mime: t.mime, kind: t.kind }, bytes);
  return json({ ok: true, file_id: id, name, mime: t.mime, kind: t.kind, size: bytes.length });
});
