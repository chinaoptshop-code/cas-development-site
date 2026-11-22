// Зовнішнє джерело візиту заявки (orders.ref_host, migrations/0019_lead_ref_host.sql): перевірка хоста й людські назви.
// Браузер (assets/lead-form.v1.js, site-chrome.v1.js) запамʼятовує лише хост document.referrer чужого сайту — у sessionStorage
// на першому заході в сесії. Сервер приймає тільки валідне імʼя хоста; решта (шляхи, схеми, розмітка, задовге) — null.

const OWN = /(^|\.)cas-develop\.com$|\.pages\.dev$/;
// хост: нижній регістр, без «www.», ≤ 80 символів, мітки [a-z0-9-] (не з «-» на краях), щонайменше одна крапка, домен верхнього рівня — літери
export const refHost = v => {
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase().replace(/^www\./, '');
  if (s.length < 3 || s.length > 80) return null;
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,24}|xn--[a-z0-9-]{1,59})$/.test(s)) return null;
  return OWN.test(s) ? null : s;
};

// відомі джерела: [ключ фільтра, назва, домени (хост = домен або його піддомен)]; Google — будь-яка доменна зона (google.com.ua, google.de…)
export const REF_SOURCES = [
  ['google', 'Google', []],
  ['chatgpt', 'ChatGPT', ['chatgpt.com', 'chat.openai.com']],
  ['perplexity', 'Perplexity', ['perplexity.ai']],
  ['bing', 'Bing / Copilot', ['bing.com', 'copilot.microsoft.com']],
  ['instagram', 'Instagram', ['instagram.com']],
  ['facebook', 'Facebook', ['facebook.com', 'fb.com']],
  ['x', 'X (Twitter)', ['t.co', 'x.com', 'twitter.com']],
  ['linkedin', 'LinkedIn', ['linkedin.com', 'lnkd.in']],
  ['tiktok', 'TikTok', ['tiktok.com']],
  ['youtube', 'YouTube', ['youtube.com', 'youtu.be']],
  ['behance', 'Behance', ['behance.net']],
  ['telegram', 'Telegram', ['t.me', 'telegram.org', 'telegram.me']],
];
const isGoogle = h => /(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(h);
const match = (h, ds) => ds.some(d => h === d || h.endsWith('.' + d));
export const refSourceKey = h => {
  if (!h) return null;
  for (const [k, , ds] of REF_SOURCES) if (k === 'google' ? isGoogle(h) : match(h, ds)) return k;
  return 'other';
};
// людська назва: відоме джерело — його назва, решта — сам хост
export const refHostLabel = h => {
  const k = refSourceKey(h);
  return !k ? null : k === 'other' ? h : REF_SOURCES.find(s => s[0] === k)[1];
};

// SQL-умова для фільтра CRM ?rh=<ключ> (any — будь-яке зовнішнє, other — не з відомих); шаблони LIKE — лише сталі рядки з цього файлу
function known(k) {
  const [, , ds] = REF_SOURCES.find(s => s[0] === k);
  if (k === 'google') return { sql: "(o.ref_host LIKE 'google.%' OR o.ref_host LIKE '%.google.%')", args: [] };
  return { sql: '(' + ds.map(() => 'o.ref_host = ? OR o.ref_host LIKE ?').join(' OR ') + ')', args: ds.flatMap(d => [d, '%.' + d]) };
}
export function refHostWhere(key) {
  if (key === 'any') return { sql: ' AND o.ref_host IS NOT NULL', args: [] };
  if (key === 'other') {
    const all = REF_SOURCES.map(s => known(s[0]));
    return { sql: ' AND o.ref_host IS NOT NULL AND NOT (' + all.map(a => a.sql).join(' OR ') + ')', args: all.flatMap(a => a.args) };
  }
  if (!REF_SOURCES.some(s => s[0] === key)) return null;
  const a = known(key);
  return { sql: ' AND ' + a.sql, args: a.args };
}
