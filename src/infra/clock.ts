/**
 * Simulated latency and time for the mock backend. Every service call awaits
 * `delay()` so the UI exercises real loading states; tests set latency to 0 and
 * may pin the clock to make expiry deterministic.
 */

let latencyScale = 1;
let nowOverride: (() => Date) | undefined;

export function setLatencyScale(scale: number): void {
  latencyScale = scale;
}

export function delay(ms = 220): Promise<void> {
  const scaled = ms * latencyScale;
  return scaled <= 0 ? Promise.resolve() : new Promise((r) => setTimeout(r, scaled));
}

/** Tests only: pin the clock (pass undefined to restore real time). */
export function setNow(fn: (() => Date) | undefined): void {
  nowOverride = fn;
}

export function now(): Date {
  return nowOverride ? nowOverride() : new Date();
}

export function nowIso(): string {
  return now().toISOString();
}
