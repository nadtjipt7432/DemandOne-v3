/**
 * Mocked voice input for the universal intent box. This is the one module that knows
 * anything about "voice" — swap it for real speech/agent infrastructure later and
 * nothing outside it (ask.tsx, intent-results.tsx) needs to change, since both just
 * receive a plain transcript string and hand it to the existing text intent flow.
 *
 * On web, uses the browser's native SpeechRecognition when present. Everywhere else
 * (native/Expo Go, or a browser without it), there's no real recognizer wired up —
 * `simulateTranscript` stands in with one of two deterministic demo lines.
 */

interface NativeRecognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function getNativeRecognition(): NativeRecognition | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { SpeechRecognition?: new () => NativeRecognition; webkitSpeechRecognition?: new () => NativeRecognition };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) return undefined;
  const rec = new Ctor();
  rec.lang = 'en-US';
  rec.interimResults = false;
  rec.continuous = false;
  return rec;
}

export function isNativeSpeechAvailable(): boolean {
  return getNativeRecognition() !== undefined;
}

/**
 * Starts the browser's native recognizer. Calls onResult once with the final
 * transcript, or onError if it's denied/fails. Returns a stop() handle, or
 * undefined immediately if nothing's available — callers should fall back to
 * `simulateTranscript` in that case.
 */
export function startListening(onResult: (text: string) => void, onError: () => void): { stop: () => void } | undefined {
  const rec = getNativeRecognition();
  if (!rec) return undefined;
  rec.onresult = (e) => onResult(e.results[0]?.[0]?.transcript ?? '');
  rec.onerror = () => onError();
  try {
    rec.start();
  } catch {
    return undefined;
  }
  return { stop: () => rec.stop() };
}

export const DEMO_TRANSCRIPTS = {
  buyer:
    "I need an M&A advisor for an acquisition next month. I want someone who's done healthcare deals, and experience matters more than price.",
  seller: "I'm a former investment banker with about 10 hours available next week for M&A work.",
};

const DEMO_SEQUENCE = [DEMO_TRANSCRIPTS.buyer, DEMO_TRANSCRIPTS.seller];
let demoIndex = 0;

/** No real speech recognition available — deterministic stand-in, alternating demo lines. */
export function simulateTranscript(): string {
  const text = DEMO_SEQUENCE[demoIndex % DEMO_SEQUENCE.length];
  demoIndex += 1;
  return text;
}
