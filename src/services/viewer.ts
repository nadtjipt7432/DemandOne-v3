import type { AppState, Person } from '@/domain/types';

/** The signed-in person inside a state updater. Writes require a session — a missing one is a bug, not a state to paper over. */
export function viewerOf(s: AppState): Person {
  const person = s.signedIn && s.account ? s.people[s.account.personId] : undefined;
  if (!person) throw new Error('No signed-in account');
  return person;
}

export function updateViewer(s: AppState, fn: (viewer: Person) => Person): AppState {
  const viewer = viewerOf(s);
  return { ...s, people: { ...s.people, [viewer.id]: fn(viewer) } };
}
