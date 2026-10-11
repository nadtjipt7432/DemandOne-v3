/**
 * Domain types for DemandOne V3.
 *
 * Everyone is both buyer and seller: one `Person` with `needs` and `offers`. The
 * Exchange lists other people's open positions (`MatchCard`) — public data only.
 * Private limits (a seller's minimum, a buyer's maximum) never live on a listing;
 * they sit in `AppState.privateLimits`, read only by the negotiation engine.
 *
 * A negotiation is one shared record (`Negotiation`) both parties reference, and an
 * agreement becomes one shared transaction (`Booking`) with a buyer and a seller.
 */

export type TrustTier = 'everyday' | 'trades' | 'expert';

/** The weighted, rankable Standard of Value. Timing is a hard constraint, not a criterion. */
export type Criterion = 'budget' | 'expertise' | 'geography' | 'trust';

/** Hours-from-now interval — real enough to overlap-check. */
export interface TimeWindow {
  startHour: number;
  endHour: number;
  label: string; // e.g. "Oct 13–17"
}

export interface Category {
  id: string;
  label: string;
  /** A sensible default price when someone posts in this category — a starting suggestion, never a market claim. */
  typicalPrice: number;
}

export interface StandardOfValue {
  order: Criterion[]; // length 4, most → least important
}

/** How long the agent keeps looking: once, or standing demand. */
export type HowLong = 'once' | 'watching';

export type TimingType = 'asap' | 'date' | 'window' | 'flexible';
export interface TimingSpec {
  type: TimingType;
  deadlineLabel?: string;
  window: TimeWindow;
}

export type LocationMode = 'remote' | 'in-person' | 'hybrid';

/** What the price is for. */
export type PriceUnit = 'fixed' | 'hour' | 'sprint';

/** Broad type of value exchanged (advise/analyze/...), inferred from text. */
export type WorkCategory = 'advise' | 'analyze' | 'build' | 'operate' | 'connect' | 'create';

/**
 * What someone says they could offer — not an Offer. It informs matching and
 * suggested opportunities; posting an Offer is always a separate, explicit act.
 */
export interface CapabilityProfile {
  summary: string;
  categories: string[];
  workTypes: WorkCategory[];
  locationMode?: LocationMode;
  availabilityNote?: string;
}

/** One of the viewer's own Needs. `budgetMax` is the viewer's private maximum. */
export interface Need {
  id: string;
  personId: string;
  category: string;
  title: string;
  description: string;
  budgetMax: number;
  unit: PriceUnit;
  window: TimeWindow;
  distanceMax: number;
  howLong?: HowLong;
  timing: TimingSpec;
  locationMode: LocationMode;
  priorities: Criterion[];
  createdAt: string;
}

/**
 * negotiating: the seller's agent is working the selected bids;
 * ready: outcomes are in, awaiting the seller's approval;
 * committed: approved — hours are committed, transactions exist.
 */
export interface AllocationPlan {
  strategy: string;
  negotiationIds: string[];
  status: 'negotiating' | 'ready' | 'committed';
  authorizedAt: string;
}

/** One of the viewer's own Offers. `floorPrice` is the viewer's private minimum. */
export interface Offer {
  id: string;
  personId: string;
  category: string;
  title: string;
  description: string;
  price: number;
  unit: PriceUnit;
  floorPrice?: number;
  window: TimeWindow;
  howLong?: HowLong;
  timing: TimingSpec;
  /** Hours released to the market, when the offer is time-based. */
  capacityHours?: number;
  /** Hours released per week, when spread over several weeks. Sums to capacityHours. */
  weeklyHours?: number[];
  /** The allocation the seller authorized across competing bids. */
  allocation?: AllocationPlan;
  locationMode: LocationMode;
  priorities: Criterion[];
  createdAt: string;
}

export interface Person {
  id: string;
  name: string;
  initials: string;
  location: string;
  tier: TrustTier;
  /** Verified completed DemandOne transactions. */
  completedCount: number;
  /** Of those, how many counterparties said they'd work with this person again. */
  recommendCount: number;
  /** People the viewer knows who have worked with this person. */
  trustPaths: number;
  verified: { identity: boolean; insurance: boolean; references: boolean };
  /** One concise qualification statement. */
  bio: string;
  /** Professional background, in the person's own words. */
  background?: string;
  /** LinkedIn or proof-of-work links. */
  links?: string[];
  distanceMi: number;
  responseRate: number;
  responseTimeLabel: string;
  needs: Need[];
  offers: Offer[];
  categories: string[];
  standardOfValue: StandardOfValue;
  capability?: CapabilityProfile;
}

export type CardKind = 'need' | 'offer'; // what the listing's owner is posting

export interface FitBreakdown {
  budget: number;
  expertise: number;
  geography: number;
  trust: number;
}

export interface Fit {
  score: number;
  breakdown: FitBreakdown;
  explanation: string[];
}

/** Price against comparable open listings in the exchange — only claimed with enough comparables. */
export interface MarketValue {
  deltaPct: number;
  isGoodValue: boolean;
  label: string;
}

/** A public ask revision on a listing — real history, shown as "was £X". */
export interface PriceRevision {
  price: number;
  at: string; // display label, e.g. "Oct 8"
}

export interface ListingCapacity {
  total: number;
  remaining: number;
  unit: 'hours' | 'slots';
}

/** An open position in the Exchange — public data only. */
export interface MatchCard {
  id: string;
  kind: CardKind;
  personId: string;
  category: string;
  title: string;
  description: string;
  price: number;
  unit: PriceUnit;
  window: TimeWindow;
  /** Plain deadline or start, e.g. "IC in 25 days", "Due Oct 24". */
  timingNote: string;
  distanceMi: number;
  negotiable: boolean;
  capacity?: ListingCapacity;
  revisions?: PriceRevision[];
  /** A real, time-sensitive event on this position, e.g. "Released today". */
  marketEvent?: string;
  /** Internal ranking pressure. Never rendered. */
  liquiditySignal: number;
}

/* ------------------------------------------------------------- Negotiation */

export type DeadlineOption = 'listed' | 'plus3' | 'plus7';
export type ScopeOption = 'full' | 'one-revision' | 'core';
export type PaymentOption = 'on-completion' | 'deposit' | 'upfront';
export type VolumeOption = 'single' | 'recurring';

/** A complete set of terms. Every proposal carries one. */
export interface Terms {
  /** Per unit (per hour for hourly work). */
  price: number;
  deadline: DeadlineOption;
  scope: ScopeOption;
  payment: PaymentOption;
  volume: VolumeOption;
  /** Hours of work, for hourly engagements. The engagement's value is price × hours. */
  hours?: number;
}

export type Side = 'buyer' | 'seller';
export type ProposalKind = 'ask' | 'bid' | 'counter' | 'revised';

export interface Proposal {
  id: string;
  by: Side;
  partyId: string;
  kind: ProposalKind;
  terms: Terms;
  at: string;
  /** listing = the public opening position; agent = proposed by a party's agent; final = a last offer. */
  source: 'listing' | 'agent';
  final?: boolean;
}

/**
 * evaluating → awaiting_response → countered ⇄ (revised proposal) → accepted → cleared,
 * with rejected / expired / withdrawn as terminal exits.
 */
export type NegotiationStatus =
  | 'evaluating'
  | 'awaiting_response'
  | 'countered'
  | 'accepted'
  | 'rejected'
  | 'expired'
  | 'withdrawn'
  | 'cleared';

export type NegotiationEventType =
  | 'evaluated'
  | 'proposal_submitted'
  | 'counter_received'
  | 'held'
  | 'tradeoff_identified'
  | 'accepted'
  | 'rejected'
  | 'expired'
  | 'withdrawn'
  | 'cleared';

/** Structured, so each party's view can phrase it from their side ("You bid…" vs "Jordan bid…"). */
export interface NegotiationEvent {
  id: string;
  at: string;
  type: NegotiationEventType;
  actorId?: string;
  proposalId?: string;
  price?: number;
  /** Term changes relative to the previous position, in plain language. */
  changes?: string[];
  /** evaluated: how many compatible positions were compared, and where this one ranked. */
  compared?: number;
  rank?: number;
  reason?: 'too-far' | 'final-not-met' | 'expired';
}

/** The position being negotiated, snapshotted so the record stands on its own. */
export interface ListingSnapshot {
  kind: CardKind; // the listing owner's side: 'offer' = owner sells
  ownerId: string;
  title: string;
  category: string;
  unit: PriceUnit;
  timingLabel: string;
  cardId?: string;
  offerId?: string;
}

export type Complexity = 'light' | 'standard' | 'complex';

/** What a buyer asked for when bidding on capacity — public to both sides. */
export interface EngagementRequest {
  summary: string;
  hours: number;
  /** Which released week the work falls in (0-based). */
  week: number;
  complexity: Complexity;
}

/** One record, shared by buyer and seller. */
export interface Negotiation {
  id: string;
  listing: ListingSnapshot;
  buyerId: string;
  sellerId: string;
  initiatorId: string;
  status: NegotiationStatus;
  proposals: Proposal[];
  /** How many times the responding counterparty has answered — the concession round. */
  responses: number;
  maxRounds: number;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  agreedProposalId?: string;
  bookingId?: string;
  /** For bids on released capacity: the engagement the buyer wants. */
  request?: EngagementRequest;
  events: NegotiationEvent[];
}

/* ------------------------------------------------------------ Transactions */

/** agreed → paid (held in escrow, demo) → delivered → complete. */
export type BookingStatus = 'agreed' | 'paid' | 'delivered' | 'complete';

export interface Fees {
  buyerFee: number;
  buyerTotal: number;
  sellerFee: number;
  sellerNet: number;
}

/** One transaction record, shared by buyer and seller. */
export interface Booking {
  id: string;
  negotiationId: string;
  title: string;
  category: string;
  unit: PriceUnit;
  buyerId: string;
  sellerId: string;
  terms: Terms;
  /** The seller's first ask — the honest reference for "below the initial ask". */
  openingPrice: number;
  /** The buyer's first bid — the reference for "above the initial bid". */
  openingBid?: number;
  /** Agreed total: price × hours for hourly work, else the price. Fees are on this. */
  total: number;
  fees: Fees;
  status: BookingStatus;
  deliveryLabel: string;
  window?: TimeWindow;
  payment?: { methodLabel: string; authorizedAt: string; demo: true };
  deliveredAt?: string;
  completedAt?: string;
  feedback: { byBuyer?: boolean; bySeller?: boolean };
  createdAt: string;
}

/* ------------------------------------------------------------------- Voice */

export interface VoiceTurn {
  id: string;
  from: 'user' | 'agent';
  text: string;
  at: string;
}

/* ------------------------------------------------------------------- State */

export interface Permission {
  key: string;
  label: string;
  sublabel: string;
  enabled: boolean;
}

export type NotificationPref = 'live' | 'daily' | 'weekly' | 'off';

export interface PaymentMethod {
  id: string;
  label: string;
}

export type OnboardingStep = 'capability' | 'values' | 'done';

/** The one local account on this device. Kept when signed out. */
export interface DeviceAccount {
  personId: string;
  email: string;
  onboarding: OnboardingStep;
  createdAt: string;
}

export interface AppState {
  account: DeviceAccount | null;
  signedIn: boolean;
  themeMode: 'light' | 'dark';
  notificationPref: NotificationPref;
  /** Read agent replies aloud (browser speech synthesis). */
  speakReplies: boolean;
  paymentMethods: PaymentMethod[];
  defaultPaymentId?: string;
  people: Record<string, Person>;
  cards: MatchCard[];
  /** Private limits: cardId → the listing owner's private reservation price. Engine-only. */
  reservations: Record<string, number>;
  /** Private limits per negotiation: negotiationId → partyId → reservation. Engine-only, except a party's own. */
  privateLimits: Record<string, Record<string, number>>;
  negotiations: Record<string, Negotiation>;
  bookings: Booking[];
  passedCardIds: string[];
  permissions: Permission[];
  categories: Category[];
}
