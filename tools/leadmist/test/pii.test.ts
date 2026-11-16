import { describe, expect, it } from 'vitest';
import { contactKey, detectPii, maskContact, normalizePhone } from '../src/pii';

const kinds = (t: string) => [...new Set(detectPii(t).map((h) => h.kind))].sort();

describe('PII detection', () => {
  it('catches phones in common UA formats', () => {
    for (const t of ['дзвоніть 067 123 45 67', '+380671234567', '(067)123-45-67', '8 067 123 45 67', '38 067 1234567', '+48 512 345 678']) {
      expect(kinds(t), t).toContain('phone');
    }
  });
  it('catches e-mails, links, handles', () => {
    expect(kinds('пишіть test.user@example.com')).toContain('email');
    expect(kinds('test (at) example dot com')).toContain('email');
    expect(kinds('див. https://example.com/x')).toContain('link');
    expect(kinds('t.me/someone')).toContain('link');
    expect(kinds('нік @fake_client')).toContain('handle');
  });
  it('catches addresses', () => {
    expect(kinds('об’єкт на вул. Прикладна, 12')).toContain('address');
    expect(kinds('буд. 5, кв. 17')).toContain('address');
  });
  it('catches names', () => {
    expect(kinds('Клієнт Тестовий хоче ремонт')).toContain('name');
    expect(kinds('Звати Оксана, хоче кухню')).toContain('name');
    expect(kinds('зустрівся з Олегом')).toContain('name');
    expect(kinds('власник — Петренко')).toContain('name');
  });
  it('catches ID numbers (ЄДРПОУ / РНОКПП)', () => {
    expect(kinds('код 12345678')).toContain('id_number');
  });
  it('passes clean anonymised notes', () => {
    for (const t of [
      'Ремонт квартири в новобудові, 3 кімнати, 2 санвузли. Є дизайн-проєкт.',
      'Бюджет 30 000 - 50 000, старт навесні 2027, площа 120 м²',
      'Київська область, приватний будинок, газ підведено',
      'Ресторан на 80 посадкових місць, концепція — середземноморська кухня',
      'Дата старту 01.03.2027, бажано до літа',
      '',
    ]) expect(detectPii(t), t).toEqual([]);
  });
});

describe('contact key & masking', () => {
  it('normalizes phones', () => {
    expect(normalizePhone('067 123 45 67')).toBe('380671234567');
    expect(normalizePhone('+38 (067) 123-45-67')).toBe('380671234567');
    expect(normalizePhone('8 067 123 45 67')).toBe('380671234567');
    expect(normalizePhone('123')).toBeNull();
  });
  it('builds the same dedup key for one client written differently', () => {
    expect(contactKey('Тест, 067 123 45 67')).toBe(contactKey('+380671234567 (Тест)'));
    expect(contactKey('лише e-mail: Fake@Example.com')).toBe('mail:fake@example.com');
    expect(contactKey('без контактів')).toBeNull();
  });
  it('masks', () => {
    expect(maskContact('tel:380671234567')).toBe('+380 67 *** ** 67');
    expect(maskContact('mail:fake@example.com')).toBe('f***@example.com');
  });
});
