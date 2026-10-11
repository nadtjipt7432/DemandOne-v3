import { MIGRATIONS } from './migrations';

/**
 * Versioned persistence for the app state.
 *
 * State is stored as an envelope `{ v, state }` under a single key. On load, an
 * older envelope is walked forward through `MIGRATIONS` one version at a time; an
 * envelope that can't be migrated (unknown version, corrupt JSON, missing
 * migration) is discarded rather than loaded half-broken — the app then starts
 * from the seed, which is always a valid state.
 *
 * The backing store is injected (`KeyValueStorage`) so the app uses AsyncStorage
 * (see asyncStorage.ts — localStorage on web, native storage on iOS/Android) while
 * tests use `createMemoryStorage()`.
 */

export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export const STORAGE_KEY = 'demandone-v3';
export const SCHEMA_VERSION = 4;

type Migration = (state: unknown) => unknown;

interface Envelope {
  v: number;
  state: unknown;
}

export function createMemoryStorage(): KeyValueStorage & { dump(): Record<string, string> } {
  const data = new Map<string, string>();
  return {
    async getItem(key) {
      return data.get(key) ?? null;
    },
    async setItem(key, value) {
      data.set(key, value);
    },
    async removeItem(key) {
      data.delete(key);
    },
    dump() {
      return Object.fromEntries(data);
    },
  };
}

export function encodeEnvelope(state: unknown): string {
  return JSON.stringify({ v: SCHEMA_VERSION, state } satisfies Envelope);
}

/** Returns the migrated state, or undefined when the stored value can't be trusted. */
export function decodeEnvelope(
  raw: string | null,
  migrations: Record<number, Migration> = MIGRATIONS,
  currentVersion: number = SCHEMA_VERSION
): unknown | undefined {
  if (!raw) return undefined;
  let envelope: Envelope;
  try {
    envelope = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!envelope || typeof envelope.v !== 'number' || envelope.state === undefined) return undefined;
  if (envelope.v > currentVersion) return undefined;

  let v = envelope.v;
  let state: unknown = envelope.state;
  while (v < currentVersion) {
    const migrate = migrations[v];
    if (!migrate) return undefined;
    state = migrate(state);
    v += 1;
  }
  return state;
}
