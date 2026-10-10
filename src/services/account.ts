import { delay, nowIso } from '@/infra/clock';
import { createProfile, normalizeEmail, type SignupInput } from '@/domain/identity';
import { getState, id, resetStore, setState } from '@/state/store';
import { applyThemeMode } from '@/theme';
import { updateViewer, viewerOf } from './viewer';
import type { CapabilityProfile, Criterion, NotificationPref } from '@/domain/types';

/**
 * Identity, onboarding and preferences — every write that concerns who the user
 * is rather than what they trade. Each function is async and shaped like a
 * backend mutation (see services/market.ts for the market side).
 */

export type AccountLookup = 'this-account' | 'other-account' | 'no-account';

/** What happens if `email` signs in on this device: restore it, conflict with the stored account, or create one. */
export function lookupAccount(email: string): AccountLookup {
  const { account } = getState();
  if (!account) return 'no-account';
  return account.email === normalizeEmail(email) ? 'this-account' : 'other-account';
}

/** Name of the stored account, for "Welcome back" — undefined when there isn't one. */
export function storedAccountName(): string | undefined {
  const { account, people } = getState();
  return account ? people[account.personId]?.name : undefined;
}

/** Signup: what the person entered becomes their profile — nothing else is attached to it. */
export async function createAccount(input: SignupInput & { email: string }): Promise<void> {
  await delay(300);
  if (getState().account) throw new Error('This device already has an account');
  const personId = id('u');
  const person = createProfile(personId, input);
  setState((s) => ({
    ...s,
    account: { personId, email: normalizeEmail(input.email), onboarding: 'capability', createdAt: nowIso() },
    signedIn: true,
    people: { ...s.people, [personId]: person },
  }));
}

export async function signIn(email: string): Promise<void> {
  await delay(300);
  if (lookupAccount(email) !== 'this-account') throw new Error('No account for that email on this device');
  setState((s) => ({ ...s, signedIn: true }));
}

/** Ends the session; the account and everything in it stay on the device. */
export async function signOut(): Promise<void> {
  await delay(150);
  setState((s) => ({ ...s, signedIn: false }));
}

/** Erases this device's account and activity, back to the seeded market. */
export async function resetDevice(): Promise<void> {
  await delay(300);
  await resetStore();
  applyThemeMode(getState().themeMode);
}

export async function setLocation(location: string): Promise<void> {
  await delay(150);
  setState((s) => updateViewer(s, (v) => ({ ...v, location: location.trim() })));
}

/**
 * The capability profile informs matching (its categories tune the Exchange) but
 * never creates an Offer — posting one is always a separate, explicit act.
 * Saving it during onboarding advances to the values step.
 */
export async function setCapabilityProfile(profile: CapabilityProfile): Promise<void> {
  await delay(250);
  setState((s) => {
    const next = updateViewer(s, (v) => ({
      ...v,
      capability: profile,
      categories: Array.from(new Set([...profile.categories, ...v.categories])),
    }));
    return advanceOnboarding(next, 'capability');
  });
}

export async function skipCapability(): Promise<void> {
  setState((s) => advanceOnboarding(s, 'capability'));
}

/** The Standard of Value ranking. Finishes onboarding when it's the current step. */
export async function setStandardOfValue(order: Criterion[]): Promise<void> {
  await delay(300);
  setState((s) => advanceOnboarding(updateViewer(s, (v) => ({ ...v, standardOfValue: { order } })), 'values'));
}

function advanceOnboarding(s: ReturnType<typeof getState>, from: 'capability' | 'values'): ReturnType<typeof getState> {
  viewerOf(s);
  if (!s.account || s.account.onboarding !== from) return s;
  return { ...s, account: { ...s.account, onboarding: from === 'capability' ? 'values' : 'done' } };
}

/**
 * Mutates the shared `colors` object *before* triggering the store update, so every
 * screen's re-render already sees the new palette (see theme.ts).
 */
export async function setThemeMode(mode: 'light' | 'dark'): Promise<void> {
  applyThemeMode(mode);
  setState((s) => ({ ...s, themeMode: mode }));
}

export async function setNotificationPref(pref: NotificationPref): Promise<void> {
  await delay(150);
  setState((s) => ({ ...s, notificationPref: pref }));
}

export async function togglePermission(key: string): Promise<void> {
  setState((s) => ({
    ...s,
    permissions: s.permissions.map((p) => (p.key === key ? { ...p, enabled: !p.enabled } : p)),
  }));
}

export async function setDefaultPayment(paymentId: string): Promise<void> {
  await delay(150);
  setState((s) => ({ ...s, defaultPaymentId: paymentId }));
}

export async function addPaymentMethod(label: string): Promise<void> {
  await delay(300);
  const paymentId = id('pm');
  setState((s) => ({
    ...s,
    paymentMethods: [...s.paymentMethods, { id: paymentId, label }],
    defaultPaymentId: paymentId,
  }));
}
