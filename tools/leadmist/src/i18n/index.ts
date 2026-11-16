import { uk, type Dict } from './uk';

export const LANGS: Record<string, Dict> = { uk };
export const DEFAULT_LANG = 'uk';

export function dict(lang?: string | null): Dict {
  return LANGS[lang ?? DEFAULT_LANG] ?? uk;
}

/** Підставляє {var}; значення HTML-екрануються, якщо не позначені як raw. */
export function fmt(tpl: string, vars: Record<string, string | number | null | undefined> = {}, raw: string[] = []): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = vars[k];
    if (v === undefined || v === null) return '';
    return raw.includes(k) ? String(v) : escapeHtml(String(v));
  });
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function label<K extends 'cat' | 'region' | 'budget' | 'timing' | 'unit' | 'deal_status' | 'lead_status'>(
  d: Dict, group: K, code: string,
): string {
  return (d[group] as Record<string, string>)[code] ?? code;
}
