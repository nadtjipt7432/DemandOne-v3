import { describe, expect, it } from 'vitest';
import { decodeEnvelope, encodeEnvelope, SCHEMA_VERSION } from '@/infra/storage';

describe('versioned storage envelope', () => {
  it('round-trips state at the current version', () => {
    const state = { a: 1, nested: { b: [1, 2] } };
    expect(decodeEnvelope(encodeEnvelope(state))).toEqual(state);
  });

  it('returns undefined for nothing stored', () => {
    expect(decodeEnvelope(null)).toBeUndefined();
  });

  it('discards corrupt JSON instead of throwing', () => {
    expect(decodeEnvelope('{not json')).toBeUndefined();
  });

  it('discards an envelope without a version or state', () => {
    expect(decodeEnvelope(JSON.stringify({ state: {} }))).toBeUndefined();
    expect(decodeEnvelope(JSON.stringify({ v: SCHEMA_VERSION }))).toBeUndefined();
  });

  it('discards state written by a newer schema', () => {
    expect(decodeEnvelope(JSON.stringify({ v: SCHEMA_VERSION + 1, state: {} }))).toBeUndefined();
  });

  it('walks an old envelope forward through each migration in order', () => {
    const migrations = {
      1: (s: unknown) => ({ ...(s as object), step1: true }),
      2: (s: unknown) => ({ ...(s as object), step2: true }),
    };
    const raw = JSON.stringify({ v: 1, state: { original: true } });
    expect(decodeEnvelope(raw, migrations, 3)).toEqual({ original: true, step1: true, step2: true });
  });

  it('discards an old envelope when a migration is missing', () => {
    const raw = JSON.stringify({ v: 1, state: {} });
    expect(decodeEnvelope(raw, { 2: (s) => s }, 3)).toBeUndefined();
  });
});
