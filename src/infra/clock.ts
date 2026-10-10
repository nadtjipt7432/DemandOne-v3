/**
 * Simulated latency for the mock backend. Every service call awaits `delay()` so the
 * UI exercises real loading states; tests set latency to 0 so they run instantly.
 */

let latencyScale = 1;

export function setLatencyScale(scale: number): void {
  latencyScale = scale;
}

export function delay(ms = 220): Promise<void> {
  const scaled = ms * latencyScale;
  return scaled <= 0 ? Promise.resolve() : new Promise((r) => setTimeout(r, scaled));
}

export function nowIso(): string {
  return new Date().toISOString();
}
