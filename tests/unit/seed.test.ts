import { describe, expect, it } from 'vitest';
import { initialState } from '@/infra/seed';

describe('seed', () => {
  it('holds no viewer: no account, session, activity or payment methods', () => {
    expect(initialState.account).toBeNull();
    expect(initialState.signedIn).toBe(false);
    expect(initialState.negotiations).toEqual({});
    expect(initialState.bookings).toEqual([]);
    expect(initialState.paymentMethods).toEqual([]);
    expect(initialState.defaultPaymentId).toBeUndefined();
  });

  it('only lists cards from people who exist, in known categories', () => {
    const categoryIds = new Set(initialState.categories.map((c) => c.id));
    for (const card of initialState.cards) {
      expect(initialState.people[card.personId], card.id).toBeDefined();
      expect(categoryIds.has(card.category), card.id).toBe(true);
    }
  });

  it('keeps private limits off the listings', () => {
    for (const card of initialState.cards) {
      expect(Object.keys(card)).not.toContain('floorPrice');
      expect(Object.keys(card)).not.toContain('ceilingPrice');
      expect(JSON.stringify(card)).not.toContain(String(initialState.reservations[card.id] ?? 'none'));
    }
  });

  it('has unique card ids', () => {
    const ids = initialState.cards.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
