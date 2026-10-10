import { getState, id, resetStore, setState } from './store';
import { applyThemeMode } from '@/theme';
import type {
  Booking,
  BuyerAuthority,
  Capacity,
  CapabilityProfile,
  Criterion,
  Effort,
  HouseholdMember,
  LocationMode,
  Match,
  Need,
  NotificationPref,
  Offer,
  SellerAuthority,
  TimeWindow,
  TimingSpec,
} from './types';

/**
 * Service layer — the ONLY write path. Every function here is async and mirrors the
 * shape of a Convex mutation/query. Screens never touch the store directly for writes.
 * To move to Convex: replace each body with a `useMutation`/`useQuery` call of the same name.
 */

const delay = (ms = 220) => new Promise((r) => setTimeout(r, ms));

/** Onboarding: commit the Standard of Value ranking quiz. */
export async function completeOnboarding(order: Criterion[]): Promise<void> {
  await delay(300);
  setState((s) => {
    const viewer = s.people[s.viewerId];
    return {
      ...s,
      onboarded: true,
      people: {
        ...s.people,
        [s.viewerId]: { ...viewer, standardOfValue: { order } },
      },
    };
  });
}

/**
 * One open input, no upfront side to pick — the agent routes it. A real system would
 * use the LLM already reading the sentence; this mock uses a small keyword heuristic
 * as its stand-in, so the "no wrong door" interaction is real even though the
 * classifier behind it is deliberately simple.
 */
const OFFER_SIGNALS = ["i can ", 'i offer', 'i have ', 'available', 'spare', 'free time', "i'm offering", 'offering '];

export function inferMode(text: string): 'need' | 'offer' {
  const lower = text.toLowerCase();
  return OFFER_SIGNALS.some((sig) => lower.includes(sig)) ? 'offer' : 'need';
}

const DEFAULT_TIMING: TimingSpec = { type: 'flexible', window: { startHour: 0, endHour: 48, label: 'This week' } };

export interface AskInput {
  mode: 'need' | 'offer';
  text: string;
  /** From Universal Intent Search, which already knows the right category — falls back to a guess otherwise. */
  category?: string;
  /** The hard ceiling, for a need — "never above this." Falls back to a generic default when unset. */
  budgetMax?: number;
  /** Comfortable range low, for a need. */
  budgetMin?: number;
  /** The asking price, for an offer. Falls back to a generic default when unset. */
  price?: number;
  /** Basic clearing rules, for an offer — where the floor/negotiable setting actually comes in. */
  negotiable?: boolean;
  floorPrice?: number;
  /** Timing as a first-class market variable — always carries a derived TimeWindow. */
  timing?: TimingSpec;
  effort?: Effort;
  capacity?: Capacity;
  locationMode?: LocationMode;
  location?: string;
  authority?: BuyerAuthority | SellerAuthority;
  /** Up to 3, ranked by selection order — overrides the viewer's global Standard of Value for this mission. */
  priorities?: Criterion[];
  fitNote?: string;
}

/** Turn a free-text ask into a structured need or offer for the viewer's own profile. Returns its id. */
export async function createFromText(input: AskInput): Promise<string> {
  await delay(400);
  const newId = id(input.mode === 'need' ? 'n' : 'o');
  const timing = input.timing ?? DEFAULT_TIMING;
  setState((s) => {
    const viewer = s.people[s.viewerId];
    const category = input.category ?? viewer.categories[0] ?? 'advisory';
    if (input.mode === 'need') {
      const need: Need = {
        id: newId,
        personId: s.viewerId,
        category,
        title: input.text,
        description: `Your agent turned "${input.text}" into a structured need.`,
        budgetMax: input.budgetMax ?? 150,
        budgetMin: input.budgetMin,
        window: timing.window,
        distanceMax: 10,
        howLong: 'once',
        timing,
        effort: input.effort ?? 'not-sure',
        locationMode: input.locationMode ?? 'remote',
        location: input.location,
        authority: (input.authority as BuyerAuthority) ?? 'within-range',
        priorities: input.priorities ?? [],
      };
      return { ...s, people: { ...s.people, [s.viewerId]: { ...viewer, needs: [need, ...viewer.needs] } } };
    }
    const offer: Offer = {
      id: newId,
      personId: s.viewerId,
      category,
      title: input.text,
      description: `Your agent turned "${input.text}" into a structured offer.`,
      price: input.price ?? 75,
      window: timing.window,
      howLong: 'once',
      negotiable: input.negotiable ?? true,
      floorPrice: input.negotiable ? input.floorPrice : undefined,
      timing,
      capacity: input.capacity ?? 'one-project',
      locationMode: input.locationMode ?? 'remote',
      location: input.location,
      authority: (input.authority as SellerAuthority) ?? 'within-bounds',
      priorities: input.priorities ?? [],
      fitNote: input.fitNote,
    };
    return { ...s, people: { ...s.people, [s.viewerId]: { ...viewer, offers: [offer, ...viewer.offers] } } };
  });
  return newId;
}

/** Fallback when nothing recommended clears the bar: keep watching until the market lines up. */
export async function keepWatching(mode: 'need' | 'offer', targetId: string): Promise<void> {
  await delay(200);
  setState((s) => {
    const viewer = s.people[s.viewerId];
    if (mode === 'need') {
      return {
        ...s,
        people: {
          ...s.people,
          [s.viewerId]: {
            ...viewer,
            needs: viewer.needs.map((n) => (n.id === targetId ? { ...n, howLong: 'watching' } : n)),
          },
        },
      };
    }
    return {
      ...s,
      people: {
        ...s.people,
        [s.viewerId]: {
          ...viewer,
          offers: viewer.offers.map((o) => (o.id === targetId ? { ...o, howLong: 'watching' } : o)),
        },
      },
    };
  });
}

/** Express interest: the card's person is notified and responds — ready to talk price or book. */
export async function likeCard(cardId: string): Promise<string | undefined> {
  await delay(260);
  let matchId: string | undefined;
  setState((s) => {
    const card = s.cards.find((c) => c.id === cardId);
    if (!card) return s;
    const counterpart = s.people[card.personId];
    matchId = id('match');
    const match: Match = {
      id: matchId,
      cardId,
      personId: card.personId,
      title: card.title,
      status: 'mutual',
      firstPrice: card.price,
      currentPrice: card.price,
      negotiable: card.negotiable,
      floorPrice: card.floorPrice,
      ceilingPrice: card.ceilingPrice,
      kind: card.kind,
      category: card.category,
      window: card.window,
      timeline: [
        { from: 'agent', text: `${counterpart?.name ?? 'They'} responded — ready to talk price or book.` },
      ],
    };
    return {
      ...s,
      matches: { ...s.matches, [matchId]: match },
      cards: s.cards.filter((c) => c.id !== cardId),
    };
  });
  return matchId;
}

/** Pass: quietly drop the card, no trace left in the Exchange. */
export async function passCard(cardId: string): Promise<void> {
  setState((s) => ({ ...s, cards: s.cards.filter((c) => c.id !== cardId) }));
}

/**
 * Ask the agent to try for a better price on a mutual match. Directional by which
 * side the viewer is on: a buyer (kind 'offer') negotiates down toward the
 * provider's floor; a seller (kind 'need') negotiates up toward the requester's
 * true ceiling — never the other way for either side. Respects that boundary (a
 * basic clearing rule, per the PRD) and says so in plain language rather than
 * pretending to negotiate further once there's no room left.
 */
export async function negotiateMatch(matchId: string): Promise<void> {
  await delay(500);
  setState((s) => {
    const match = s.matches[matchId];
    if (!match) return s;
    const counterpart = s.people[match.personId];
    const name = counterpart?.name ?? 'them';
    const isSeller = match.kind === 'need';

    if (!match.negotiable) {
      return {
        ...s,
        matches: {
          ...s.matches,
          [matchId]: {
            ...match,
            timeline: [...match.timeline, { from: 'agent', text: `${name} has this at a fixed price — no room to negotiate.` }],
          },
        },
      };
    }

    const tryPrice = isSeller
      ? Math.min(match.ceilingPrice ?? match.currentPrice, Math.round(match.currentPrice * 1.09))
      : Math.max(match.floorPrice ?? 1, Math.round(match.currentPrice * 0.91));
    const noRoomLeft = isSeller ? tryPrice <= match.currentPrice : tryPrice >= match.currentPrice;

    if (noRoomLeft) {
      return {
        ...s,
        matches: {
          ...s.matches,
          [matchId]: {
            ...match,
            timeline: [
              ...match.timeline,
              {
                from: 'agent',
                text: isSeller
                  ? `$${match.currentPrice} is already the most ${name} will pay.`
                  : `$${match.currentPrice} is already ${name}'s best price.`,
              },
            ],
          },
        },
      };
    }

    return {
      ...s,
      matches: {
        ...s.matches,
        [matchId]: {
          ...match,
          status: 'negotiating',
          currentPrice: tryPrice,
          timeline: [
            ...match.timeline,
            {
              from: 'agent',
              text: isSeller ? `Asked ${name} if they could pay a bit more.` : `Asked ${name} for a better price.`,
            },
            { from: 'them', text: `Can do $${tryPrice}.`, price: tryPrice },
          ],
        },
      },
    };
  });
}

/**
 * A second negotiation dimension (price isn't the only lever): offering the
 * counterparty more delivery slack in exchange for a lower price — buyer side
 * only, and only ever surfaced by match/[id].tsx when the viewer's own need in
 * this category is actually flexible (timing.type !== 'asap'), so the trade being
 * offered is real, not invented on the spot.
 */
export async function negotiateWithFlexibleTiming(matchId: string): Promise<void> {
  await delay(500);
  setState((s) => {
    const match = s.matches[matchId];
    if (!match || match.kind !== 'offer' || !match.negotiable) return s;
    const counterpart = s.people[match.personId];
    const name = counterpart?.name ?? 'them';
    const tradedPrice = Math.max(match.floorPrice ?? 1, Math.round(match.currentPrice * 0.93));
    const extendedWindow: TimeWindow = {
      ...match.window,
      endHour: match.window.endHour + 96,
      label: `${match.window.label} · flexible +4 days`,
    };
    return {
      ...s,
      matches: {
        ...s.matches,
        [matchId]: {
          ...match,
          status: 'negotiating',
          currentPrice: tradedPrice,
          window: extendedWindow,
          timeline: [
            ...match.timeline,
            { from: 'agent', text: `Offered ${name} a few extra days on delivery in exchange for a lower price.` },
            { from: 'them', text: `If delivery can slide, I can do $${tradedPrice}.`, price: tradedPrice },
          ],
        },
      },
    };
  });
}

/**
 * The viewer explicitly raises their own stated ceiling for a category — never
 * done silently by the agent (see matching.ts/myMarket.ts's tension calc, which
 * this is what actually resolves). Floors at the current value so it only ever
 * moves up.
 */
export async function raiseMaximum(category: string, newMax: number): Promise<void> {
  await delay(250);
  setState((s) => {
    const viewer = s.people[s.viewerId];
    const needs = viewer.needs.map((n) => (n.category === category ? { ...n, budgetMax: Math.max(n.budgetMax, newMax) } : n));
    return { ...s, people: { ...s.people, [s.viewerId]: { ...viewer, needs } } };
  });
}

function addBooking(
  s: ReturnType<typeof getState>,
  b: Omit<Booking, 'id' | 'status'> & { status?: Booking['status'] }
): { state: ReturnType<typeof getState>; bookingId: string } {
  const bookingId = id('bk');
  const booking: Booking = { id: bookingId, status: 'confirmed', ...b };
  return { state: { ...s, bookings: [booking, ...s.bookings] }, bookingId };
}

/** Accept a match at its current price → book it. Returns bookingId. */
export async function acceptMatch(matchId: string): Promise<string> {
  await delay();
  let bookingId = '';
  setState((s) => {
    const match = s.matches[matchId];
    if (!match) return s;
    const person = s.people[match.personId];
    // kind 'offer' = the card was their offer, viewer pays (buyer). kind 'need' = the
    // card was their need, viewer is fulfilling it (seller) — the roles this match is about.
    const role = match.kind === 'need' ? 'seller' : 'buyer';
    const res = addBooking(s, {
      personId: match.personId,
      service: match.title,
      when: match.window.label,
      distanceMi: person?.distanceMi ?? 0,
      price: match.currentPrice,
      role,
      category: match.category,
      window: match.window,
      savedAmount: role === 'buyer' ? Math.max(0, match.firstPrice - match.currentPrice) : undefined,
      verifiedLine: person?.verified.insurance ? 'Identity + insurance verified' : 'Identity verified',
    });
    bookingId = res.bookingId;
    return {
      ...res.state,
      matches: { ...res.state.matches, [matchId]: { ...match, status: 'booked' } },
    };
  });
  return bookingId;
}

/** Secure a card directly at its listed (or agent-tried) price, no match dance. Returns bookingId. */
export async function secureCard(cardId: string, priceOverride?: number): Promise<string> {
  await delay();
  let bookingId = '';
  setState((s) => {
    const card = s.cards.find((c) => c.id === cardId);
    if (!card) return s;
    const person = s.people[card.personId];
    const price = priceOverride ?? card.price;
    const role = card.kind === 'need' ? 'seller' : 'buyer';
    const res = addBooking(s, {
      personId: card.personId,
      service: card.title,
      when: card.window.label,
      distanceMi: card.distanceMi,
      price,
      role,
      category: card.category,
      window: card.window,
      savedAmount: role === 'buyer' && priceOverride ? Math.max(0, card.price - priceOverride) : undefined,
      verifiedLine: person?.verified.insurance ? 'Identity + insurance verified' : 'Identity verified',
    });
    bookingId = res.bookingId;
    return { ...res.state, cards: res.state.cards.filter((c) => c.id !== cardId) };
  });
  return bookingId;
}

/** Join a shared route/bundle slot at the lower price. Returns bookingId. */
export async function joinBundle(bundleId: string): Promise<string> {
  await delay();
  let bookingId = '';
  setState((s) => {
    const bundle = s.bundles[bundleId];
    if (!bundle) return s;
    const res = addBooking(s, {
      personId: 'victor',
      service: `${bundle.personName.split(' · ')[0]} · bundled engagement`,
      when: bundle.when,
      distanceMi: 0,
      role: 'buyer',
      price: bundle.yourPrice,
      savedAmount: bundle.savedEach,
      verifiedLine: 'Identity + insurance verified',
    });
    bookingId = res.bookingId;
    return {
      ...res.state,
      bundles: {
        ...res.state.bundles,
        [bundleId]: { ...bundle, confirmedCount: Math.min(bundle.totalCount, bundle.confirmedCount + 1) },
      },
    };
  });
  return bookingId;
}

/** Seller action: the work is ready. Never releases payment on its own — see confirmFulfillment. */
export async function markDelivered(bookingId: string): Promise<void> {
  await delay(300);
  setState((s) => ({
    ...s,
    bookings: s.bookings.map((b) => (b.id === bookingId && b.status !== 'complete' ? { ...b, status: 'delivered' } : b)),
  }));
}

/** Buyer action: the only thing that can move a booking to `complete` — a seller marking their own work complete can't release payment by themselves. */
export async function confirmFulfillment(bookingId: string): Promise<void> {
  await delay(300);
  setState((s) => ({
    ...s,
    bookings: s.bookings.map((b) => (b.id === bookingId && b.status === 'delivered' ? { ...b, status: 'complete' } : b)),
  }));
}

/**
 * The literal mechanism behind "market memory": a completed booking's counterpart
 * gets a real completedCount/recommendCount update, not a cosmetic one. Guarded by
 * `feedbackGiven` so it can only ever run once per booking.
 */
export async function submitFeedback(bookingId: string, recommends: boolean): Promise<void> {
  await delay(200);
  setState((s) => {
    const booking = s.bookings.find((b) => b.id === bookingId);
    if (!booking || booking.feedbackGiven) return s;
    const counterpart = s.people[booking.personId];
    const people = counterpart
      ? {
          ...s.people,
          [booking.personId]: {
            ...counterpart,
            completedCount: counterpart.completedCount + 1,
            recommendCount: counterpart.recommendCount + (recommends ? 1 : 0),
          },
        }
      : s.people;
    return {
      ...s,
      people,
      bookings: s.bookings.map((b) => (b.id === bookingId ? { ...b, feedbackGiven: true } : b)),
    };
  });
}

export async function togglePermission(key: string): Promise<void> {
  setState((s) => ({
    ...s,
    permissions: s.permissions.map((p) => (p.key === key ? { ...p, enabled: !p.enabled } : p)),
  }));
}

export async function setNotificationPref(pref: NotificationPref): Promise<void> {
  await delay(150);
  setState((s) => ({ ...s, notificationPref: pref }));
}

/**
 * Mutates the shared `colors` object *before* triggering the store update, so every
 * screen's re-render (they all subscribe via useAppState) already sees the new
 * palette — doing this the other way round (e.g. from a useEffect reacting to the
 * state change) would paint one frame behind, since mutating a plain object doesn't
 * itself cause React to re-render anything.
 */
export async function setThemeMode(mode: 'light' | 'dark'): Promise<void> {
  applyThemeMode(mode);
  setState((s) => ({ ...s, themeMode: mode }));
}

export async function setDefaultPayment(paymentId: string): Promise<void> {
  await delay(150);
  setState((s) => ({ ...s, defaultPaymentId: paymentId }));
}

export async function addPaymentMethod(label: string): Promise<void> {
  await delay(300);
  const paymentId = id('pm');
  setState((s) => ({
    ...s,
    paymentMethods: [...s.paymentMethods, { id: paymentId, label }],
    defaultPaymentId: paymentId,
  }));
}

/** The viewer sets or edits where they're based — asked at login, editable later from Account. */
export async function setLocation(location: string): Promise<void> {
  await delay(150);
  setState((s) => ({
    ...s,
    people: { ...s.people, [s.viewerId]: { ...s.people[s.viewerId], location } },
  }));
}

/** What login actually captures becomes the real identity — not thrown away after Verify. */
export async function setIdentity(name: string, email: string): Promise<void> {
  await delay(150);
  setState((s) => ({
    ...s,
    people: { ...s.people, [s.viewerId]: { ...s.people[s.viewerId], name, email } },
  }));
}

/** Set at capability onboarding, or edited later from Account — see CapabilityProfile's doc comment. */
export async function setCapabilityProfile(profile: CapabilityProfile): Promise<void> {
  await delay(250);
  setState((s) => ({
    ...s,
    people: { ...s.people, [s.viewerId]: { ...s.people[s.viewerId], capability: profile } },
  }));
}

export async function addHouseholdMember(name: string): Promise<void> {
  await delay(250);
  const initials = name
    .trim()
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase())
    .slice(0, 2)
    .join('');
  const member: HouseholdMember = { name: name.trim(), initials: initials || '?' };
  setState((s) => ({ ...s, household: [...s.household, member] }));
}

const AUTO_REPLIES = [
  "Got it — I'll follow up here.",
  "Sounds good, thanks for the update.",
  "Noted. I'll keep you posted on my end.",
];

/**
 * A direct thread with the booking's counterpart — distinct from the agent chat
 * (`/agent`). Mocked the same way as everything else here: no real messaging
 * backend, just a deterministic canned reply after a short delay, so the
 * interaction still feels real rather than being a dead input.
 */
export async function sendBookingMessage(bookingId: string, text: string): Promise<void> {
  const you: Match['timeline'][number] = { from: 'you', text };
  setState((s) => ({
    ...s,
    bookings: s.bookings.map((b) => (b.id === bookingId ? { ...b, messages: [...(b.messages ?? []), you] } : b)),
  }));
  await delay(500);
  const reply = AUTO_REPLIES[Math.floor(Math.random() * AUTO_REPLIES.length)];
  setState((s) => ({
    ...s,
    bookings: s.bookings.map((b) => (b.id === bookingId ? { ...b, messages: [...(b.messages ?? []), { from: 'them', text: reply }] } : b)),
  }));
}

/** Wipes any persisted demo state and restores the seeded starting scenario. */
export async function resetDemo(): Promise<void> {
  await delay(300);
  resetStore();
}
