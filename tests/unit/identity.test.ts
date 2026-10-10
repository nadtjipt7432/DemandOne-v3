import { describe, expect, it } from 'vitest';
import {
  createProfile,
  deriveInitials,
  guardRedirect,
  homeRouteFor,
  isValidCode,
  isValidEmail,
  normalizeEmail,
} from '@/domain/identity';
import type { DeviceAccount, OnboardingStep } from '@/domain/types';

const account = (onboarding: OnboardingStep): DeviceAccount => ({
  personId: 'u1',
  email: 'a@b.co',
  onboarding,
  createdAt: '2026-10-10T00:00:00.000Z',
});

describe('identity helpers', () => {
  it('derives initials from first and last word', () => {
    expect(deriveInitials('Ada Lovelace')).toBe('AL');
    expect(deriveInitials('  ada   king  lovelace ')).toBe('AL');
    expect(deriveInitials('Cher')).toBe('C');
    expect(deriveInitials('')).toBe('?');
  });

  it('normalizes and validates email', () => {
    expect(normalizeEmail('  Ada@Example.COM ')).toBe('ada@example.com');
    expect(isValidEmail('ada@example.com')).toBe(true);
    expect(isValidEmail('ada@example')).toBe(false);
    expect(isValidEmail('not an email')).toBe(false);
  });

  it('accepts exactly six digits as a code', () => {
    expect(isValidCode('123456')).toBe(true);
    expect(isValidCode('12345')).toBe(false);
    expect(isValidCode('12345a')).toBe(false);
  });
});

describe('createProfile', () => {
  it('builds a profile from signup input only — no inherited activity or trust', () => {
    const p = createProfile('u1', { name: '  Ada   Lovelace ', location: 'London, United Kingdom' });
    expect(p).toMatchObject({
      id: 'u1',
      name: 'Ada Lovelace',
      initials: 'AL',
      location: 'London, United Kingdom',
      completedCount: 0,
      recommendCount: 0,
      trustPaths: 0,
      bio: '',
      needs: [],
      offers: [],
      categories: [],
    });
    expect(p.capability).toBeUndefined();
    expect(p.verified).toEqual({ identity: false, insurance: false, references: false });
  });

  it('leaves location empty when none was given', () => {
    expect(createProfile('u1', { name: 'Ada' }).location).toBe('');
  });
});

describe('routing', () => {
  it('sends each onboarding state to its home route', () => {
    expect(homeRouteFor(null, false)).toBe('/');
    expect(homeRouteFor(account('done'), false)).toBe('/');
    expect(homeRouteFor(account('capability'), true)).toBe('/capability');
    expect(homeRouteFor(account('values'), true)).toBe('/onboarding');
    expect(homeRouteFor(account('done'), true)).toBe('/today');
  });

  it('keeps signed-out users on public routes', () => {
    expect(guardRedirect('/', null, false)).toBeUndefined();
    expect(guardRedirect('/login', null, false)).toBeUndefined();
    expect(guardRedirect('/today', null, false)).toBe('/');
    expect(guardRedirect('/today', account('done'), false)).toBe('/');
  });

  it('pins mid-onboarding users to their current step', () => {
    expect(guardRedirect('/capability', account('capability'), true)).toBeUndefined();
    expect(guardRedirect('/today', account('capability'), true)).toBe('/capability');
    expect(guardRedirect('/login', account('values'), true)).toBe('/onboarding');
  });

  it('lets onboarded users into the app but not back to signup screens', () => {
    expect(guardRedirect('/today', account('done'), true)).toBeUndefined();
    expect(guardRedirect('/onboarding', account('done'), true)).toBeUndefined();
    expect(guardRedirect('/', account('done'), true)).toBe('/today');
    expect(guardRedirect('/login', account('done'), true)).toBe('/today');
    expect(guardRedirect('/capability', account('done'), true)).toBe('/today');
  });
});
