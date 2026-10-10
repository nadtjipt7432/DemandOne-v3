import { useMemo, useSyncExternalStore } from 'react';
import { computeFit } from '@/domain/matching';
import { getState, subscribe } from '@/state/store';
import type { AppState, Fit, MatchCard } from '@/domain/types';

/**
 * Reactive read of the whole store. Components destructure what they need and
 * derive with useMemo. Mirrors Convex `useQuery` (which is likewise reactive).
 */
export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getState, getState);
}

export function usePerson(personId: string | undefined) {
  const { people } = useAppState();
  return personId ? people[personId] : undefined;
}

export function useViewer() {
  const { people, viewerId } = useAppState();
  return people[viewerId];
}

/** The viewer's transparent fit score + breakdown + plain-language explanation for a card. */
export function useFit(card: MatchCard | undefined): Fit | undefined {
  const { people, viewerId } = useAppState();
  return useMemo(() => {
    if (!card) return undefined;
    const viewer = people[viewerId];
    const counterpart = people[card.personId];
    if (!viewer || !counterpart) return undefined;
    return computeFit(card, viewer, counterpart);
  }, [card, people, viewerId]);
}
