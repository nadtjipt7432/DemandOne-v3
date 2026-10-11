import { initialState, seedPeople } from './seed';

/**
 * `MIGRATIONS[n]` upgrades a stored version-n state to version n+1. Add one per
 * schema bump; an unmigratable state is discarded rather than loaded half-broken.
 */
type AnyState = Record<string, any>;

function nowIso(): string {
  return new Date().toISOString();
}

export const MIGRATIONS: Record<number, (state: unknown) => unknown> = {
  /**
   * v1 → v2: the negotiation/transaction model replaced matches and bookings. The
   * signed-in person's profile, own positions and preferences carry over; the demo
   * market (counterparties, listings, private limits) is reseeded.
   */
  1: (raw) => {
    const s = raw as AnyState;
    const { categories: _c, ...base } = initialState;
    const personId: string | undefined = s.account?.personId;
    const viewer = personId ? s.people?.[personId] : undefined;
    const people = viewer
      ? {
          ...seedPeople,
          [personId!]: {
            ...viewer,
            needs: (viewer.needs ?? []).map((n: AnyState) => ({ unit: 'fixed', createdAt: nowIso(), ...n })),
            offers: (viewer.offers ?? []).map((o: AnyState) => ({ unit: 'fixed', createdAt: nowIso(), ...o })),
          },
        }
      : seedPeople;
    return {
      ...base,
      account: s.account ?? null,
      signedIn: !!s.signedIn,
      themeMode: s.themeMode ?? 'light',
      notificationPref: s.notificationPref ?? 'live',
      paymentMethods: s.paymentMethods ?? [],
      defaultPaymentId: s.defaultPaymentId,
      permissions: s.permissions ?? base.permissions,
      people,
    };
  },
  /**
   * v2 → v3: capacity allocation. New demo counterparties are added (existing
   * people, including the signed-in person, are kept as they are) and every
   * transaction gets its explicit total.
   */
  2: (raw) => {
    const s = raw as AnyState;
    return {
      ...s,
      people: { ...seedPeople, ...(s.people ?? {}) },
      bookings: (s.bookings ?? []).map((b: AnyState) => ({ total: b.terms?.hours ? b.terms.price * b.terms.hours : b.terms?.price ?? 0, ...b })),
    };
  },
  /**
   * v3 → v4: detailed feedback. Yes/no feedback becomes a review with no aspect
   * ratings; seeded counterparties gain their per-aspect records.
   */
  3: (raw) => {
    const s = raw as AnyState;
    const asReview = (v: unknown, at: string) => (typeof v === 'boolean' ? { recommends: v, ratings: {}, at } : v);
    const people = Object.fromEntries(
      Object.entries((s.people ?? {}) as Record<string, AnyState>).map(([pid, p]) => [pid, p.reputation || !seedPeople[pid] ? p : { ...p, reputation: seedPeople[pid].reputation }])
    );
    return {
      ...s,
      people,
      bookings: (s.bookings ?? []).map((b: AnyState) => {
        const at = b.completedAt ?? b.createdAt ?? nowIso();
        return { ...b, feedback: { byBuyer: asReview(b.feedback?.byBuyer, at), bySeller: asReview(b.feedback?.bySeller, at) } };
      }),
    };
  },
};
