import { beforeEach, describe, expect, it } from 'vitest';
import { setLatencyScale } from '@/infra/clock';
import { initialState } from '@/infra/seed';
import { createMemoryStorage, STORAGE_KEY } from '@/infra/storage';
import {
  createAccount,
  lookupAccount,
  resetDevice,
  setCapabilityProfile,
  setLocation,
  setStandardOfValue,
  setThemeMode,
  signIn,
  signOut,
  skipCapability,
} from '@/services/account';
import { createPosition } from '@/services/market';
import { flushWrites, getState, hydrateStore } from '@/state/store';

setLatencyScale(0);

let storage: ReturnType<typeof createMemoryStorage>;

beforeEach(async () => {
  storage = createMemoryStorage();
  await hydrateStore(storage);
});

const viewer = () => {
  const s = getState();
  return s.people[s.account!.personId];
};

/** Simulates a page refresh: a fresh hydrate from whatever was written. */
async function reload() {
  await flushWrites();
  await hydrateStore(storage);
}

describe('signup', () => {
  it('starts with no account and the seeded market', () => {
    expect(getState().account).toBeNull();
    expect(getState().signedIn).toBe(false);
  });

  it('creates a profile from exactly what was entered', async () => {
    await createAccount({ name: 'Ada Lovelace', email: ' Ada@Example.com ', location: 'London, United Kingdom' });
    const s = getState();
    expect(s.signedIn).toBe(true);
    expect(s.account).toMatchObject({ email: 'ada@example.com', onboarding: 'capability' });
    expect(viewer()).toMatchObject({ name: 'Ada Lovelace', initials: 'AL', location: 'London, United Kingdom', needs: [], offers: [] });
    expect(s.negotiations).toEqual({});
    expect(s.bookings).toEqual([]);
    expect(s.paymentMethods).toEqual([]);
  });

  it('refuses a second account on the same device', async () => {
    await createAccount({ name: 'Ada', email: 'ada@example.com' });
    await expect(createAccount({ name: 'Bob', email: 'bob@example.com' })).rejects.toThrow();
  });
});

describe('onboarding', () => {
  beforeEach(async () => {
    await createAccount({ name: 'Ada Lovelace', email: 'ada@example.com' });
  });

  it('saves the capability profile without creating an offer, and advances to values', async () => {
    await setCapabilityProfile({ summary: 'Former investment banker', categories: ['finance', 'ma-advisory'], workTypes: ['analyze'] });
    expect(viewer().capability?.summary).toBe('Former investment banker');
    expect(viewer().categories).toEqual(['finance', 'ma-advisory']);
    expect(viewer().offers).toEqual([]);
    expect(getState().account!.onboarding).toBe('values');
  });

  it('can skip capability', async () => {
    await skipCapability();
    expect(viewer().capability).toBeUndefined();
    expect(getState().account!.onboarding).toBe('values');
  });

  it('saves the Standard of Value and finishes onboarding', async () => {
    await skipCapability();
    await setStandardOfValue(['budget', 'trust', 'expertise', 'geography']);
    expect(viewer().standardOfValue.order).toEqual(['budget', 'trust', 'expertise', 'geography']);
    expect(getState().account!.onboarding).toBe('done');
  });

  it('does not skip ahead when values are set before capability', async () => {
    await setStandardOfValue(['budget', 'trust', 'expertise', 'geography']);
    expect(getState().account!.onboarding).toBe('capability');
  });
});

describe('persistence', () => {
  it('survives a reload with everything the user entered', async () => {
    await createAccount({ name: 'Ada Lovelace', email: 'ada@example.com' });
    await setCapabilityProfile({ summary: 'Spreadsheets', categories: ['finance'], workTypes: ['analyze'] });
    await setStandardOfValue(['trust', 'budget', 'expertise', 'geography']);
    await setLocation('Tampa, FL');
    const needId = await createPosition({ mode: 'need', title: 'Tax return review', category: 'tax', price: 200 });

    await reload();

    const s = getState();
    expect(s.signedIn).toBe(true);
    expect(s.account!.onboarding).toBe('done');
    expect(viewer()).toMatchObject({ name: 'Ada Lovelace', location: 'Tampa, FL', categories: ['finance'] });
    expect(viewer().needs.map((n) => n.id)).toEqual([needId]);
    expect(s.categories).toBe(initialState.categories);
  });

  it('does not write static reference data to storage', async () => {
    await createAccount({ name: 'Ada', email: 'ada@example.com' });
    await flushWrites();
    const saved = JSON.parse(storage.dump()[STORAGE_KEY]);
    expect(saved.state.categories).toBeUndefined();
  });

  it('restores the theme setting', async () => {
    await createAccount({ name: 'Ada', email: 'ada@example.com' });
    await setThemeMode('dark');
    await reload();
    expect(getState().themeMode).toBe('dark');
    await setThemeMode('light');
  });

  it('falls back to the seed when storage holds garbage', async () => {
    await storage.setItem(STORAGE_KEY, 'garbage');
    await hydrateStore(storage);
    expect(getState().account).toBeNull();
  });
});

describe('sessions', () => {
  beforeEach(async () => {
    await createAccount({ name: 'Ada Lovelace', email: 'ada@example.com' });
  });

  it('sign out keeps the account; signing back in restores it', async () => {
    await setLocation('Tampa, FL');
    await signOut();
    expect(getState().signedIn).toBe(false);
    expect(lookupAccount('ADA@example.com')).toBe('this-account');
    await reload();
    await signIn('ada@example.com');
    expect(getState().signedIn).toBe(true);
    expect(viewer().location).toBe('Tampa, FL');
  });

  it('distinguishes a different email from the stored account', async () => {
    await signOut();
    expect(lookupAccount('someone@else.com')).toBe('other-account');
    await expect(signIn('someone@else.com')).rejects.toThrow();
  });

  it('erasing the device removes the account and its storage', async () => {
    await resetDevice();
    expect(getState().account).toBeNull();
    expect(storage.dump()[STORAGE_KEY]).toBeUndefined();
    await reload();
    expect(getState().account).toBeNull();
    expect(lookupAccount('ada@example.com')).toBe('no-account');
  });

  it('writes require a signed-in account', async () => {
    await signOut();
    await expect(setLocation('Nowhere')).rejects.toThrow();
  });
});
