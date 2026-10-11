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

export interface ProfilePatch {
  name?: string;
  location?: string;
  background?: string;
  /** Free text — one link per line or comma-separated. */
  links?: string;
}

export type ProfileErrors = Partial<Record<keyof ProfilePatch, string>>;

export const MAX_LINKS = 5;

/** Normalizes "linkedin.com/in/x" → "https://linkedin.com/in/x"; undefined if it isn't a plausible web address. */
export function normalizeLink(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    return /\.[a-z]{2,}$/i.test(url.hostname) ? url.toString().replace(/\/$/, '') : undefined;
  } catch {
    return undefined;
  }
}

export function splitLinks(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * Validates a profile edit. Returns the cleaned values to save, or field errors.
 * Location may be empty (shown as "Not set") — it is never filled in for the user.
 */
export function validateProfile(patch: ProfilePatch): { ok: true; values: { name?: string; location?: string; background?: string; links?: string[] } } | { ok: false; errors: ProfileErrors } {
  const errors: ProfileErrors = {};
  const values: { name?: string; location?: string; background?: string; links?: string[] } = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim().replace(/\s+/g, ' ');
    if (name.length < 2) errors.name = 'Enter your name (at least 2 characters).';
    else if (name.length > 60) errors.name = 'Keep your name under 60 characters.';
    else values.name = name;
  }
  if (patch.location !== undefined) {
    const location = patch.location.trim().replace(/\s+/g, ' ');
    if (location.length > 80) errors.location = 'Keep the location under 80 characters.';
    else if (location && !/[a-z]/i.test(location)) errors.location = 'Enter a place name, e.g. Manchester.';
    else values.location = location;
  }
  if (patch.background !== undefined) {
    const background = patch.background.trim();
    if (background.length > 600) errors.background = 'Keep your background under 600 characters.';
    else values.background = background;
  }
  if (patch.links !== undefined) {
    const raw = splitLinks(patch.links);
    if (raw.length > MAX_LINKS) errors.links = `Add up to ${MAX_LINKS} links.`;
    else {
      const normalized = raw.map(normalizeLink);
      const bad = raw.find((_, i) => !normalized[i]);
      if (bad) errors.links = `"${bad}" doesn't look like a web address.`;
      else values.links = normalized as string[];
    }
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, values };
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
 * where to send the user. The landing page is always reachable — it's the front
 * door, and offers "Continue" to a signed-in user. Signed out → only landing and
 * login. Mid-onboarding → the current step. Onboarded → anywhere except login and
 * the capability step (capability is edited from Profile after onboarding).
 */
export function guardRedirect(pathname: string, account: DeviceAccount | null, signedIn: boolean): string | undefined {
  const home = homeRouteFor(account, signedIn);
  if (pathname === '/') return undefined;
  if (!account || !signedIn) return PUBLIC_ROUTES.includes(pathname) ? undefined : home;
  if (account.onboarding !== 'done') return pathname === home ? undefined : home;
  if (pathname === '/login' || pathname === '/capability') return home;
  return undefined;
}
