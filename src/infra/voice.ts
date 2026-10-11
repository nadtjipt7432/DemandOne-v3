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
  onresult: ((e: { resultIndex: number; results: { length: number; [i: number]: { isFinal: boolean; [j: number]: { transcript: string } } } }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

function getNativeRecognition(): NativeRecognition | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { SpeechRecognition?: new () => NativeRecognition; webkitSpeechRecognition?: new () => NativeRecognition };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) return undefined;
  const rec = new Ctor();
  rec.lang = 'en-GB';
  rec.interimResults = true;
  rec.continuous = false;
  return rec;
}

export function isNativeSpeechAvailable(): boolean {
  return getNativeRecognition() !== undefined;
}

/** Why listening ended without a transcript. */
export type ListenFailure = 'blocked' | 'no-speech' | 'no-microphone' | 'unsupported' | 'other';

const FAILURE: Record<string, ListenFailure> = {
  'not-allowed': 'blocked',
  'service-not-allowed': 'blocked',
  'no-speech': 'no-speech',
  'audio-capture': 'no-microphone',
  // Chromium forks without Google's speech service (Opera, Brave, Arc) report this.
  network: 'unsupported',
  'language-not-supported': 'unsupported',
};

/**
 * Starts the browser's native recognizer. Streams partial words to onInterim, then
 * calls onResult once with the final transcript, or onError with the reason if it
 * fails or ends without hearing anything. Returns a stop() handle (stopping early
 * submits what was heard so far), or undefined if nothing's available — callers
 * should fall back to typing or `simulateTranscript`.
 */
export function startListening(onResult: (text: string) => void, onError: (why: ListenFailure) => void, onInterim?: (text: string) => void): { stop: () => void } | undefined {
  const rec = getNativeRecognition();
  if (!rec) return undefined;
  let heard = '';
  let settled = false;
  const settle = (fn: () => void) => {
    if (settled) return;
    settled = true;
    fn();
  };
  rec.onresult = (e) => {
    let text = '';
    let final = false;
    for (let i = 0; i < e.results.length; i++) {
      text += e.results[i][0]?.transcript ?? '';
      final = e.results[i].isFinal;
    }
    heard = text.trim();
    if (final) settle(() => onResult(heard));
    else onInterim?.(heard);
  };
  rec.onerror = (e) => {
    if (e.error === 'aborted') return;
    settle(() => onError(FAILURE[e.error] ?? 'other'));
  };
  // The recognizer can end quietly (silence, or stopped by the user) — never leave the caller listening.
  rec.onend = () => settle(() => (heard ? onResult(heard) : onError('no-speech')));
  try {
    rec.start();
  } catch {
    return undefined;
  }
  return { stop: () => rec.stop() };
}

/**
 * Predefined utterances for browsers without speech recognition (and for demos).
 * Each one exercises a documented interpreter scenario — see domain/semantic.ts.
 */
export const DEMO_UTTERANCES = {
  acquisition: "We're looking at buying a competitor, and I need someone to make sure the numbers actually make sense before we go ahead.",
  timing: 'Yes, but we need it within three weeks.',
  budget: 'Budget is around £20,000.',
  capacity: 'I have 10 hours next week for financial modeling at about £150 an hour.',
  counter: 'I could go to £5,200 if they deliver Wednesday.',
  status: "What's the difference now?",
  compare: 'Which bid is better?',
};

const DEMO_SEQUENCE = [DEMO_UTTERANCES.acquisition, DEMO_UTTERANCES.capacity];
let demoIndex = 0;

/** No speech recognition available: a deterministic stand-in, alternating demo lines. */
export function simulateTranscript(): string {
  const text = DEMO_SEQUENCE[demoIndex % DEMO_SEQUENCE.length];
  demoIndex += 1;
  return text;
}

/* ------------------------------------------------------------ speech out */

interface Synth {
  speak(u: unknown): void;
  cancel(): void;
  getVoices(): { lang: string; name: string }[];
}

function synth(): { s: Synth; Utterance: new (text: string) => { lang: string; rate: number; voice: unknown } } | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { speechSynthesis?: Synth; SpeechSynthesisUtterance?: new (text: string) => { lang: string; rate: number; voice: unknown } };
  return w.speechSynthesis && w.SpeechSynthesisUtterance ? { s: w.speechSynthesis, Utterance: w.SpeechSynthesisUtterance } : undefined;
}

export function isSpeechOutputAvailable(): boolean {
  return synth() !== undefined;
}

/** Speak a short agent reply with the browser's voice. Silently does nothing where unsupported. */
export function speak(text: string): void {
  const sy = synth();
  if (!sy) return;
  try {
    sy.s.cancel();
    const u = new sy.Utterance(text);
    u.lang = 'en-GB';
    u.rate = 1.02;
    const voice = sy.s.getVoices().find((v) => v.lang === 'en-GB');
    if (voice) u.voice = voice;
    sy.s.speak(u);
  } catch {
    // Speech output is a nicety; the reply is always shown as text too.
  }
}

export function stopSpeaking(): void {
  try {
    synth()?.s.cancel();
  } catch {
    // ignore
  }
}
