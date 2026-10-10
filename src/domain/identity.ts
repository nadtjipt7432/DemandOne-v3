/**
 * Identity: turning what a person enters at signup into their real profile, and
 * deciding where a session belongs. Pure — no store, no I/O.
 *
 * A new account starts genuinely empty: no needs, offers, history, trust, bio or
 * location beyond what the person typed. Everything else accrues from what they do.
 */

import type { Criterion, DeviceAccount, OnboardingStep, Person } from './types';

/** Used until the person ranks their own Standard of Value at the values step. */
export const DEFAULT_VALUE_ORDER: Criterion[] = ['expertise', 'trust', 'budget', 'geography'];

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

/** Mock email verification: any six digits. */
export function isValidCode(code: string): boolean {
  return /^\d{6}$/.test(code.trim());
}

export function deriveInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : '';
  return (first + last).toUpperCase();
}

export interface SignupInput {
  name: string;
  location?: string;
}

export function createProfile(personId: string, input: SignupInput): Person {
  const name = input.name.trim().replace(/\s+/g, ' ');
  return {
    id: personId,
    name,
    initials: deriveInitials(name),
    location: input.location?.trim() ?? '',
    tier: 'everyday',
    completedCount: 0,
    recommendCount: 0,
    trustPaths: 0,
    verified: { identity: false, insurance: false, references: false },
    bio: '',
    distanceMi: 0,
    responseRate: 0,
    responseTimeLabel: 'New to DemandOne',
    needs: [],
    offers: [],
    categories: [],
    standardOfValue: { order: [...DEFAULT_VALUE_ORDER] },
  };
}

/** Where a session should be, given the account state. */
export function homeRouteFor(account: DeviceAccount | null, signedIn: boolean): string {
  if (!account || !signedIn) return '/';
  return ONBOARDING_ROUTE[account.onboarding];
}

const ONBOARDING_ROUTE: Record<OnboardingStep, string> = {
  capability: '/capability',
  values: '/onboarding',
  done: '/today',
};

const PUBLIC_ROUTES = ['/', '/login'];

/**
 * The route guard's decision: undefined when `pathname` is allowed, otherwise
 * where to send the user. Signed out → only the public routes. Mid-onboarding →
 * only the current step. Onboarded → anywhere except the public routes and the
 * capability step (capability is edited from Account after onboarding; the values
 * screen stays reachable so it can be redone from You).
 */
export function guardRedirect(pathname: string, account: DeviceAccount | null, signedIn: boolean): string | undefined {
  const home = homeRouteFor(account, signedIn);
  if (!account || !signedIn) return PUBLIC_ROUTES.includes(pathname) ? undefined : home;
  if (account.onboarding !== 'done') return pathname === home ? undefined : home;
  if (PUBLIC_ROUTES.includes(pathname) || pathname === '/capability') return home;
  return undefined;
}
