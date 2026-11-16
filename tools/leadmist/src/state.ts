// Машина станів угоди.
// Основний шлях: reserved → revealed → contacted → meeting → contract → payment → commission_paid → closed.
// Бічні: client_declined, no_contact, dispute, cancelled.

export const DEAL_STATUSES = [
  'reserved', 'revealed', 'contacted', 'meeting', 'contract', 'payment', 'commission_paid', 'closed',
  'client_declined', 'no_contact', 'dispute', 'cancelled',
] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];

export const TERMINAL: ReadonlySet<DealStatus> = new Set(['closed', 'client_declined', 'no_contact', 'cancelled']);

const T: Record<DealStatus, DealStatus[]> = {
  reserved: ['revealed', 'client_declined', 'cancelled'],
  revealed: ['contacted', 'no_contact', 'client_declined', 'dispute', 'cancelled'],
  contacted: ['meeting', 'contract', 'client_declined', 'dispute', 'cancelled'],
  meeting: ['contract', 'client_declined', 'dispute', 'cancelled'],
  contract: ['payment', 'dispute', 'cancelled'],
  payment: ['payment', 'commission_paid', 'dispute'],
  commission_paid: ['payment', 'closed', 'dispute'],
  closed: [],
  client_declined: [],
  no_contact: [],
  dispute: ['contract', 'payment', 'commission_paid', 'closed', 'cancelled'], // рішення модератора
  cancelled: [],
};

/** Хто може ініціювати перехід. */
export type Actor = 'receiver' | 'referrer' | 'client' | 'system' | 'admin';

const ACTOR_ALLOWED: Record<Actor, ReadonlySet<DealStatus>> = {
  receiver: new Set(['contacted', 'meeting', 'contract', 'payment', 'client_declined', 'closed', 'dispute']),
  referrer: new Set(['commission_paid', 'dispute']),
  client: new Set(['client_declined']),
  system: new Set(['revealed', 'no_contact', 'cancelled', 'commission_paid']),
  admin: new Set(DEAL_STATUSES),
};

export function canTransition(from: DealStatus, to: DealStatus, actor: Actor = 'admin'): boolean {
  if (!T[from]?.includes(to)) return false;
  if (!ACTOR_ALLOWED[actor].has(to)) return false;
  // Закрити угоду отримувач може лише після виплати комісії.
  if (to === 'closed' && actor === 'receiver' && from !== 'commission_paid') return false;
  return true;
}

export function assertTransition(from: DealStatus, to: DealStatus, actor: Actor): void {
  if (!canTransition(from, to, actor)) throw new Error(`illegal deal transition ${from} → ${to} by ${actor}`);
}

/** Кнопки статусів, які бот показує отримувачу на поточному етапі. */
export function receiverNext(from: DealStatus): DealStatus[] {
  return (T[from] ?? []).filter((s) => canTransition(from, s, 'receiver') && s !== 'dispute');
}

/** Чи вимагає перехід введення суми. */
export function needsAmount(to: DealStatus): 'contract' | 'payment' | null {
  return to === 'contract' ? 'contract' : to === 'payment' ? 'payment' : null;
}
