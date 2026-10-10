import type { AppState } from '@/domain/types';
import { initialState } from '@/infra/seed';
import { createMemoryStorage, decodeEnvelope, encodeEnvelope, STORAGE_KEY, type KeyValueStorage } from '@/infra/storage';

/**
 * Tiny observable store. Reads are reactive via useSyncExternalStore (see hooks.ts);
 * writes go through services/, the seam that becomes real backend calls later.
 * getState returns a STABLE reference until setState replaces it, so getSnapshot is cached.
 *
 * Persistence: `hydrateStore()` loads the last saved state (or the seed) once at
 * startup; every later `setState` queues a write. Writes are chained so they land
 * in order, and nothing is written before hydration finishes (that would clobber
 * the saved state with the seed).
 */

let storage: KeyValueStorage = createMemoryStorage();
let state: AppState = initialState;
let hydrated = false;
let writeChain: Promise<void> = Promise.resolve();
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((l) => l());
}

function persist(s: AppState): void {
  const { categories: _static, ...durable } = s;
  const raw = encodeEnvelope(durable);
  writeChain = writeChain
    .then(() => storage.setItem(STORAGE_KEY, raw))
    .catch(() => {
      // Storage full or disabled (e.g. private browsing) — the session still works, just unsaved.
    });
}

/** Load persisted state from `adapter` (falls back to the seed). Call once at startup. */
export async function hydrateStore(adapter: KeyValueStorage): Promise<void> {
  storage = adapter;
  let raw: string | null = null;
  try {
    raw = await adapter.getItem(STORAGE_KEY);
  } catch {
    raw = null;
  }
  const saved = decodeEnvelope(raw) as Omit<AppState, 'categories'> | undefined;
  state = saved ? { ...saved, categories: initialState.categories } : initialState;
  hydrated = true;
  notify();
}

export function isHydrated(): boolean {
  return hydrated;
}

/** Resolves once every queued write has reached storage. */
export function flushWrites(): Promise<void> {
  return writeChain;
}

export function getState(): AppState {
  return state;
}

export function setState(updater: (s: AppState) => AppState): void {
  state = updater(state);
  if (hydrated) persist(state);
  notify();
}

/** Erase everything this device holds and return to the seeded market. */
export async function resetStore(): Promise<void> {
  await writeChain;
  try {
    await storage.removeItem(STORAGE_KEY);
  } catch {
    // Non-fatal — the in-memory reset below still works.
  }
  state = initialState;
  notify();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

let counter = 1;
export function id(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${counter++}`;
}
