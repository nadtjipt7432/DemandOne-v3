import type { AppState, Category, Complexity, MatchCard, Person } from '@/domain/types';

/**
 * The demo market a new account walks into: fictional counterparties and their
 * open positions — professional capacity released to the market, and demand from
 * firms that need it. Nothing here belongs to the signed-in user.
 *
 * Private limits (each owner's minimum or maximum) are in `reservations`, never on
 * a listing; only the negotiation engine reads them.
 */

export const categories: Category[] = [
  { id: 'finance', label: 'Financial modeling & valuation', typicalPrice: 5000 },
  { id: 'ma-advisory', label: 'M&A & diligence', typicalPrice: 18000 },
  { id: 'strategy', label: 'Strategy & market research', typicalPrice: 3000 },
  { id: 'tax', label: 'Tax structuring', typicalPrice: 220 },
  { id: 'advisory', label: 'Fractional leadership', typicalPrice: 180 },
];

function person(p: Pick<Person, 'id' | 'name' | 'initials' | 'location' | 'completedCount' | 'recommendCount' | 'trustPaths' | 'bio' | 'categories'> & Partial<Person>): Person {
  return {
    tier: 'everyday',
    verified: { identity: true, insurance: false, references: p.completedCount > 5 },
    distanceMi: 0,
    responseRate: 90,
    responseTimeLabel: 'usually replies within a day',
    needs: [],
    offers: [],
    standardOfValue: { order: ['expertise', 'trust', 'budget', 'geography'] },
    ...p,
  };
}

const counterparties: Person[] = [
  person({ id: 'alex', name: 'Alex Chen', initials: 'AC', location: 'London', completedCount: 14, recommendCount: 13, trustPaths: 1, bio: 'Ex-JPMorgan TMT analyst; has built 30+ Series A–C models.', categories: ['finance'] }),
  person({ id: 'priya', name: 'Priya Lal', initials: 'PL', location: 'Manchester', completedCount: 22, recommendCount: 21, trustPaths: 0, bio: 'Former FP&A lead at two Series C fintechs.', categories: ['finance'] }),
  person({ id: 'meridian', name: 'Meridian Advisory', initials: 'MA', location: 'London', completedCount: 31, recommendCount: 29, trustPaths: 2, bio: 'Boutique transaction advisory; 40+ mid-market deals.', categories: ['ma-advisory'] }),
  person({ id: 'claire', name: 'Claire Whitfield', initials: 'CW', location: 'Edinburgh', completedCount: 16, recommendCount: 15, trustPaths: 1, bio: 'Former Big Four tax partner.', categories: ['tax'] }),
  person({ id: 'harper', name: 'Harper Voss', initials: 'HV', location: 'Remote', completedCount: 9, recommendCount: 9, trustPaths: 0, bio: 'Led go-to-market for three B2B SaaS expansions into Europe.', categories: ['strategy'] }),
  person({ id: 'halden', name: 'Halden Capital', initials: 'HC', location: 'London', completedCount: 6, recommendCount: 6, trustPaths: 0, bio: 'Growth equity fund investing in vertical software.', categories: ['ma-advisory', 'strategy'] }),
  person({ id: 'lumen', name: 'Lumen Health', initials: 'LH', location: 'Bristol', completedCount: 0, recommendCount: 0, trustPaths: 0, bio: 'Seed-stage clinic-scheduling software.', categories: ['strategy'] }),
  person({ id: 'nova', name: 'Nova Robotics', initials: 'NR', location: 'Cambridge', completedCount: 2, recommendCount: 2, trustPaths: 0, bio: 'Warehouse robotics, preparing a Series B.', categories: ['finance'] }),
  person({ id: 'kite', name: 'Kite Labs', initials: 'KL', location: 'London', completedCount: 1, recommendCount: 1, trustPaths: 0, bio: 'Seed-stage B2B marketplace.', categories: ['finance'] }),
  person({ id: 'northbridge', name: 'Northbridge Partners', initials: 'NP', location: 'London', completedCount: 12, recommendCount: 12, trustPaths: 1, bio: 'Mid-market private equity; portfolio of eight software companies.', categories: ['finance', 'ma-advisory'] }),
  person({ id: 'omar', name: 'Omar Haddad', initials: 'OH', location: 'Leeds', completedCount: 1, recommendCount: 1, trustPaths: 0, bio: 'Founder of a 12-person design studio.', categories: ['tax'] }),
];

const cards: MatchCard[] = [
  {
    id: 'c1',
    kind: 'offer',
    personId: 'alex',
    category: 'finance',
    title: 'Series A financial model, one build slot this month',
    description: 'Three-statement model with scenarios, built from your actuals and plan. Two revision rounds.',
    price: 6000,
    unit: 'fixed',
    window: { startHour: 48, endHour: 200, label: 'Thu Oct 15' },
    timingNote: 'Delivers Thu Oct 15',
    distanceMi: 0,
    negotiable: true,
    capacity: { total: 1, remaining: 1, unit: 'slots' },
    liquiditySignal: -0.1,
  },
  {
    id: 'c2',
    kind: 'offer',
    personId: 'priya',
    category: 'finance',
    title: 'FP&A modeling capacity released for next week',
    description: 'Budget-vs-actuals, reforecasts and board-pack models. Remote.',
    price: 150,
    unit: 'hour',
    window: { startHour: 48, endHour: 168, label: 'Oct 12–16' },
    timingNote: 'Available Oct 12–16',
    distanceMi: 0,
    negotiable: true,
    capacity: { total: 12, remaining: 8, unit: 'hours' },
    liquiditySignal: -0.2,
  },
  {
    id: 'c3',
    kind: 'offer',
    personId: 'meridian',
    category: 'ma-advisory',
    title: 'Diligence team with temporary capacity after a deal slipped',
    description: 'Two-person financial diligence team: quality of earnings, working capital, net debt.',
    price: 22000,
    unit: 'sprint',
    window: { startHour: 240, endHour: 720, label: 'From Oct 20' },
    timingNote: 'Three-week sprint from Oct 20',
    distanceMi: 0,
    negotiable: true,
    capacity: { total: 2, remaining: 1, unit: 'slots' },
    revisions: [{ price: 24000, at: 'Oct 8' }],
    liquiditySignal: -0.4,
  },
  {
    id: 'c4',
    kind: 'offer',
    personId: 'claire',
    category: 'tax',
    title: 'Acquisition tax structuring, two client slots this month',
    description: 'Deal structure, stamp duty and transaction tax questions before signing.',
    price: 220,
    unit: 'hour',
    window: { startHour: 0, endHour: 720, label: 'This month' },
    timingNote: 'Available this month',
    distanceMi: 0,
    negotiable: true,
    capacity: { total: 2, remaining: 2, unit: 'slots' },
    liquiditySignal: 0,
  },
  {
    id: 'c5',
    kind: 'offer',
    personId: 'harper',
    category: 'strategy',
    title: 'Market-entry strategy sprint, 12 hours freed up',
    description: 'Positioning, pricing and channel plan for a European launch. Fixed price.',
    price: 2400,
    unit: 'fixed',
    window: { startHour: 24, endHour: 120, label: 'Oct 11–15' },
    timingNote: 'Available Oct 11–15',
    distanceMi: 0,
    negotiable: false,
    capacity: { total: 12, remaining: 12, unit: 'hours' },
    marketEvent: 'Released today',
    liquiditySignal: -0.3,
  },
  {
    id: 'c6',
    kind: 'need',
    personId: 'halden',
    category: 'ma-advisory',
    title: 'Commercial diligence on a vertical-SaaS target before IC',
    description: 'Market, customer and competitive diligence on a £60m target. Findings needed before investment committee.',
    price: 18000,
    unit: 'fixed',
    window: { startHour: 0, endHour: 600, label: 'IC Nov 4' },
    timingNote: 'IC in 25 days',
    distanceMi: 0,
    negotiable: true,
    liquiditySignal: 0.3,
  },
  {
    id: 'c7',
    kind: 'need',
    personId: 'lumen',
    category: 'strategy',
    title: 'UK market sizing for clinic-scheduling software',
    description: 'Bottom-up sizing of independent clinics, with a short competitor scan.',
    price: 3200,
    unit: 'fixed',
    window: { startHour: 0, endHour: 336, label: 'Oct 24' },
    timingNote: 'Due Oct 24',
    distanceMi: 0,
    negotiable: true,
    liquiditySignal: 0.1,
  },
  {
    id: 'c8',
    kind: 'need',
    personId: 'nova',
    category: 'finance',
    title: 'Financial model and valuation ahead of a Series B',
    description: 'Rebuild the operating model and a DCF and comps valuation for the raise.',
    price: 7500,
    unit: 'fixed',
    window: { startHour: 0, endHour: 504, label: 'Oct 31' },
    timingNote: 'Due Oct 31',
    distanceMi: 0,
    negotiable: true,
    liquiditySignal: 0.2,
  },
  {
    id: 'c9',
    kind: 'need',
    personId: 'kite',
    category: 'finance',
    title: 'Quarterly reforecast for a seed-stage marketplace',
    description: 'Update the 18-month forecast with Q3 actuals and new hiring plan.',
    price: 2800,
    unit: 'fixed',
    window: { startHour: 0, endHour: 336, label: 'Oct 24' },
    timingNote: 'Due Oct 24',
    distanceMi: 0,
    negotiable: true,
    liquiditySignal: 0.1,
  },
  {
    id: 'c10',
    kind: 'need',
    personId: 'omar',
    category: 'tax',
    title: 'Bookkeeping clean-up before year-end filing',
    description: 'Reconcile twelve months of accounts before the accountant files.',
    price: 900,
    unit: 'fixed',
    window: { startHour: 24, endHour: 400, label: 'Oct 30' },
    timingNote: 'Due Oct 30',
    distanceMi: 0,
    negotiable: true,
    liquiditySignal: 0,
  },
];

/** Private limits by listing: a seller's minimum (offers) or a buyer's maximum (needs). */
const reservations: Record<string, number> = {
  c1: 5000,
  c2: 125,
  c3: 19000,
  c4: 185,
  c6: 21500,
  c7: 3800,
  c8: 8800,
  c9: 3300,
  c10: 1100,
};

/**
 * Buyers with live demand for released capacity, by category. When someone
 * releases hours, these are the bids that arrive. `rate` is the public bid
 * for an ask of £150/hr (scaled to the actual ask); `limit` is the buyer's private
 * maximum — engine-only, like `reservations`.
 */
export interface DemandBid {
  buyerId: string;
  summary: string;
  hours: number;
  week: number;
  complexity: Complexity;
  rate: number;
  limit: number;
}

export const REFERENCE_ASK = 150;

export const capacityDemand: Record<string, DemandBid[]> = {
  finance: [
    { buyerId: 'northbridge', summary: 'LBO model refresh for a portfolio company', hours: 8, week: 0, complexity: 'complex', rate: 140, limit: 150 },
    { buyerId: 'halden', summary: 'Valuation cross-check before investment committee', hours: 6, week: 0, complexity: 'complex', rate: 160, limit: 170 },
    { buyerId: 'nova', summary: 'Series B operating model support', hours: 10, week: 0, complexity: 'standard', rate: 125, limit: 128 },
    { buyerId: 'kite', summary: 'Quarterly reforecast with Q3 actuals', hours: 4, week: 1, complexity: 'light', rate: 150, limit: 155 },
    { buyerId: 'lumen', summary: 'Board-pack model clean-up', hours: 5, week: 1, complexity: 'light', rate: 135, limit: 142 },
  ],
};

export const seedPeople: Record<string, Person> = Object.fromEntries(counterparties.map((p) => [p.id, p]));
export const seedCards = cards;
export const seedReservations = reservations;

export const initialState: AppState = {
  account: null,
  signedIn: false,
  themeMode: 'light',
  notificationPref: 'live',
  speakReplies: true,
  paymentMethods: [],
  people: seedPeople,
  cards,
  reservations,
  privateLimits: {},
  negotiations: {},
  bookings: [],
  passedCardIds: [],
  categories,
  permissions: [
    { key: 'location', label: 'Location', sublabel: 'Approximate until an agreement', enabled: true },
    { key: 'calendar', label: 'Calendar', sublabel: 'Free/busy only', enabled: true },
    { key: 'negotiate', label: 'Negotiate', sublabel: 'Never beyond my private limit', enabled: true },
    { key: 'autobook', label: 'Agree automatically', sublabel: 'Ask me every time', enabled: false },
    { key: 'curate', label: 'Curate my exchange', sublabel: 'Personalized ranking only', enabled: true },
  ],
};
