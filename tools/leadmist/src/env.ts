export interface Env {
  DB: D1Database;
  PUBLIC_URL: string;
  BOT_USERNAME: string;
  ADMIN_TG_IDS: string;
  TERMS_VERSION: string;
  // секрети (wrangler secret put)
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  CONTACT_KEY: string;
  HASH_KEY: string;
  /** Лише для тестів/локального smoke: інша адреса Bot API. */
  TG_API_BASE?: string;
}

export function adminIds(env: Env): number[] {
  return (env.ADMIN_TG_IDS || '').split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0);
}

export function isAdmin(env: Env, tgId: number): boolean {
  return adminIds(env).includes(tgId);
}

export const nowIso = (d = new Date()) => d.toISOString();
export const addMs = (d: Date, ms: number) => new Date(d.getTime() + ms);
