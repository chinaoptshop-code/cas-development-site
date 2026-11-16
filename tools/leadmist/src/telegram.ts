// Мінімальний клієнт Telegram Bot API (plain fetch, без залежностей).

import type { Env } from './env';

export interface InlineButton { text: string; callback_data?: string; url?: string }
export type InlineKeyboard = InlineButton[][];

export interface TgUser { id: number; username?: string; first_name?: string }
export interface TgMessage { message_id: number; chat: { id: number; type: string }; from?: TgUser; text?: string }
export interface TgCallback { id: string; from: TgUser; data?: string; message?: TgMessage }
export interface TgUpdate { update_id: number; message?: TgMessage; callback_query?: TgCallback }

export class Telegram {
  constructor(private env: Env) {}

  private url(method: string) {
    return `${this.env.TG_API_BASE || 'https://api.telegram.org'}/bot${this.env.TELEGRAM_BOT_TOKEN}/${method}`;
  }

  async call(method: string, body: Record<string, unknown>): Promise<unknown> {
    const res = await fetch(this.url(method), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string; result?: unknown };
    if (!j.ok) console.warn(`tg ${method} failed: ${res.status} ${j.description ?? ''}`);
    return j.result;
  }

  send(chatId: number, text: string, opts: { keyboard?: InlineKeyboard; reply?: unknown } = {}) {
    const body: Record<string, unknown> = { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true };
    if (opts.keyboard) body.reply_markup = { inline_keyboard: opts.keyboard };
    else if (opts.reply) body.reply_markup = opts.reply;
    return this.call('sendMessage', body);
  }

  editKeyboard(chatId: number, messageId: number, keyboard: InlineKeyboard) {
    return this.call('editMessageReplyMarkup', { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: keyboard } });
  }

  answer(callbackId: string, text?: string) {
    return this.call('answerCallbackQuery', { callback_query_id: callbackId, text });
  }

  async sendDocument(chatId: number, filename: string, content: string, caption: string) {
    const fd = new FormData();
    fd.append('chat_id', String(chatId));
    fd.append('caption', caption);
    fd.append('document', new Blob(['﻿' + content], { type: 'text/csv' }), filename);
    const res = await fetch(this.url('sendDocument'), { method: 'POST', body: fd });
    if (!res.ok) console.warn(`tg sendDocument failed: ${res.status}`);
  }
}

export function mainMenu(d: { menu_give: string; menu_leads: string; menu_deals: string; menu_profile: string; menu_help: string }) {
  return {
    keyboard: [[{ text: d.menu_give }], [{ text: d.menu_leads }, { text: d.menu_deals }], [{ text: d.menu_profile }, { text: d.menu_help }]],
    resize_keyboard: true,
    is_persistent: true,
  };
}
