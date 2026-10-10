import { useMemo, useSyncExternalStore } from 'react';
import { createProfile } from '@/domain/identity';
import { computeFit } from '@/domain/matching';
import { getState, isHydrated, subscribe } from '@/state/store';
import type { AppState, Fit, MatchCard, Person } from '@/domain/types';

/**
 * Reactive read of the whole store. Components destructure what they need and
 * derive with useMemo. Mirrors a backend `useQuery` (which is likewise reactive).
 */
export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getState, getState);
}

export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, isHydrated, isHydrated);
}

export function usePerson(personId: string | undefined) {
  const { people } = useAppState();
  return personId ? people[personId] : undefined;
}

/**
 * Stand-in for the instant between signing out and the route guard moving the
 * user off a signed-in screen — those screens render one more frame and must not
 * crash. It never reaches a write: services resolve the viewer themselves.
 */
const SIGNED_OUT: Person = createProfile('signed-out', { name: '' });

/** The signed-in person's profile. */
export function useViewer(): Person {
  const { people, account, signedIn } = useAppState();
  return (signedIn && account && people[account.personId]) || SIGNED_OUT;
}

/** The viewer's transparent fit score + breakdown + plain-language explanation for a card. */
export function useFit(card: MatchCard | undefined): Fit | undefined {
  const { people } = useAppState();
  const viewer = useViewer();
  return useMemo(() => {
    if (!card) return undefined;
    const counterpart = people[card.personId];
    if (!counterpart) return undefined;
    return computeFit(card, viewer, counterpart);
  }, [card, people, viewer]);
}
