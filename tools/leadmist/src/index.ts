// LeadMist / ЛідМіст — Cloudflare Worker: вебхук Telegram-бота, лендинг, умови, сторінка згоди, cron.

import { handleUpdate } from './bot';
import { safeEqual } from './crypto';
import { runCron } from './cron';
import type { Env } from './env';
import { consentGet, consentPost, html, landing, terms } from './pages';
import type { TgUpdate } from './telegram';

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const p = url.pathname.replace(/\/+$/, '') || '/';

    if (p === '/tg/webhook' && req.method === 'POST') {
      const secret = req.headers.get('x-telegram-bot-api-secret-token') ?? '';
      if (!env.TELEGRAM_WEBHOOK_SECRET || !safeEqual(secret, env.TELEGRAM_WEBHOOK_SECRET)) return new Response('forbidden', { status: 403 });
      const update = (await req.json().catch(() => null)) as TgUpdate | null;
      if (!update) return new Response('bad request', { status: 400 });
      // Telegram чекає швидкої відповіді; помилки логуються, щоб апдейт не повторювався нескінченно.
      try {
        await handleUpdate(env, update);
      } catch (err) {
        console.error('update failed', update.update_id, err);
      }
      return new Response('ok');
    }

    if (req.method === 'GET' && p === '/') return html(landing(env));
    if (req.method === 'GET' && p === '/terms') return html(terms(env));
    if (req.method === 'GET' && p === '/health') return new Response('ok');

    const m = p.match(/^\/c\/([A-Za-z0-9_-]{20,64})$/);
    if (m && req.method === 'GET') return consentGet(env, m[1]);
    if (m && req.method === 'POST') return consentPost(env, m[1], req);

    void ctx;
    return new Response('not found', { status: 404 });
  },

  async scheduled(_ev: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runCron(env).then((s) => console.log('cron', JSON.stringify(s))));
  },
};
