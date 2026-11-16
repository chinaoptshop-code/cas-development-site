// Експорт CSV для модератора/бухгалтерії. Без контактів клієнтів і хешів.

import { all } from './db';

export const EXPORTS = {
  members: `SELECT id, company, edrpou, status, verified, categories, regions, budget_min, budget_max,
              rating_avg, deals_closed, avg_response_min, created_at, approved_at FROM members ORDER BY id`,
  leads: `SELECT l.id, m.company AS referrer, l.category, l.region, l.area, l.area_unit, l.budget_band, l.timing,
            l.commission_pct, l.status, l.wave, l.duplicate_of, l.created_at, l.expires_at
          FROM leads l JOIN members m ON m.id = l.referrer_id ORDER BY l.id`,
  deals: `SELECT dl.id, dl.lead_id, m.company AS receiver, dl.status, dl.contract_amount_cents / 100.0 AS contract_usd,
            dl.revealed_at, dl.contacted_at, dl.signed_at, dl.status_changed_at, dl.created_at
          FROM deals dl JOIN members m ON m.id = dl.receiver_id ORDER BY dl.id`,
  commissions: `SELECT c.id, c.deal_id, dl.lead_id, rcv.company AS receiver, ref.company AS referrer, c.pct,
            c.base_cents / 100.0 AS tranche_usd, c.referrer_cents / 100.0 AS referrer_usd,
            c.platform_fee_cents / 100.0 AS platform_fee_usd, c.status, c.created_at, c.referrer_confirmed_at
          FROM commissions c JOIN deals dl ON dl.id = c.deal_id JOIN leads l ON l.id = dl.lead_id
          JOIN members rcv ON rcv.id = dl.receiver_id JOIN members ref ON ref.id = l.referrer_id ORDER BY c.id`,
} as const;

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return '';
    let s = String(v);
    if (/^[=+\-@]/.test(s)) s = "'" + s; // захист від формул у Excel/Sheets
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n') + '\n';
}

export async function exportCsv(db: D1Database, what: keyof typeof EXPORTS) {
  const rows = await all<Record<string, unknown>>(db, EXPORTS[what]);
  return { csv: toCsv(rows), n: rows.length };
}
