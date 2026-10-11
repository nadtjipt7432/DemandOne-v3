import { delay, nowIso } from '@/infra/clock';
import { roundTo, priceStep } from '@/domain/terms';
import { getState, id, setState } from '@/state/store';
import { inboundBidsFor } from './negotiation';
import { updateViewer, viewerOf } from './viewer';
import type { Criterion, LocationMode, Need, Offer, PriceUnit, TimingSpec } from '@/domain/types';

/**
 * The viewer's own positions in the market — Needs and Offers. With
 * negotiation.ts, transactions.ts and account.ts, the only write path.
 */

export const DEFAULT_TIMING: TimingSpec = { type: 'flexible', window: { startHour: 0, endHour: 336, label: 'Within two weeks' } };

export interface PositionInput {
  mode: 'need' | 'offer';
  title: string;
  description?: string;
  category: string;
  /** Need: the private maximum. Offer: the public ask. */
  price: number;
  unit?: PriceUnit;
  /** Offer only: private minimum. Defaults to 85% of the ask. */
  floorPrice?: number;
  timing?: TimingSpec;
  capacityHours?: number;
  /** How many weeks the released hours span (split evenly). Defaults to one. */
  weeks?: number;
  locationMode?: LocationMode;
  priorities?: Criterion[];
}

/** Post a Need or release an Offer. Returns its id. An Offer draws bids from buyers with matching open needs. */
export async function createPosition(input: PositionInput): Promise<string> {
  await delay(400);
  const newId = id(input.mode === 'need' ? 'n' : 'o');
  const timing = input.timing ?? DEFAULT_TIMING;
  setState((s) => {
    const viewer = viewerOf(s);
    const common = {
      id: newId,
      personId: viewer.id,
      category: input.category,
      title: input.title,
      description: input.description ?? input.title,
      unit: input.unit ?? 'fixed',
      window: timing.window,
      howLong: 'once' as const,
      timing,
      locationMode: input.locationMode ?? 'remote',
      priorities: input.priorities ?? [],
      createdAt: nowIso(),
    };
    if (input.mode === 'need') {
      const need: Need = { ...common, budgetMax: input.price, distanceMax: 50 };
      return updateViewer(s, (v) => ({ ...v, needs: [need, ...v.needs] }));
    }
    const offer: Offer = {
      ...common,
      price: input.price,
      floorPrice: input.floorPrice ?? roundTo(input.price * 0.85, priceStep(input.price), 'up'),
      capacityHours: input.capacityHours,
      // Released hours spanning several weeks are split evenly across them.
      weeklyHours: input.capacityHours ? splitWeeks(input.capacityHours, Math.max(1, input.weeks ?? 1)) : undefined,
    };
    const withOffer = updateViewer(s, (v) => ({ ...v, offers: [offer, ...v.offers] }));
    return inboundBidsFor(withOffer, offer);
  });
  return newId;
}

function splitWeeks(hours: number, weeks: number): number[] {
  const base = Math.floor(hours / weeks);
  return Array.from({ length: weeks }, (_, i) => base + (i < hours % weeks ? 1 : 0));
}

/** Standing demand: keep watching until the market lines up. */
export async function keepWatching(mode: 'need' | 'offer', targetId: string): Promise<void> {
  await delay(200);
  setState((s) =>
    updateViewer(s, (v) =>
      mode === 'need'
        ? { ...v, needs: v.needs.map((n) => (n.id === targetId ? { ...n, howLong: 'watching' } : n)) }
        : { ...v, offers: v.offers.map((o) => (o.id === targetId ? { ...o, howLong: 'watching' } : o)) }
    )
  );
}

/** Adjust the hours released on one of the viewer's offers. */
export async function setOfferCapacity(offerId: string, hours: number): Promise<void> {
  await delay(200);
  setState((s) =>
    updateViewer(s, (v) => ({
      ...v,
      offers: v.offers.map((o) => {
        if (o.id !== offerId) return o;
        const total = Math.max(0, Math.round(hours));
        return { ...o, capacityHours: total, weeklyHours: o.weeklyHours ? splitWeeks(total, o.weeklyHours.length) : undefined };
      }),
    }))
  );
}

/** Hide a listing from the viewer's Exchange. */
export async function passCard(cardId: string): Promise<void> {
  setState((s) => (s.passedCardIds.includes(cardId) ? s : { ...s, passedCardIds: [...s.passedCardIds, cardId] }));
}

export function findPosition(positionId: string): { kind: 'need'; need: Need } | { kind: 'offer'; offer: Offer } | undefined {
  const viewer = viewerOf(getState());
  const need = viewer.needs.find((n) => n.id === positionId);
  if (need) return { kind: 'need', need };
  const offer = viewer.offers.find((o) => o.id === positionId);
  return offer ? { kind: 'offer', offer } : undefined;
}
