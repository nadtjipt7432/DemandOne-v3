/**
 * Domain types for DemandOne v2.
 *
 * The product idea: everyone is both buyer and seller (one `Person`, two symmetric
 * lists — `needs` and `offers`). The Exchange is a ranked, scrollable directory — not
 * filtered down to a sliver, so listings can be compared side by side — but ordered
 * by a transparent "fit" score computed from the viewer's own `StandardOfValue`
 * ranking, never an unexplained percentage.
 *
 * A `liquiditySignal` and similar internal-only fields drive quiet ranking/pricing
 * behavior but are never rendered directly — screens only ever show narrated
 * outcomes (see matching.ts and service.ts).
 */

export type TrustTier = 'everyday' | 'trades' | 'expert';

/**
 * Per the PRD: hard constraints → soft boundaries → preferences. Timing is a hard
 * constraint (either it fits your window or it doesn't — see `matching.ts`'s
 * `passesHardConstraints`), not a rankable preference, so it is deliberately not a
 * `Criterion`. These four are the weighted, rankable Standard of Value.
 */
export type Criterion = 'budget' | 'expertise' | 'geography' | 'trust';

/** Hours-from-now interval. Simple enough to fabricate in fixtures, real enough to overlap-check. */
export interface TimeWindow {
  startHour: number;
  endHour: number;
  label: string; // e.g. "Sat 8am–1pm"
}

export interface Category {
  id: string;
  label: string;
  icon: string; // Feather icon name
  /** External benchmark price for this category — what comparable listings elsewhere charge. */
  marketAvgPrice: number;
}

/** The user's ranked priorities. Order, not raw weights — see matching.ts for the conversion. */
export interface StandardOfValue {
  order: Criterion[]; // length 4, most → least important
}

/** How long the agent should keep looking — the PRD/memo's "standing demand" idea, kept minimal. */
export type HowLong = 'once' | 'watching';

/**
 * Timing as a first-class market variable (not just a date field). `window` is always
 * populated — derived from whichever preset the user picked — so the existing hard-constraint
 * check (`windowsFit` in matching.ts) keeps working unchanged regardless of how the timing was
 * expressed. `deadlineLabel` is the plain-language echo shown in the mandate summary.
 */
export type TimingType = 'asap' | 'date' | 'window' | 'flexible';
export interface TimingSpec {
  type: TimingType;
  deadlineLabel?: string; // e.g. "By Oct 3"
  window: TimeWindow;
}

/** "How much work" — buyer side. */
export type Effort = 'one-time' | 'few-hours' | 'several-days' | 'ongoing' | 'not-sure';
/** "How much capacity" — seller side. */
export type Capacity = 'one-project' | 'few-hours' | 'part-time' | 'multiple-clients' | 'ongoing';
export type LocationMode = 'remote' | 'in-person' | 'hybrid';

/** How much room the agent has to negotiate — mandate copy; see createFromText/intent-results. */
export type BuyerAuthority = 'none' | 'within-range' | 'best-deal';
export type SellerAuthority = 'none' | 'within-bounds' | 'toward-target';

/**
 * The Exchange's Work filter dimension — six deliberately broad categories
 * describing the TYPE of value exchanged (not a profession/industry). Defined
 * here (not in intents.ts, which does the actual inference) so this file never
 * has to import from intents.ts — intents.ts re-exports it for the one existing
 * import site (discover.tsx).
 */
export type WorkCategory = 'advise' | 'analyze' | 'build' | 'operate' | 'connect' | 'create';

/**
 * What someone says they *could* offer — deliberately not an `Offer`. An `Offer`
 * is live in the exchange with a price and terms; a capability profile is just a
 * standing description DemandOne can match demand against and suggest from. The
 * user decides, separately and explicitly, when (and whether) to turn a
 * suggestion into a real posted Offer — see intent-results.tsx's existing
 * createFromText flow, which this reuses rather than auto-posting anything.
 */
export interface CapabilityProfile {
  summary: string; // the raw natural-language text — never fabricated beyond this
  categories: string[]; // Category ids, inferred then user-editable
  workTypes: WorkCategory[];
  locationMode?: LocationMode;
  availabilityNote?: string;
}

export interface Need {
  id: string;
  personId: string;
  category: string; // Category id
  title: string;
  description: string;
  budgetMax: number;
  window: TimeWindow;
  distanceMax: number;
  howLong?: HowLong;
  timing: TimingSpec;
  effort: Effort;
  locationMode: LocationMode;
  location?: string;
  /** Comfortable range low — budgetMax is already the hard "ask before exceeding" ceiling. */
  budgetMin?: number;
  authority: BuyerAuthority;
  /** Up to 3, ranked by selection order — overrides the viewer's global Standard of Value for this mission's matches. */
  priorities: Criterion[];
}

export interface Offer {
  id: string;
  personId: string;
  category: string; // Category id
  title: string;
  description: string;
  price: number;
  window: TimeWindow;
  howLong?: HowLong;
  /** Basic clearing rule, same as MatchCard's (PRD: "provider floor... fixed vs negotiable"). Defaults to negotiable with no set floor when absent. */
  negotiable?: boolean;
  floorPrice?: number;
  timing: TimingSpec;
  capacity: Capacity;
  locationMode: LocationMode;
  location?: string;
  authority: SellerAuthority;
  priorities: Criterion[];
  /** "Great fit" / "not a fit" one-liner, display only. */
  fitNote?: string;
}

/**
 * A single concrete, named working relationship — the trust-graph "who actually
 * worked with whom" evidence, distinct from `trustPaths`' plain count. Populated only
 * where the demo data actually has a named relationship to show; most people have
 * none, which is the honest default (a count without a name is still real trust
 * evidence, just thinner).
 */
export interface Reference {
  name: string;
  context: string; // e.g. "Commercial diligence · 2026"
  recommends: boolean;
}

export interface Person {
  id: string;
  name: string;
  /** Only ever set/read for the viewer — NPCs never log in, so they never have one. */
  email?: string;
  initials: string;
  location: string;
  tier: TrustTier;
  /** DemandOne transactions this person has completed — quantified trust input, not a star rating. */
  completedCount: number;
  /** Of those counterparts, how many said they'd work with this person again (see §2: "Would you recommend / work with this person again? Yes/No"). */
  recommendCount: number;
  trustPaths: number; // people the viewer knows who worked with this person
  /** A single named example of who vouches for them, when the data has one — see `Reference`. */
  reference?: Reference;
  verified: { identity: boolean; insurance: boolean; references: boolean };
  /** One crisp, quantified sentence on why this person is credibly relevant — not a career history. */
  bio: string;
  distanceMi: number; // distance from the viewer's home reference point
  responseRate: number; // 0–100
  responseTimeLabel: string; // e.g. "usually replies in 20 min"
  needs: Need[];
  offers: Offer[];
  categories: string[]; // Category ids this person engages with, ranked to the top of the Exchange
  standardOfValue: StandardOfValue;
  /** Set once, at capability onboarding or later from Account — see CapabilityProfile's own doc comment for why this isn't an Offer. */
  capability?: CapabilityProfile;
}

export type CardKind = 'need' | 'offer'; // what the CARD's person is posting

export interface FitBreakdown {
  budget: number;
  expertise: number;
  geography: number;
  trust: number;
}

export interface Fit {
  score: number; // 0–100
  breakdown: FitBreakdown; // each 0–1
  explanation: string[]; // plain-language lines, in the viewer's own priority order
}

/** Objective — not personalized. How this price compares to the external category benchmark. */
export interface MarketValue {
  deltaPct: number; // positive = good value, however that's defined for this card's kind
  isGoodValue: boolean; // only true above a noticeable threshold, so it stays rare and meaningful
  label: string; // e.g. "18% below typical rate"
}

/** A single listing in the Exchange — someone else's need or offer. */
export interface MatchCard {
  id: string;
  kind: CardKind;
  personId: string;
  category: string;
  title: string;
  description: string;
  price: number;
  window: TimeWindow;
  distanceMi: number;
  urgencyNote?: string; // narrated only, e.g. "2 spots left" — never a raw delta
  bundleId?: string;
  /** Internal-only ranking/pricing pressure. Never rendered. -1..1 */
  liquiditySignal: number;
  /** Basic clearing rule (PRD: "provider floor... fixed vs negotiable... permitted concessions"). */
  negotiable: boolean;
  /** Offers only: the provider's floor — how far the agent can concede downward. */
  floorPrice?: number;
  /** Needs only: the requester's true hard ceiling — `price` is their opening ask, room to negotiate up to this. */
  ceilingPrice?: number;
}

export type SwipeDecision = 'like' | 'pass';

export type MatchStatus = 'pending' | 'mutual' | 'negotiating' | 'accepted' | 'booked' | 'passed';

export interface MatchMessage {
  from: 'agent' | 'them' | 'you';
  text: string;
  price?: number;
}

export interface Match {
  id: string;
  cardId: string;
  personId: string; // counterpart
  title: string; // the card's title, copied — it may leave the Exchange before this books
  status: MatchStatus;
  firstPrice: number;
  currentPrice: number;
  timeline: MatchMessage[];
  /** Copied from the source card at creation time — the card itself may since have left the Exchange. */
  negotiable: boolean;
  floorPrice?: number;
  ceilingPrice?: number;
  /** Also copied from the source card — which side the viewer is on, for the eventual booking. */
  kind: CardKind;
  category: string;
  window: TimeWindow;
}

/**
 * confirmed → live → delivered → complete. `delivered` is the seller marking the
 * work ready; only the buyer's own confirmation (never the seller's own action)
 * can move a booking on from there to `complete` — see `markDelivered`/
 * `confirmFulfillment` in service.ts.
 */
export type BookingStatus = 'confirmed' | 'live' | 'delivered' | 'complete';

/** Which side of this transaction the viewer is on — buyer pays and saves, seller earns. */
export type BookingRole = 'buyer' | 'seller';

export interface Booking {
  id: string;
  personId: string;
  service: string;
  when: string;
  distanceMi: number;
  price: number;
  status: BookingStatus;
  role: BookingRole;
  category?: string; // for the seller-side "earned above typical rate" callout
  /** Structured, so a new booking can be checked against it for a schedule conflict. Bundle joins don't have one. */
  window?: TimeWindow;
  savedAmount?: number;
  verifiedLine: string;
  /** Set once post-transaction feedback (submitFeedback) has run — guards against resubmitting. */
  feedbackGiven?: boolean;
  /** A direct thread with this booking's counterpart — separate from the agent chat (see message/[id].tsx). Reuses MatchMessage's shape. */
  messages?: MatchMessage[];
}

export interface BundleSlot {
  label: string;
  value: string;
  sub: string;
}

export interface Bundle {
  id: string;
  personName: string;
  when: string;
  slots: BundleSlot[];
  confirmedCount: number;
  totalCount: number;
  yourPrice: number;
  originalPrice: number;
  savedEach: number;
  steps: string[];
}

export interface Permission {
  key: string;
  label: string;
  sublabel: string;
  enabled: boolean;
}

export interface HouseholdMember {
  name: string;
  initials: string;
}

export type NotificationPref = 'live' | 'daily' | 'weekly' | 'off';

export interface PaymentMethod {
  id: string;
  label: string; // e.g. "Visa ending 6411"
}

export interface AppState {
  viewerId: string;
  onboarded: boolean;
  household: HouseholdMember[];
  themeMode: 'light' | 'dark';
  notificationPref: NotificationPref;
  paymentMethods: PaymentMethod[];
  defaultPaymentId: string;
  people: Record<string, Person>;
  cards: MatchCard[];
  matches: Record<string, Match>;
  bookings: Booking[];
  bundles: Record<string, Bundle>;
  permissions: Permission[];
  categories: Category[];
}
