import type { AppState } from '@/domain/types';
import { initialState } from '@/infra/seed';

/**
 * Tiny observable store. Reads are reactive via useSyncExternalStore (see hooks.ts);
 * writes go through service.ts, which is the seam that becomes Convex mutations later.
 * getState returns a STABLE reference until setState replaces it, so getSnapshot is cached.
 *
 * Persistence: web-only, feature-detected (same spirit as voice.ts's native-vs-simulated
 * split) — `localStorage` isn't available on native without adding a dependency, so this
 * degrades to in-memory-only there rather than reaching for one. On web, every `setState`
 * writes the new state back; the module loads whatever was last saved, if anything.
 */

const STORAGE_KEY = 'demandone-v2-state';

function loadPersisted(): AppState | undefined {
  try {
    if (typeof localStorage === 'undefined') return undefined;
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AppState) : undefined;
  } catch {
    return undefined;
  }
}

function persist(s: AppState): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Storage can be full or disabled (private browsing) — the demo still works, just unsaved.
  }
}

let state: AppState = loadPersisted() ?? initialState;
const listeners = new Set<() => void>();

export function getState(): AppState {
  return state;
}

export function setState(updater: (s: AppState) => AppState): void {
  state = updater(state);
  persist(state);
  listeners.forEach((l) => l());
}

/** Reset Demo: wipe whatever's persisted and go back to the seeded starting scenario. */
export function resetStore(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Non-fatal — falling through to the in-memory reset below still works.
  }
  state = initialState;
  listeners.forEach((l) => l());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

let counter = 1;
export function id(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${counter++}`;
}
