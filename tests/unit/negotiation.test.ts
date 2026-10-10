import { describe, expect, it } from 'vitest';
import {
  acceptStanding,
  createNegotiation,
  describeEvent,
  expireIfDue,
  latestBy,
  respond,
  submitProposal,
  suggestOptions,
  validateProposal,
  viewFor,
  type EngineCtx,
} from '@/domain/negotiation';
import { LISTED_TERMS, termMultiplier } from '@/domain/terms';
import type { Negotiation, Terms } from '@/domain/types';

let clock = Date.parse('2026-10-10T09:00:00Z');
let seq = 0;
const ctx = (): EngineCtx => ({ now: new Date((clock += 60_000)).toISOString(), newId: (p) => `${p}${++seq}` });

const ASK = 6000;
const SELLER_MIN = 5000;

/** Buyer "you" negotiating on Alex's listing at £6,000. */
function fresh(): Negotiation {
  return createNegotiation(
    {
      listing: { kind: 'offer', ownerId: 'alex', title: 'Series A model', category: 'finance', unit: 'fixed', timingLabel: 'Thu Oct 15', cardId: 'c1' },
      buyerId: 'you',
      sellerId: 'alex',
      initiatorId: 'you',
      listingTerms: { price: ASK, ...LISTED_TERMS },
      compared: 3,
      rank: 1,
    },
    ctx()
  );
}

const terms = (price: number, patch: Partial<Terms> = {}): Terms => ({ ...LISTED_TERMS, price, ...patch });

/** Buyer proposes; seller answers with its private minimum. */
function round(n: Negotiation, t: Terms, min = SELLER_MIN): Negotiation {
  expect(validateProposal(n, 'buyer', t, 99999)).toBeNull();
  return respond(submitProposal(n, 'buyer', t, ctx()), 'seller', min, true, ctx());
}

describe('negotiation state machine', () => {
  it('starts from the public ask and records the evaluation', () => {
    const n = fresh();
    expect(n.status).toBe('evaluating');
    expect(n.proposals[0]).toMatchObject({ by: 'seller', kind: 'ask', source: 'listing', terms: { price: ASK } });
    expect(n.events[0]).toMatchObject({ type: 'evaluated', compared: 3, rank: 1 });
  });

  it('gives every proposal a unique id and complete terms', () => {
    const n = round(round(fresh(), terms(5000)), terms(5200, { deadline: 'plus3' }));
    const ids = n.proposals.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of n.proposals) expect(Object.keys(p.terms).sort()).toEqual(['deadline', 'payment', 'price', 'scope', 'volume']);
  });

  it('holds its position on an unchanged-terms opening instead of conceding', () => {
    const n = round(fresh(), terms(5000));
    expect(n.status).toBe('countered');
    expect(latestBy(n, 'seller')!.terms.price).toBe(ASK);
    expect(n.events.at(-1)!.type).toBe('held');
  });

  it('refuses repeated or backward proposals — clicking again concedes nothing', () => {
    const n = round(fresh(), terms(5000));
    expect(validateProposal(n, 'buyer', terms(5000), 99999)).toBe('duplicate');
    expect(validateProposal(n, 'buyer', terms(4900), 99999)).toBe('regressive');
    expect(validateProposal(n, 'buyer', terms(ASK), 99999)).toBe('acceptable');
    const awaiting = submitProposal(n, 'buyer', terms(5100), ctx());
    expect(validateProposal(awaiting, 'buyer', terms(5150), 99999)).toBe('pending');
  });

  it('trades price for a later deadline without crossing the private minimum', () => {
    const n = round(round(fresh(), terms(5000)), terms(5200, { deadline: 'plus3' }));
    const counter = latestBy(n, 'seller')!;
    expect(counter.kind).toBe('counter');
    expect(counter.terms.deadline).toBe('plus3');
    expect(counter.terms.price).toBeLessThan(ASK);
    expect(counter.terms.price).toBeGreaterThanOrEqual(SELLER_MIN * termMultiplier(counter.terms));
  });

  it('never counters below the minimum, whatever the buyer tries', () => {
    const scripts: Terms[][] = [
      [terms(4800), terms(5000, { deadline: 'plus3' }), terms(4700, { deadline: 'plus7' }), terms(4500, { deadline: 'plus7', scope: 'core' })],
      [terms(5500), terms(5600), terms(5700)],
      [terms(4000, { payment: 'upfront' }), terms(4300, { payment: 'upfront' }), terms(4400, { payment: 'upfront', scope: 'one-revision' })],
    ];
    for (const script of scripts) {
      let n = fresh();
      for (const t of script) {
        if (validateProposal(n, 'buyer', t, 99999)) break;
        n = respond(submitProposal(n, 'buyer', t, ctx()), 'seller', SELLER_MIN, true, ctx());
        for (const p of n.proposals.filter((x) => x.by === 'seller' && x.kind === 'counter')) {
          expect(p.terms.price).toBeGreaterThanOrEqual(SELLER_MIN * termMultiplier(p.terms));
        }
        if (n.status !== 'countered') break;
      }
    }
  });

  it('rejects a lowball outright — negotiations can fail', () => {
    const n = round(fresh(), terms(3000));
    expect(n.status).toBe('rejected');
    expect(n.events.at(-1)).toMatchObject({ type: 'rejected', reason: 'too-far' });
  });

  it('caps the rounds with a final offer, then rejects anything short of it', () => {
    let n = fresh();
    const script = [terms(4800), terms(4900), terms(4950), terms(5000)];
    for (const t of script) {
      if (n.status !== 'evaluating' && n.status !== 'countered') break;
      n = respond(submitProposal(n, 'buyer', t, ctx()), 'seller', 5600, true, ctx());
    }
    expect(n.proposals.some((p) => p.final)).toBe(true);
    expect(n.status).toBe('rejected');
  });

  it('accepts a proposal that meets the current target', () => {
    const n = round(fresh(), terms(ASK - 100, { deadline: 'plus7' }));
    expect(n.status).toBe('accepted');
    expect(n.agreedProposalId).toBe(latestBy(n, 'buyer')!.id);
  });

  it('lets the buyer approve the standing counter', () => {
    const n = acceptStanding(round(fresh(), terms(5000)), 'buyer', ctx());
    expect(n.status).toBe('accepted');
    expect(n.proposals.find((p) => p.id === n.agreedProposalId)!.terms.price).toBe(ASK);
  });

  it('expires a standing counter after its response window', () => {
    const n = round(fresh(), terms(5000));
    expect(expireIfDue(n, { now: '2026-10-10T10:00:00Z', newId: () => 'x' }).status).toBe('countered');
    expect(expireIfDue(n, { now: '2026-10-20T10:00:00Z', newId: () => 'x' }).status).toBe('expired');
  });

  it('respects the proposer’s own private limit unless explicitly raised', () => {
    const n = round(fresh(), terms(5000));
    expect(validateProposal(n, 'buyer', terms(5300, { deadline: 'plus3' }), 5200)).toBe('over-limit');
    expect(validateProposal(n, 'buyer', terms(5300, { deadline: 'plus3' }), 5200, { allowOverLimit: true })).toBeNull();
  });
});

describe('trade-offs', () => {
  it('lists the confirmed counter plus distinct agent proposals', () => {
    const n = round(fresh(), terms(5000));
    const options = suggestOptions(n, 'buyer', 5600);
    expect(options[0]).toMatchObject({ confirmed: true, terms: { price: ASK } });
    const proposals = options.slice(1);
    expect(proposals.length).toBeGreaterThan(0);
    for (const o of proposals) {
      expect(o.confirmed).toBe(false);
      expect(o.terms.price).toBeLessThan(ASK);
      expect(o.changes.length).toBeGreaterThan(0);
    }
    expect(new Set(options.map((o) => o.id)).size).toBe(options.length);
  });

  it('never uses the counterparty’s private limit (options are the same whatever it is)', () => {
    const a = round(fresh(), terms(5000), 4200);
    const b = round(fresh(), terms(5000), 5800);
    const strip = (n: Negotiation) => suggestOptions(n, 'buyer', 5600).map((o) => o.terms);
    expect(strip(a)).toEqual(strip(b));
  });

  it('caps agent proposals at the viewer’s own limit', () => {
    const n = round(fresh(), terms(5000));
    for (const o of suggestOptions(n, 'buyer', 5100).slice(1)) expect(o.terms.price).toBeLessThanOrEqual(5100);
  });
});

describe('shared record', () => {
  it('gives buyer and seller consistent views of the same terms', () => {
    const n = round(round(fresh(), terms(5000)), terms(5200, { deadline: 'plus3' }));
    const buyer = viewFor(n, 'you');
    const seller = viewFor(n, 'alex');
    expect(buyer.mine).toEqual(seller.theirs);
    expect(buyer.theirs).toEqual(seller.mine);
    expect(buyer.spread).toBe(seller.spread);
  });

  it('never stores private limits in the record', () => {
    const odd = 5137;
    const n = round(round(fresh(), terms(4100)), terms(4400, { deadline: 'plus7' }), odd);
    expect(JSON.stringify(n)).not.toContain(String(odd));
  });

  it('phrases events from each party’s side', () => {
    const n = round(fresh(), terms(5000));
    const submitted = n.events.find((e) => e.type === 'proposal_submitted')!;
    const nameOf = (id: string) => (id === 'you' ? 'Jordan Lee' : 'Alex Chen');
    expect(describeEvent(submitted, 'you', nameOf)).toBe('You proposed £5,000');
    expect(describeEvent(submitted, 'alex', nameOf)).toBe('Jordan Lee proposed £5,000');
  });
});
