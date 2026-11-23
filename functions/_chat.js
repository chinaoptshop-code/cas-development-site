// Чат на сайті (23.11.2026, migrations/0021_chat.sql): спільна логіка публічного API (/api/chat/*), API воркера (/api/bot/chat*)
// і адмінки (/api/admin/chat). Контракт для воркера Mac mini — tools/chat/API.md; інструкція власнику — tools/admin/README.md, «Чат на сайті».
//
// Відвідувач без акаунта й cookie: start → {sid, token}; далі кожен запит несе sid + token (заголовки x-chat-sid / x-chat-token
// або поля тіла / параметри адреси). sid — 128 біт випадкових, token — 256 біт; у D1 — лише hex(sha256('chat|' + token)),
// порівняння рівночасове (same). Невірний sid або токен → 404 «Розмову не знайдено» (не підтверджуємо, що розмова існує).
// Файли: R2 (binding MEDIA), якщо привʼязано, — до 50 МБ на файл і 150 МБ на розмову; без R2 — байти в D1, до 1,5 МБ на файл і 6 МБ на розмову.
// Віддаємо лише як вкладення (content-disposition: attachment, nosniff, CSP sandbox), активні типи (HTML, SVG, JS…) не приймаємо зовсім.
// Вміст повідомлень і файлів — недовірені дані: ніде не стає розміткою (віконце й адмінка — textContent / esc), воркер — лише як дані.
import { bad, dict, hexOf, json, nextLeadNumber, normalizePhone, same, sha256, str } from './_lib.js';
import { notifyNew, notifyTeam, escHtml } from './_alerts.js';
import { refHost } from './_refhost.js';
import { IN_IDS, idsArg } from './_lib.js';
import { noTable } from './_roles.js';

export const LANGS = ['uk', 'ru', 'en', 'es', 'zh', 'pl', 'de', 'fr', 'pt', 'ar'];
export const STATES = ['bot', 'waiting', 'staff', 'closed'];
export const L = Object.freeze({
  text: 4000,            // знаків у повідомленні відвідувача
  botText: 8000,         // знаків у відповіді бота / людини
  startIpHour: 10,       // нових розмов з однієї адреси на годину
  startAllHour: 600,     // нових розмов на весь сайт на годину
  msgSessHour: 40, msgSessDay: 200, msgIpHour: 150,
  upIpHour: 60, upIpDay: 200, filesSess: 30,
  contactIpHour: 5,
  fileR2: 50 * 1024 * 1024, sessR2: 150 * 1024 * 1024,
  fileD1: 1.5 * 1024 * 1024, sessD1: 6 * 1024 * 1024,
  audio: 6 * 1024 * 1024,  // аудіо-відповідь бота (після base64)
  lock: 120,               // с: воркер узяв розмову; повторна видача — після
  online: 180,             // с: воркер вважається живим після останнього ping
  typing: 30,              // с: «друкує…» після typing: true
  keepDays: 30, keepFilesDays: 14, orphanHours: 24,
});
export const MSG_LINKS = { telegram: 'https://t.me/+380978667755', whatsapp: 'https://wa.me/380978667755', viber: 'viber://chat?number=%2B380978667755' };
export const ADMIN_URL = id => `https://cas-develop.com/kabinet/admin?cs=${id}#chat`;

// Привітання (перше повідомлення віконця; дисклеймер окремо — у віконці)
export const HELLO = dict({
  uk: 'Вітаю! Я помічник студії CAS Development. Розкажіть про обʼєкт: що плануєте, площа, місто — порахую орієнтовну вартість. Можна надіслати фото, план, PDF чи голосове.',
  ru: 'Здравствуйте! Я помощник студии CAS Development. Расскажите об объекте: что планируете, площадь, город — посчитаю ориентировочную стоимость. Можно прислать фото, план, PDF или голосовое.',
  en: 'Hello! I am the CAS Development studio assistant. Tell me about your project — what you plan, the area and the city — and I will give you an approximate cost. You can send photos, a floor plan, a PDF or a voice message.',
  es: '¡Hola! Soy el asistente del estudio CAS Development. Cuénteme su proyecto: qué planea, la superficie y la ciudad, y le daré un coste orientativo. Puede enviar fotos, un plano, un PDF o un mensaje de voz.',
  zh: '您好！我是 CAS Development 工作室的助手。请介绍您的项目：计划做什么、面积和城市——我会给出大致费用。可以发送照片、平面图、PDF 或语音。',
  pl: 'Dzień dobry! Jestem asystentem studia CAS Development. Proszę opisać obiekt: co Pan/Pani planuje, metraż i miasto — policzę orientacyjny koszt. Można wysłać zdjęcia, plan, PDF lub wiadomość głosową.',
  de: 'Guten Tag! Ich bin der Assistent des Studios CAS Development. Erzählen Sie mir von Ihrem Objekt – Vorhaben, Fläche, Stadt –, und ich nenne Ihnen einen ungefähren Preis. Sie können Fotos, einen Grundriss, ein PDF oder eine Sprachnachricht senden.',
  fr: 'Bonjour ! Je suis l’assistant du studio CAS Development. Parlez-moi de votre projet — ce que vous prévoyez, la surface, la ville — et je vous donnerai un coût indicatif. Vous pouvez envoyer des photos, un plan, un PDF ou un message vocal.',
  pt: 'Olá! Sou o assistente do estúdio CAS Development. Fale-me do seu projeto — o que planeia, a área e a cidade — e dou-lhe um custo indicativo. Pode enviar fotografias, uma planta, um PDF ou uma mensagem de voz.',
  ar: 'مرحبًا! أنا مساعد استوديو CAS Development. أخبرني عن مشروعك: ما الذي تخطط له والمساحة والمدينة، وسأعطيك تكلفة تقريبية. يمكنك إرسال صور أو مخطط أو ملف PDF أو رسالة صوتية.',
});
// системне повідомлення в розмові, коли відвідувач лишив номер
export const GOT_PHONE = dict({
  uk: 'Дякуємо! Номер отримали — менеджер звʼяжеться з вами в робочий час: Пн–Пт 10:00–20:00.',
  ru: 'Спасибо! Номер получили — менеджер свяжется с вами в рабочее время: Пн–Пт 10:00–20:00.',
  en: 'Thank you! We have your number — a manager will contact you during working hours: Mon–Fri 10:00–20:00 (Kyiv time).',
  es: '¡Gracias! Tenemos su número: un gestor le contactará en horario laboral, lun–vie 10:00–20:00 (hora de Kiev).',
  zh: '谢谢！已收到您的号码——经理将在工作时间与您联系：周一至周五 10:00–20:00（基辅时间）。',
  pl: 'Dziękujemy! Mamy numer — menedżer skontaktuje się w godzinach pracy: pn–pt 10:00–20:00 (czas kijowski).',
  de: 'Danke! Wir haben Ihre Nummer – ein Manager meldet sich zu den Geschäftszeiten: Mo–Fr 10:00–20:00 (Kyjiwer Zeit).',
  fr: 'Merci ! Nous avons votre numéro — un responsable vous contactera aux heures ouvrables : lun–ven 10:00–20:00 (heure de Kyiv).',
  pt: 'Obrigado! Recebemos o seu número — um gestor contactá-lo-á no horário de trabalho: seg–sex 10:00–20:00 (hora de Kyiv).',
  ar: 'شكرًا! استلمنا رقمك — سيتواصل معك المدير خلال ساعات العمل: الاثنين–الجمعة 10:00–20:00 (بتوقيت كييف).',
});

// ===== ідентифікатори й токен =====
const rnd = n => hexOf(crypto.getRandomValues(new Uint8Array(n)));
export const newSid = () => rnd(16);
export const newToken = () => rnd(32);
export const newFileId = () => rnd(12);
export const tokenHash = async t => hexOf(await sha256('chat|' + t));
const SID_RE = /^[0-9a-f]{32}$/, TOKEN_RE = /^[0-9a-f]{64}$/;
export const FILE_RE = /^[0-9a-f]{24}$/;
export const now = () => Math.floor(Date.now() / 1000);

// Публічні POST — лише зі сторінок свого сайту: Origin обовʼязковий і наш (спільний middleware пропускає запити без Origin — сервер-сервер)
const OWN = ['https://cas-develop.com', 'https://www.cas-develop.com'];
export function ownOrigin(request) {
  const o = request.headers.get('origin');
  return !!o && (o === new URL(request.url).origin || OWN.includes(o));
}

// sid і token запиту: заголовки → тіло → параметри адреси
export function creds(request, body) {
  const u = new URL(request.url);
  const sid = request.headers.get('x-chat-sid') || (body && body.sid) || u.searchParams.get('sid') || '';
  const token = request.headers.get('x-chat-token') || (body && body.token) || u.searchParams.get('token') || '';
  return { sid: String(sid), token: String(token) };
}

export class ChatError extends Error { constructor(msg, status = 400, extra = {}) { super(msg); this.status = status; this.extra = extra; } }
export const NOT_FOUND = 'Розмову не знайдено';
export const NOT_READY = 'Чат ще не готовий (міграція 0021)';
// Обробник: ChatError → відповідь; немає таблиць → 503; решта — 500 у спільному middleware
export async function wrap(fn) {
  try { return await fn(); }
  catch (e) {
    if (e instanceof ChatError) return json({ error: e.message, ...e.extra }, e.status);
    if (noTable(e)) return bad(NOT_READY, 503);
    throw e;
  }
}

export async function session(env, request, body) {
  const { sid, token } = creds(request, body);
  if (!SID_RE.test(sid) || !TOKEN_RE.test(token)) throw new ChatError(NOT_FOUND, 404);
  const s = await env.DB.prepare('SELECT * FROM chat_sessions WHERE sid = ?').bind(sid).first();
  const h = await tokenHash(token);
  // рівночасово: навіть без розмови порівнюємо з фіктивним хешем тієї ж довжини
  if (!same(h, s ? s.token_hash : '0'.repeat(64)) || !s) throw new ChatError(NOT_FOUND, 404);
  return s;
}

// Воркер живий: settings.chat_bot_ping = unix-час останнього POST /api/bot/chat/ping
export async function botOnline(env, t = now()) {
  try {
    const r = await env.DB.prepare("SELECT value FROM settings WHERE key = 'chat_bot_ping'").first();
    return !!r && t - Number(r.value) <= L.online;
  } catch { return false; }
}
export async function setPing(env, t = now()) {
  await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('chat_bot_ping', ?1) ON CONFLICT(key) DO UPDATE SET value = ?1").bind(String(t)).run();
}

// ===== текст =====
// керівні символи (крім \n і \t) прибираємо, \r\n → \n, обрізаємо пробіли по краях
export const clean = (v, max) => {
  if (v == null) return '';
  return String(v).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, '').trim().slice(0, max);
};
// шлях сторінки свого сайту (як refPath у functions/api/leads.js), ≤ 160
export const pagePath = v => {
  if (typeof v !== 'string') return null;
  let s = v.trim();
  try { if (/^https?:\/\//.test(s)) { const u = new URL(s); if (!/(^|\.)cas-develop\.com$|\.pages\.dev$|^localhost$/.test(u.hostname)) return null; s = u.pathname; } } catch { return null; }
  return s.length <= 160 && /^\/(?![\/\\])[^\s\x00-\x1f\x7f?#\\<>"'`]*$/.test(s) ? s : null;
};
export const langOf = v => (LANGS.includes(v) ? v : 'uk');

// ===== файли =====
// розширення → [mime для зберігання, вид, перевірка сигнатури]. Чого немає в списку (html, svg, js, exe, bat, php…) — 415.
const at = (b, i, s) => [...s].every((c, k) => b[i + k] === c.charCodeAt(0));
const hasNul = (b, n = 8192) => { for (let i = 0; i < Math.min(n, b.length); i++) if (b[i] === 0) return true; return false; };
const firstChar = b => { let i = 0; if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) i = 3; while (i < b.length && /\s/.test(String.fromCharCode(b[i]))) i++; return String.fromCharCode(b[i] || 0); };
const textOk = b => !hasNul(b) && firstChar(b) !== '<';
const SIG = {
  jpeg: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  png: b => at(b, 0, '\x89PNG\r\n\x1a\n'),
  webp: b => at(b, 0, 'RIFF') && at(b, 8, 'WEBP'),
  heic: b => at(b, 4, 'ftyp') && ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'heim', 'heis', 'avif'].some(x => at(b, 8, x)),
  ftyp: b => at(b, 4, 'ftyp'),
  mov: b => ['ftyp', 'moov', 'wide', 'mdat', 'free', 'skip', 'pnot'].some(x => at(b, 4, x)),
  ebml: b => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3,
  ogg: b => at(b, 0, 'OggS'),
  mp3: b => at(b, 0, 'ID3') || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0),
  wav: b => at(b, 0, 'RIFF') && at(b, 8, 'WAVE'),
  aac: b => b[0] === 0xff && (b[1] & 0xf6) === 0xf0,
  pdf: b => { for (let i = 0; i <= Math.min(1024, b.length - 5); i++) if (at(b, i, '%PDF-')) return true; return false; },
  zip: b => at(b, 0, 'PK\x03\x04'),
  ole: b => [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every((x, i) => b[i] === x),
  dwg: b => at(b, 0, 'AC10'),
  dxf: b => at(b, 0, 'AutoCAD Binary DXF') || textOk(b),
  m3ds: b => b[0] === 0x4d && b[1] === 0x4d,
  ifc: b => { let i = b[0] === 0xef ? 3 : 0; while (/\s/.test(String.fromCharCode(b[i] || 0)) && i < 64) i++; return at(b, i, 'ISO-10303-21'); },
  text: textOk,
  bin: b => firstChar(b) !== '<',
};
export const TYPES = dict({
  jpg: ['image/jpeg', 'image', SIG.jpeg], jpeg: ['image/jpeg', 'image', SIG.jpeg], png: ['image/png', 'image', SIG.png], webp: ['image/webp', 'image', SIG.webp],
  heic: ['image/heic', 'image', SIG.heic], heif: ['image/heif', 'image', SIG.heic],
  mp4: ['video/mp4', 'video', SIG.ftyp], mov: ['video/quicktime', 'video', SIG.mov], webm: ['video/webm', 'video', SIG.ebml],
  ogg: ['audio/ogg', 'audio', SIG.ogg], oga: ['audio/ogg', 'audio', SIG.ogg], opus: ['audio/ogg', 'audio', SIG.ogg], mp3: ['audio/mpeg', 'audio', SIG.mp3],
  m4a: ['audio/mp4', 'audio', SIG.ftyp], aac: ['audio/aac', 'audio', SIG.aac], wav: ['audio/wav', 'audio', SIG.wav],
  pdf: ['application/pdf', 'pdf', SIG.pdf],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'sheet', SIG.zip], xls: ['application/vnd.ms-excel', 'sheet', SIG.ole],
  csv: ['text/csv', 'sheet', SIG.text],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'doc', SIG.zip],
  dwg: ['image/vnd.dwg', 'cad', SIG.dwg], dxf: ['image/vnd.dxf', 'cad', SIG.dxf], '3ds': ['application/x-3ds', 'model', SIG.m3ds],
  // «файл для менеджера»: воркер їх не розбирає (tools/chat/API.md), лише передає людині
  skp: ['application/vnd.sketchup.skp', 'model', SIG.bin], ifc: ['application/x-step', 'model', SIG.ifc], rvt: ['application/octet-stream', 'model', SIG.ole],
  zip: ['application/zip', 'archive', SIG.zip],
});
export const ACCEPT = Object.keys(TYPES).map(x => '.' + x).join(',');
// webm і ogg голосу з браузера — аудіо, якщо браузер так каже (MediaRecorder: audio/webm;codecs=opus); webm з камерою — відео
export function typeOf(name, mime) {
  const ext = (/\.([a-z0-9]{1,5})$/i.exec(name || '') || [])[1];
  const t = ext && TYPES[ext.toLowerCase()];
  if (!t) return null;
  let [m, kind, sig] = t;
  if (ext.toLowerCase() === 'webm' && /^audio\//i.test(mime || '')) { m = 'audio/webm'; kind = 'audio'; }
  if (ext.toLowerCase() === 'mp4' && /^audio\//i.test(mime || '')) { m = 'audio/mp4'; kind = 'audio'; }
  return { ext: ext.toLowerCase(), mime: m, kind, sig };
}
// імʼя файлу: без шляху, керівних символів, лапок і < > ; ≤ 120 символів зі збереженим розширенням
export function fileName(v) {
  let s = String(v || '').split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f"<>`\\|*?:]/g, '').replace(/\s+/g, ' ').trim();
  if (s.length > 120) { const m = /(\.[a-z0-9]{1,5})$/i.exec(s); s = s.slice(0, 120 - (m ? m[1].length : 0)) + (m ? m[1] : ''); }
  return s || null;
}
// тип, з яким файл віддаємо: зображення, аудіо й відео — своїм (неактивні), решта — двійкові дані
export const serveMime = f => (/^(image\/(jpeg|png|webp|heic|heif)|audio\/(webm|ogg|mpeg|mp4|aac|wav)|video\/(mp4|quicktime|webm))$/.test(f.mime) ? f.mime : 'application/octet-stream');

export async function readCapped(request, max) {
  const len = request.headers.get('content-length');
  if (len && +len > max) throw new ChatError('Файл завеликий', 413, { too_big: true, max });
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader(), parts = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > max) { try { await reader.cancel(); } catch { /* noop */ } throw new ChatError('Файл завеликий', 413, { too_big: true, max }); }
    parts.push(value);
  }
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export const hasR2 = env => !!(env.MEDIA && typeof env.MEDIA.put === 'function');
export const limits = env => (hasR2(env) ? { file: L.fileR2, session: L.sessR2, r2: true } : { file: L.fileD1, session: L.sessD1, r2: false });

export async function putFile(env, s, f, bytes) {
  const id = newFileId();
  if (hasR2(env)) {
    const key = `chat/${s.sid}/${id}`;
    await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: f.mime } });
    await env.DB.prepare('INSERT INTO chat_files (id, session_id, role, name, mime, kind, size, r2_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, s.id, f.role || 'user', f.name, f.mime, f.kind, bytes.length, key).run();
  } else {
    await env.DB.prepare('INSERT INTO chat_files (id, session_id, role, name, mime, kind, size, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, s.id, f.role || 'user', f.name, f.mime, f.kind, bytes.length, bytes).run();
  }
  return id;
}

// Відповідь з байтами файлу: завжди як вкладення, без вгадування типу, у пісочниці
export async function fileResponse(env, f) {
  let body = f.data;
  if (f.r2_key) {
    if (!hasR2(env)) return bad('Файл недоступний', 404);
    const o = await env.MEDIA.get(f.r2_key);
    if (!o) return bad('Файл недоступний', 404);
    body = o.body;
  }
  if (body == null) return bad('Файл недоступний', 404);
  if (Array.isArray(body)) body = new Uint8Array(body);
  const ascii = String(f.name || 'file').replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return new Response(body, { headers: {
    'content-type': serveMime(f), 'content-disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(f.name || 'file')}`,
    'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox", 'cache-control': 'private, no-store',
    'cross-origin-resource-policy': 'same-origin',
  } });
}

export async function deleteFiles(env, rows) {
  if (!rows.length) return 0;
  if (hasR2(env)) for (const f of rows) if (f.r2_key) { try { await env.MEDIA.delete(f.r2_key); } catch (e) { console.log('chat r2 delete', e && e.message); } }
  await env.DB.prepare(`DELETE FROM chat_files WHERE id ${IN_IDS}`).bind(idsArg(rows.map(f => f.id))).run();
  return rows.length;
}

// ===== повідомлення =====
const fileMeta = f => ({ id: f.id, name: f.name, mime: f.mime, kind: f.kind, size: f.size });
const parseJ = s => { try { return s ? JSON.parse(s) : null; } catch { return null; } };
// повідомлення розмови з файлами: where — умова на m (без параметрів, крім args)
export async function messages(env, sessionId, where = '1=1', args = [], limit = 100, desc = false) {
  const { results } = await env.DB.prepare(`SELECT * FROM chat_messages m WHERE m.session_id = ? AND ${where} ORDER BY m.id ${desc ? 'DESC' : ''} LIMIT ?`)
    .bind(sessionId, ...args, limit).all();
  const list = desc ? results.reverse() : results;
  const ids = list.map(m => m.id);
  const files = {}, audio = {};
  if (ids.length) {
    const { results: fr } = await env.DB.prepare(`SELECT id, message_id, role, name, mime, kind, size FROM chat_files WHERE session_id = ? AND message_id ${IN_IDS}`)
      .bind(sessionId, idsArg(ids)).all();
    for (const f of fr) {
      if (f.role === 'bot') audio[f.id] = f;
      else (files[f.message_id] = files[f.message_id] || []).push(fileMeta(f));
    }
  }
  return list.map(m => {
    const o = { id: m.id, role: m.role, text: m.text || '', files: files[m.id] || [], at: m.created_at };
    if (m.audio_id && audio[m.audio_id]) o.audio = { id: m.audio_id, mime: audio[m.audio_id].mime, dur: m.audio_dur || null };
    const est = parseJ(m.estimate);
    if (est) o.estimate = est;
    if (m.role === 'staff' && m.author) o.author = m.author;
    return o;
  });
}

export async function addMessage(env, s, role, text, extra = {}) {
  const r = await env.DB.prepare('INSERT INTO chat_messages (session_id, role, text, audio_id, audio_dur, estimate, author) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(s.id, role, text || null, extra.audio_id || null, extra.audio_dur || null, extra.estimate ? JSON.stringify(extra.estimate) : null, extra.author || null).run();
  return r.meta.last_row_id;
}

// ===== розрахунок (estimate) від воркера — схема в tools/chat/API.md =====
const num = (v, k) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 1e9) throw new ChatError(`estimate.${k}: число 0…1e9 або null`);
  return Math.round(n * 100) / 100;
};
const s1 = (v, n) => clean(v, n) || null;
export function estimateOf(e) {
  if (e == null) return null;
  if (typeof e !== 'object' || Array.isArray(e)) throw new ChatError('estimate: очікуємо обʼєкт');
  if (!Array.isArray(e.lines) || !e.lines.length || e.lines.length > 20) throw new ChatError('estimate.lines: від 1 до 20 рядків');
  const cur = e.currency == null ? 'USD' : String(e.currency);
  if (!['USD', 'EUR', 'UAH'].includes(cur)) throw new ChatError('estimate.currency: USD | EUR | UAH');
  const lines = e.lines.map((x, i) => {
    if (!x || typeof x !== 'object' || Array.isArray(x)) throw new ChatError(`estimate.lines[${i}]: очікуємо обʼєкт`);
    const label = s1(x.label, 160);
    if (!label) throw new ChatError(`estimate.lines[${i}].label обовʼязковий`);
    return { label, qty: num(x.qty, 'qty'), unit: s1(x.unit, 12), rate: num(x.rate, 'rate'), from: num(x.from, 'from'), note: s1(x.note, 160) };
  });
  return { currency: cur, region: e.region === 'eu' ? 'eu' : 'ua', lines, total_from: num(e.total_from, 'total_from'), note: s1(e.note, 500) };
}

// ===== заявка CRM з розмови =====
const noColumn = e => /no such column|has no column/i.test(String(e && e.message));
// Створює заявку (orders.kind = lead, source = chat) або повертає наявну; сповіщення адмінам — як у форми (notifyNew).
export async function leadFromChat(env, s, { phone, name, by, waitUntil } = {}) {
  if (s.order_id) {
    const o = await env.DB.prepare('SELECT id, number FROM orders WHERE id = ?').bind(s.order_id).first();
    if (o) return { id: o.id, number: o.number, existing: true };
  }
  const { results } = await env.DB.prepare("SELECT text FROM chat_messages WHERE session_id = ? AND role = 'user' AND text IS NOT NULL ORDER BY id DESC LIMIT 6").bind(s.id).all();
  const said = results.reverse().map(r => '• ' + str(r.text, 300)).join('\n');
  const comment = [`Чат на сайті: ${ADMIN_URL(s.id)}`, said ? `Писали в чаті:\n${said}` : null].filter(Boolean).join('\n').slice(0, 1500);
  const number = await nextLeadNumber(env);
  const page = s.page ? 'https://cas-develop.com' + s.page : null;
  const base = [number, str(name, 120) || 'Без імені', phone || null, 'Чат на сайті', 'chat', comment];
  const meta = [['form', 'chat'], ['lang', s.lang], ['utm', null], ['ref_path', s.page], ['ref_host', refHost(s.ref_host || '')]];
  let r;
  for (const cols of [meta, meta.slice(0, 4), meta.slice(0, 3), []]) {
    try {
      r = await env.DB.prepare(`INSERT INTO orders (number, kind, name, phone, items, service, source, comment, status${cols.map(c => ', ' + c[0]).join('')})
          VALUES (?, 'lead', ?, ?, '[]', ?, ?, ?, 'new'${', ?'.repeat(cols.length)})`).bind(...base, ...cols.map(c => c[1])).run();
      break;
    } catch (e) { if (!noColumn(e) || !cols.length) throw e; }
  }
  const id = r.meta.last_row_id;
  await env.DB.prepare("INSERT INTO order_events (order_id, status, note, author) VALUES (?, 'new', ?, ?)").bind(id, 'Чат на сайті', by || 'chat').run();
  await env.DB.prepare("UPDATE chat_sessions SET order_id = ?, last_at = datetime('now') WHERE id = ?").bind(id, s.id).run();
  const alert = notifyNew(env, id, { form: 'chat', page, ref_host: s.ref_host });
  if (typeof waitUntil === 'function') waitUntil(alert); else await alert;
  return { id, number };
}

// «Потрібна людина»: стан waiting + сповіщення власнику й менеджерам (адресати заявок)
export async function handoff(env, s, reason) {
  const u = await env.DB.prepare("UPDATE chat_sessions SET state = 'waiting', last_at = datetime('now') WHERE id = ? AND state IN ('bot', 'closed')").bind(s.id).run();
  if (!u.meta.changes) return 0;
  const last = await env.DB.prepare("SELECT text FROM chat_messages WHERE session_id = ? AND role = 'user' AND text IS NOT NULL ORDER BY id DESC LIMIT 1").bind(s.id).first();
  const text = [`💬 <b>Чат на сайті: потрібна людина</b>`, `Розмова #${s.id} · ${escHtml(s.lang || 'uk')} · ${escHtml(s.page || '/')}`,
    reason ? `Причина: ${escHtml(str(reason, 200))}` : null, last ? `Останнє: «${escHtml(str(last.text, 300))}»` : null].filter(Boolean).join('\n');
  return notifyTeam(env, text, ADMIN_URL(s.id));
}

// ===== очищення за терміном (розклад /api/admin/lead-sla) =====
// розмови без заявки: остання подія > 30 діб тому — видаляємо разом із повідомленнями й файлами;
// файли розмов без заявки старші за 14 діб і файли, завантажені, але не надіслані за добу, — видаляємо (повідомлення лишаються).
export async function runChatCleanup(env, at = new Date()) {
  try {
    const t = at.getTime(), iso = ms => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
    const old = await env.DB.prepare('SELECT id FROM chat_sessions WHERE order_id IS NULL AND last_at < ? ORDER BY id LIMIT 200').bind(iso(t - L.keepDays * 86400000)).all();
    const sids = old.results.map(r => r.id);
    let files = 0;
    if (sids.length) {
      const { results } = await env.DB.prepare(`SELECT id, r2_key FROM chat_files WHERE session_id ${IN_IDS}`).bind(idsArg(sids)).all();
      for (let i = 0; i < results.length; i += 500) files += await deleteFiles(env, results.slice(i, i + 500));
      await env.DB.prepare(`DELETE FROM chat_messages WHERE session_id ${IN_IDS}`).bind(idsArg(sids)).run();
      await env.DB.prepare(`DELETE FROM chat_sessions WHERE id ${IN_IDS}`).bind(idsArg(sids)).run();
    }
    const { results: stale } = await env.DB.prepare(`SELECT f.id, f.r2_key FROM chat_files f JOIN chat_sessions s ON s.id = f.session_id
        WHERE (s.order_id IS NULL AND f.created_at < ?) OR (f.message_id IS NULL AND f.created_at < ?) ORDER BY f.created_at LIMIT 500`)
      .bind(iso(t - L.keepFilesDays * 86400000), iso(t - L.orphanHours * 3600000)).all();
    files += await deleteFiles(env, stale);
    return { sessions: sids.length, files };
  } catch (e) {
    if (noTable(e)) return { skipped: 'no_migration' };
    throw e;
  }
}
