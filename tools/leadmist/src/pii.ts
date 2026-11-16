// Автоперевірка тексту картки ліда на персональні дані.
// Консервативно: краще зайвий раз попросити переписати, ніж опублікувати телефон чи ім'я клієнта.

export type PiiKind = 'phone' | 'email' | 'link' | 'handle' | 'address' | 'name' | 'id_number';
export interface PiiHit { kind: PiiKind; match: string }

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.\p{L}{2,}/gu;
const OBFUSCATED_EMAIL = /[\p{L}\p{N}._-]+\s*(?:\(|\[)?\s*(?:at|собака|равлик)\s*(?:\)|\])?\s*[\p{L}\p{N}-]+\s*(?:\.|dot|крапка)\s*\p{L}{2,}/giu;
const LINK = /\b(?:https?:\/\/|www\.)\S+|\b(?:t\.me|wa\.me|viber\.click|instagram\.com|facebook\.com)\/\S+/giu;
const HANDLE = /(?:^|[\s(,;:])@[A-Za-z][A-Za-z0-9_]{3,}/g;
// Послідовності цифр із роздільниками: телефон — 10–13 цифр (або +380… / 0XX…).
const DIGIT_RUN = /\+?\d[\d\s\-().]{6,}\d/g;
const ADDRESS = /(?:^|[\s,(])(?:вул|вулиця|просп|проспект|пров|провулок|бульв|бульвар|пл|площа|ул|улица|шосе|узвіз)\.?\s+[\p{Lu}][\p{L}\d'’ʼ-]*(?:[\s,]+(?:буд\.?|будинок|д\.)?\s*\d+[\p{L}]?)?/giu;
const HOUSE_FLAT = /(?:^|[\s,])(?:буд|будинок|кв|квартира|д)\.?\s*№?\s*\d+[\p{L}]?(?:\s*,?\s*(?:кв|квартира)\.?\s*\d+)?/giu;
const NAME_WORDS = ['звати', 'зовуть', 'ім[\'’ʼ]я', 'імені', 'зовут', 'имя', 'клієнт(?:ка)?', 'замовни(?:к|ця)', 'пан', 'пані', 'господар(?:ка)?', 'власни(?:к|ця)'];
const NAME_INTRO = new RegExp(
  `(?<![\\p{L}])(?:${NAME_WORDS.map((w) => `[${w[0].toUpperCase()}${w[0]}]${w.slice(1)}`).join('|')})\\s*[:—-]?\\s+(\\p{Lu}[\\p{Ll}'’ʼ-]{1,})`,
  'gu',
);
// Поширені імена (uk/ru), з відмінковими закінченнями. Лише з великої літери.
const FIRST_NAMES = [
  'Олександр', 'Олександра', 'Олексій', 'Андрій', 'Анатолій', 'Антон', 'Артем', 'Богдан', 'Вадим', 'Валентин',
  'Василь', 'Віктор', 'Віталій', 'Володимир', 'Вячеслав', 'Генадій', 'Григорій', 'Денис', 'Дмитро', 'Євген',
  'Іван', 'Ігор', 'Кирило', 'Костянтин', 'Максим', 'Микола', 'Михайло', 'Назар', 'Олег', 'Павло', 'Петро',
  'Роман', 'Руслан', 'Сергій', 'Станіслав', 'Тарас', 'Юрій', 'Ярослав', 'Алла', 'Анна', 'Ганна', 'Валентина',
  'Вікторія', 'Галина', 'Дарина', 'Діана', 'Євгенія', 'Ірина', 'Катерина', 'Лариса', 'Людмила', 'Марина',
  'Марія', 'Наталія', 'Наталя', 'Оксана', 'Олена', 'Ольга', 'Світлана', 'Софія', 'Тетяна', 'Юлія', 'Яна',
  'Александр', 'Алексей', 'Андрей', 'Владимир', 'Дмитрий', 'Евгений', 'Игорь', 'Михаил', 'Николай', 'Сергей',
  'Юрий', 'Елена', 'Ирина', 'Наталья', 'Ольга', 'Татьяна', 'Екатерина', 'Светлана', 'Мария', 'Юлия',
];
const NAME_RE = new RegExp(
  `(?<![\\p{L}])(?:${FIRST_NAMES.map((n) => n.replace(/[ійяаоь]$/u, '')).join('|')})(?:[\\p{Ll}'’ʼ]{0,4})(?![\\p{L}])`,
  'gu',
);
const SURNAME = /(?<![\p{L}])\p{Lu}[\p{Ll}'’ʼ]{2,}(?:енко|чук|йчук|ук|юк|ович|евич|івна|ївна|овна|евна)(?![\p{L}])/gu;

function digits(s: string): string { return s.replace(/\D/g, ''); }

export function detectPii(text: string): PiiHit[] {
  const hits: PiiHit[] = [];
  const add = (kind: PiiKind, re: RegExp, group = 0) => {
    for (const m of text.matchAll(re)) hits.push({ kind, match: (m[group] ?? m[0]).trim() });
  };
  add('email', EMAIL);
  add('email', OBFUSCATED_EMAIL);
  add('link', LINK);
  add('handle', HANDLE);
  for (const m of text.matchAll(DIGIT_RUN)) {
    const s = m[0].trim();
    const d = digits(s);
    const phone =
      (s.startsWith('+') && d.length >= 9 && d.length <= 15) ||
      (d.startsWith('380') && d.length === 12) ||
      (d.startsWith('0') && d.length === 10) ||
      (d.startsWith('80') && d.length === 11);
    if (phone) hits.push({ kind: 'phone', match: s });
    else if (/^\d{8,}$/.test(s)) hits.push({ kind: 'id_number', match: s }); // ЄДРПОУ, РНОКПП, картка
  }
  add('address', ADDRESS);
  add('address', HOUSE_FLAT);
  add('name', NAME_INTRO, 1);
  add('name', NAME_RE);
  add('name', SURNAME);
  // унікальні
  const seen = new Set<string>();
  return hits.filter((h) => {
    const k = `${h.kind}:${h.match}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function hasPii(text: string): boolean { return detectPii(text).length > 0; }

/** Нормалізація телефону UA до 380XXXXXXXXX (для хешу дедуплікації). */
export function normalizePhone(raw: string): string | null {
  let d = digits(raw);
  if (d.length === 10 && d.startsWith('0')) d = '38' + d;
  if (d.length === 9) d = '380' + d;
  if (d.length === 11 && d.startsWith('80')) d = '3' + d;
  if (d.length < 10 || d.length > 13) return null;
  return d;
}

/** З тексту контакту дістає телефон або e-mail — ключ дедуплікації клієнта. */
export function contactKey(text: string): string | null {
  const email = text.match(EMAIL)?.[0];
  for (const m of text.matchAll(DIGIT_RUN)) {
    const p = normalizePhone(m[0]);
    if (p) return 'tel:' + p;
  }
  if (email) return 'mail:' + email.toLowerCase();
  return null;
}

/** Маска для сторінки згоди: +380 67 *** ** 89 / a***@mail.com */
export function maskContact(key: string): string {
  if (key.startsWith('tel:')) {
    const d = key.slice(4);
    return `+${d.slice(0, 3)} ${d.slice(3, 5)} *** ** ${d.slice(-2)}`;
  }
  const e = key.slice(5);
  const [u, dom] = e.split('@');
  return `${u[0]}***@${dom}`;
}
