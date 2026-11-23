// Стенд сайту для наскрізного тесту воркера (test_e2e.py): справжні обробники functions/ через tools/tests/harness.mjs
// (D1 на node:sqlite з міграціями, мок Telegram, фейкове R2) за HTTP на 127.0.0.1. Друкує «PORT <n>».
//   GET /__tg — що «надіслано» в Telegram (сповіщення адмінам); решта /api/* — як на сайті.
import http from 'node:http';
import { bot, call, freshDB, makeEnv } from '../../tests/harness.mjs';

const KEY = process.env.STAND_KEY || 'stand-key-not-real-000000000';
const R2 = new Map();
const env = makeEnv(freshDB(), { LEADBOT_KEY: KEY, MEDIA: { async put(k, v) { R2.set(k, new Uint8Array(v)); }, async get(k) { return R2.has(k) ? { body: R2.get(k) } : null; }, async delete(k) { R2.delete(k); } } });

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/__tg') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(bot.calls)); }
    const chunks = []; for await (const c of req) chunks.push(c);
    const raw = chunks.length ? Buffer.concat(chunks) : null;
    const headers = { ip: '10.9.0.' + (req.headers['x-bot-key'] ? 9 : 5) };
    for (const k of ['content-type', 'x-chat-sid', 'x-chat-token', 'x-file-name', 'x-bot-key', 'origin']) if (req.headers[k]) headers[k] = req.headers[k];
    if (!req.headers.origin) headers.noOrigin = true;
    const r = await call(env, req.method, u.pathname + u.search, { raw: raw && raw.length ? new Uint8Array(raw) : null, headers });
    const h = {}; r.headers.forEach((v, k) => { if (!/content-length|content-encoding/.test(k)) h[k] = v; });
    res.writeHead(r.status, h); res.end(Buffer.from(r.buf));
  } catch (e) { if (!res.headersSent) res.writeHead(500); res.end(String(e && e.stack || e)); }
});
server.listen(0, '127.0.0.1', () => console.log('PORT ' + server.address().port));
