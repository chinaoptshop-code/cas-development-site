#!/usr/bin/env node
// Локальний smoke-тест у справжньому рантаймі Workers (wrangler dev / workerd, локальна D1),
// без реального токена: Telegram Bot API підмінено локальним мок-сервером.
// Запуск: npm run smoke
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8787, TG_PORT = 8799;
const SECRET = 'smoke-webhook-secret-0123456789abcdef';
const persist = join(root, '.wrangler', 'smoke');
const devVars = join(root, '.dev.vars');
const hadDevVars = existsSync(devVars);

const sent = [];
const tg = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const method = req.url.split('/').pop();
    let j = {};
    try { j = JSON.parse(body); } catch { /* multipart */ }
    sent.push({ method, ...j });
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: true, result: {} }));
  });
});
await new Promise((r) => tg.listen(TG_PORT, '127.0.0.1', r));

if (!hadDevVars) {
  writeFileSync(devVars, [
    'TELEGRAM_BOT_TOKEN=SMOKE:TOKEN',
    `TELEGRAM_WEBHOOK_SECRET=${SECRET}`,
    `CONTACT_KEY=${Buffer.alloc(32, 7).toString('base64')}`,
    'HASH_KEY=smoke-hash-key-0123456789abcdef',
    `TG_API_BASE=http://127.0.0.1:${TG_PORT}`,
    'ADMIN_TG_IDS=900',
    'PUBLIC_URL=http://127.0.0.1:8787',
  ].join('\n') + '\n');
}

const wr = (args) => execFileSync('npx', ['wrangler', ...args], { cwd: root, stdio: 'pipe', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } }).toString();
rmSync(persist, { recursive: true, force: true });
wr(['d1', 'migrations', 'apply', 'leadmist', '--local', '--persist-to', persist]);

const dev = spawn('npx', ['wrangler', 'dev', '--local', '--port', String(PORT), '--persist-to', persist, '--test-scheduled', '--show-interactive-dev-session=false'],
  { cwd: root, env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
dev.stdout.on('data', (c) => (log += c));
dev.stderr.on('data', (c) => (log += c));

const base = `http://127.0.0.1:${PORT}`;
let ok = true;
const check = (name, cond) => { console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}`); if (!cond) ok = false; };

try {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(base + '/health')).ok) break; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  const landing = await fetch(base + '/');
  check('GET / → 200, бренд ЛідМіст', landing.ok && (await landing.text()).includes('ЛідМіст'));
  check('вебхук без секрету → 403', (await fetch(base + '/tg/webhook', { method: 'POST', body: '{}' })).status === 403);

  let u = 1;
  const hook = (update) => fetch(base + '/tg/webhook', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': SECRET },
    body: JSON.stringify({ update_id: u++, ...update }),
  });
  const msg = (id, text) => hook({ message: { message_id: u, chat: { id, type: 'private' }, from: { id, username: 'fake' }, text } });
  const r = await msg(111, '/start');
  check('фейковий апдейт /start → 200', r.ok);
  await msg(111, 'Тестова компанія');
  check('бот відповів через Bot API (мок)', sent.some((s) => s.method === 'sendMessage' && s.chat_id === 111 && /ЄДРПОУ/.test(s.text)));

  const cron = await fetch(base + '/__scheduled?cron=17+*+*+*+*');
  check('cron-тригер відпрацював', cron.ok);
} catch (e) {
  check('smoke: ' + e.message, false);
} finally {
  dev.kill('SIGTERM');
  tg.close();
  if (!hadDevVars) rmSync(devVars, { force: true });
}
if (!ok) { console.log('\n--- wrangler log ---\n' + log.slice(-4000)); process.exit(1); }
console.log('\nsmoke OK');
process.exit(0);
