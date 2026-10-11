import { describe, expect, it } from 'vitest';
import { interpret, missingFields, parseBudget, parseTiming, type MandateDraft, type VoiceContext } from '@/domain/semantic';

const none = { kind: 'none' } as const;

function mandate(text: string): MandateDraft {
  const r = interpret(text, none);
  if (r.type !== 'mandate') throw new Error(`Expected a mandate for "${text}", got ${r.type}`);
  return r.draft;
}

describe('semantic interpretation — documented scenarios', () => {
  it('turns an ambiguous acquisition sentence into a diligence need with gaps flagged', () => {
    const d = mandate("We're looking at buying a competitor, and I need someone to make sure the numbers actually make sense before we go ahead.");
    expect(d).toMatchObject({ mode: 'need', objective: 'Potential acquisition', likelyNeed: 'Financial due diligence', category: 'ma-advisory' });
    expect(d.related).toEqual(['Valuation', 'Financial analysis', 'Transaction advisory']);
    expect(missingFields(d)).toEqual(['timing', 'budget']);
  });

  it('applies a follow-up to the draft in context', () => {
    const d = mandate("We're looking at buying a competitor and need someone to check the numbers");
    const r = interpret('Yes, but we need it within three weeks.', { kind: 'draft', draft: d });
    expect(r).toMatchObject({ type: 'mandate-update', changed: ['timing'], draft: { timingLabel: 'Within 3 weeks', timingHours: 504 } });
  });

  it('confirms with a plain yes and accepts a correction', () => {
    const d = mandate('We need financial due diligence on an acquisition');
    expect(interpret('yes, go ahead', { kind: 'draft', draft: d })).toEqual({ type: 'confirm' });
    const corrected = interpret("No, it's more about valuation", { kind: 'draft', draft: d });
    expect(corrected).toMatchObject({ type: 'mandate-update', draft: { likelyNeed: 'Valuation', category: 'finance' } });
  });

  it.each([
    ["We're raising a Series A and need a financial model", 'finance', 'Financial model'],
    ['How big is the UK market for clinic-scheduling software?', 'strategy', 'Market research and sizing'],
    ['I need tax advice on structuring an acquisition before we sign', 'tax', 'Tax structuring advice'],
    ['We need a part-time CFO for six months', 'advisory', 'Fractional CFO'],
    ['Can someone value the business before we talk to investors?', 'finance', 'Valuation'],
  ])('"%s" → %s', (text, category, likelyNeed) => {
    expect(mandate(text)).toMatchObject({ mode: 'need', category, likelyNeed });
  });

  it('classifies released capacity as an offer, with rate and hours', () => {
    const d = mandate('I have 10 hours next week for financial modeling at about £150 an hour');
    expect(d).toMatchObject({ mode: 'offer', category: 'finance', hours: 10, budget: 150, unit: 'hour', timingLabel: 'Next week' });
  });

  it('asks rather than guessing when nothing matches', () => {
    expect(interpret('The weather is nice today', none).type).toBe('clarify');
  });
});

describe('negotiation by voice', () => {
  const ctx = { kind: 'negotiation', negotiationId: 'n1', role: 'buyer', listedDeadline: 'Thu' } as const;

  it('reads a conditional offer as a structured proposal', () => {
    expect(interpret('I could go to £5,200 if they deliver Wednesday', ctx)).toEqual({
      type: 'negotiation',
      action: 'propose',
      change: { price: 5200, deadline: 'plus3' },
    });
  });

  it('understands scope and payment trade-offs', () => {
    expect(interpret('Offer 4,900 with one revision round and a 50% deposit', ctx)).toMatchObject({
      action: 'propose',
      change: { price: 4900, scope: 'one-revision', payment: 'deposit' },
    });
  });

  it.each([
    ['Accept their terms', 'accept'],
    ['Hold at my current bid', 'hold'],
    ["Let's walk away", 'stop'],
    ["What's the difference now?", 'status'],
  ])('"%s" → %s', (text, action) => {
    expect(interpret(text, ctx)).toMatchObject({ type: 'negotiation', action });
  });
});

describe('other contexts', () => {
  it('answers the seller’s allocation questions by intent', () => {
    const bids: VoiceContext = { kind: 'bids', offerId: 'o1', names: ['Northbridge Partners', 'Halden Capital', 'Kite Labs'] };
    expect(interpret('Which of these proposals is best for me?', bids)).toEqual({ type: 'bids', action: 'best' });
    expect(interpret('Can I take on two of them?', bids)).toEqual({ type: 'bids', action: 'pairs' });
    expect(interpret('What happens if I accept Northbridge?', bids)).toEqual({ type: 'bids', action: 'what-if', name: 'Northbridge Partners' });
    expect(interpret('Which option leaves me the most flexibility?', bids)).toEqual({ type: 'bids', action: 'flexible' });
    expect(interpret('Accept Kite', bids)).toEqual({ type: 'bids', action: 'accept', name: 'Kite Labs' });
    expect(interpret('What happens if I accept Acme?', bids).type).not.toBe('bids');
  });

  it('adjusts capacity, confirms delivery, takes feedback, explores adjacent services', () => {
    expect(interpret('I only have 6 hours now', none)).toEqual({ type: 'capacity', hours: 6 });
    expect(interpret("The work's delivered", { kind: 'booking', bookingId: 'b', role: 'seller', status: 'paid' })).toEqual({ type: 'delivery' });
    expect(interpret("Yes, I'd work with them again", { kind: 'booking', bookingId: 'b', role: 'buyer', status: 'complete' })).toEqual({ type: 'feedback', recommends: true });
    expect(interpret('No', { kind: 'booking', bookingId: 'b', role: 'buyer', status: 'complete' })).toEqual({ type: 'feedback', recommends: false });
    expect(interpret('What else might I need?', { kind: 'booking', bookingId: 'b', role: 'buyer', status: 'complete' })).toEqual({ type: 'adjacent' });
  });
});

describe('parsers', () => {
  it.each([
    ['within three weeks', 'Within 3 weeks'],
    ['in 10 days', 'Within 10 days'],
    ['asap please', 'As soon as possible'],
    ['by Friday', 'By Friday'],
  ])('timing "%s"', (text, label) => expect(parseTiming(text)?.label).toBe(label));

  it.each([
    ['budget is around £8k', 8000, 'fixed'],
    ['up to 12,000 pounds', 12000, 'fixed'],
    ['about £150 an hour', 150, 'hour'],
  ])('budget "%s"', (text, amount, unit) => expect(parseBudget(text)).toEqual({ amount, unit }));
});
