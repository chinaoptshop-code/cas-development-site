// Довідники MVP. Підписи — у src/i18n (коди тут мовонезалежні).

/** Типи робіт = категорії учасників. */
export const CATEGORIES = [
  'design', 'architecture', 'construction', 'renovation', 'restoration',
  'horeca', 'furniture', 'landscape', 'realty',
] as const;
export type Category = (typeof CATEGORIES)[number];

/** Регіони України (старт). 'UA' у профілі учасника = уся Україна. */
export const REGIONS = [
  'kyiv', 'kyiv_obl', 'lviv', 'odesa', 'dnipro', 'kharkiv', 'zaporizhzhia', 'vinnytsia',
  'ivano_frankivsk', 'zakarpattia', 'ternopil', 'khmelnytskyi', 'rivne', 'volyn',
  'zhytomyr', 'chernivtsi', 'cherkasy', 'chernihiv', 'poltava', 'sumy', 'kirovohrad',
  'mykolaiv', 'kherson', 'donetsk',
] as const;
export const ALL_UA = 'UA';

/** Діапазони бюджету (USD). hi = null — без верхньої межі. */
export const BUDGET_BANDS = {
  lt10: { lo: 0, hi: 10_000 },
  '10_30': { lo: 10_000, hi: 30_000 },
  '30_80': { lo: 30_000, hi: 80_000 },
  '80p': { lo: 80_000, hi: null },
} as const;
export type BudgetBand = keyof typeof BUDGET_BANDS;
export const BUDGET_BAND_KEYS = Object.keys(BUDGET_BANDS) as BudgetBand[];

export const TIMINGS = ['now', '1_3m', '3_6m', 'later'] as const;

export const COMMISSION_MIN = 5;
export const COMMISSION_MAX = 15;
export const COMMISSION_DEFAULT = 10;

export const HOUR = 3600_000;
export const DAY = 24 * HOUR;
export const EXCLUSIVE_MS = 24 * HOUR;      // ексклюзив топ-5
export const TOP_N = 5;
export const LEAD_TTL_MS = 7 * DAY;         // строк дії пропозиції
export const CONSENT_MS = 72 * HOUR;        // строк на згоду клієнта
export const CONTACT_MS = 24 * HOUR;        // зв'язатися після розкриття
export const STALE_MEMBER_MS = 14 * DAY;    // нагадування отримувачу
export const STALE_ADMIN_MS = 30 * DAY;     // сигнал модератору
export const RETENTION_MS = 730 * DAY;      // 24 міс. зберігання контактів (anti-bypass)
export const OTP_TTL_MS = 10 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;
export const NEW_MEMBER_MS = 30 * DAY;      // «новий учасник»
export const NEW_MEMBER_TAKES_PER_DAY = 3;  // ліміт «Взяти» на день для нових

export const LEAD_TERMS_VERSION = 'lead-2026-11-16-draft';
export const CONSENT_VERSION = 'consent-2026-11-16-draft';
