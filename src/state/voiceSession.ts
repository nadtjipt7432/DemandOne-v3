import { useSyncExternalStore } from 'react';
import type { MandateDraft } from '@/domain/semantic';
import type { Terms, VoiceTurn } from '@/domain/types';

/**
 * The voice conversation for this session: the turns, the mandate being shaped,
 * and any action waiting for the user's yes. Session-only (not persisted). The
 * actions themselves always go through the regular services and app state.
 */

export type DraftStage = 'interpreting' | 'details' | 'ready';

export type PendingAction =
  | { kind: 'post'; draft: MandateDraft }
  | { kind: 'propose'; negotiationId: string; terms: Terms; raiseLimit: boolean }
  | { kind: 'accept'; negotiationId: string }
  | { kind: 'stop'; negotiationId: string };

export interface VoiceSession {
  turns: VoiceTurn[];
  draft?: MandateDraft;
  stage?: DraftStage;
  asked: ('timing' | 'budget')[];
  pending?: PendingAction;
}

let session: VoiceSession = { turns: [], asked: [] };
const listeners = new Set<() => void>();

export function getVoiceSession(): VoiceSession {
  return session;
}

export function setVoiceSession(fn: (s: VoiceSession) => VoiceSession): void {
  session = fn(session);
  listeners.forEach((l) => l());
}

export function resetVoiceSession(): void {
  setVoiceSession(() => ({ turns: [], asked: [] }));
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useVoiceSession(): VoiceSession {
  return useSyncExternalStore(subscribe, getVoiceSession, getVoiceSession);
}
