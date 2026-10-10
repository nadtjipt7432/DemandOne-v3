import { nowIso } from '@/infra/clock';
import { speak } from '@/infra/voice';
import { formatMoney } from '@/domain/money';
import { latestBy, otherSide, sideOf, suggestOptions, isTerminal } from '@/domain/negotiation';
import { interpret, missingFields, type Interpretation, type MandateDraft, type VoiceContext } from '@/domain/semantic';
import { describeChanges, priceStep, roundTo, termMultiplier, UNIT_SHORT } from '@/domain/terms';
import { computeFees } from '@/domain/pricing';
import { getState, id } from '@/state/store';
import { ADJACENT_CATEGORIES } from '@/state/myMarket';
import { getVoiceSession, setVoiceSession, type PendingAction } from '@/state/voiceSession';
import { createPosition, setOfferCapacity } from './market';
import { acceptCounter, bidsOnOffer, holdPosition, ownLimit, proposeTerms, stopNegotiation } from './negotiation';
import { confirmCompletion, markDelivered, submitFeedback } from './transactions';
import { viewerOf } from './viewer';
import type { Negotiation, Terms } from '@/domain/types';

/**
 * The voice agent: interprets an utterance in context (domain/semantic.ts), then
 * acts through the same services the buttons use. Material actions — posting a
 * mandate, proposing or approving terms, stopping a negotiation — are staged as a
 * pending action and only run on the user's "yes" (spoken, typed or tapped).
 */

export type ScreenContext =
  | { kind: 'none' }
  | { kind: 'negotiation'; negotiationId: string }
  | { kind: 'bids'; offerId: string }
  | { kind: 'booking'; bookingId: string };

export interface Route {
  pathname: string;
  params?: Record<string, string>;
}

export interface AgentReply {
  text: string;
  interpretation?: Interpretation;
  navigate?: Route;
}

const nameOf = (personId: string) => getState().people[personId]?.name.split(' ')[0] ?? 'They';

function say(text: string, from: 'user' | 'agent' = 'agent'): void {
  setVoiceSession((s) => ({ ...s, turns: [...s.turns, { id: id('vt'), from, text, at: nowIso() }].slice(-30) }));
}

function resolveContext(screen: ScreenContext): VoiceContext {
  const session = getVoiceSession();
  const s = getState();
  const viewerId = s.account?.personId ?? '';
  if (screen.kind === 'negotiation') {
    const n = s.negotiations[screen.negotiationId];
    if (n) return { kind: 'negotiation', negotiationId: n.id, role: sideOf(n, viewerId), listedDeadline: n.listing.timingLabel };
  }
  if (screen.kind === 'bids') return { kind: 'bids', offerId: screen.offerId };
  if (screen.kind === 'booking') {
    const b = s.bookings.find((x) => x.id === screen.bookingId);
    if (b) return { kind: 'booking', bookingId: b.id, role: b.buyerId === viewerId ? 'buyer' : 'seller', status: b.status };
  }
  if (session.draft) return { kind: 'draft', draft: session.draft };
  return { kind: 'none' };
}

const OBJECTIVE_PHRASE: Record<string, string> = {
  'Potential acquisition': "you're considering an acquisition",
  'Investment decision': "you're preparing an investment decision",
  Fundraising: "you're raising money",
  'Understand what the business is worth': 'you want to know what the business is worth',
  'Understand the market': 'you want to understand the market',
  'Tax certainty': 'you want tax certainty',
  'Senior finance leadership': 'you need senior finance leadership',
};

function restate(d: MandateDraft): string {
  if (d.mode === 'offer') {
    const hours = d.hours ? `${d.hours} hours of ` : '';
    const rate = d.budget ? ` at ${formatMoney(d.budget)}${UNIT_SHORT[d.unit ?? 'fixed']}` : '';
    return `You'd like to release ${hours}${d.likelyNeed.toLowerCase()} capacity${rate}${d.timingLabel ? `, ${d.timingLabel.toLowerCase()}` : ''}. Is that right?`;
  }
  const phrase = OBJECTIVE_PHRASE[d.objective] ?? 'you need specialist help';
  return `Sounds like ${phrase} and want ${d.likelyNeed.toLowerCase()} support. Is that right?`;
}

function askFor(field: 'timing' | 'budget', d: MandateDraft): string {
  if (field === 'timing') return d.mode === 'offer' ? 'When is this capacity available?' : 'When do you need it by?';
  return d.mode === 'offer' ? 'What rate are you asking? Your minimum stays private.' : 'What budget should I work within? It stays private.';
}

function nextStep(d: MandateDraft, asked: ('timing' | 'budget')[]): { text: string; stage: 'details' | 'ready'; asked: ('timing' | 'budget')[] } {
  const missing = missingFields(d).filter((f) => !asked.includes(f));
  if (missing.length > 0) return { text: askFor(missing[0], d), stage: 'details', asked: [...asked, missing[0]] };
  return {
    text: d.mode === 'offer' ? 'Shall I release it to the market?' : 'Shall I look for providers?',
    stage: 'ready',
    asked,
  };
}

async function postDraft(d: MandateDraft): Promise<AgentReply> {
  const s = getState();
  const category = s.categories.find((c) => c.id === d.category);
  const price = d.budget ?? category?.typicalPrice ?? 1000;
  const hours = d.timingHours ?? 336;
  const positionId = await createPosition({
    mode: d.mode,
    title: d.mode === 'offer' ? `${d.likelyNeed}${d.hours ? `, ${d.hours} hours` : ''}` : d.likelyNeed,
    description: d.summary,
    category: d.category,
    price,
    unit: d.unit ?? 'fixed',
    capacityHours: d.mode === 'offer' ? d.hours : undefined,
    timing: { type: d.timingLabel ? 'window' : 'flexible', deadlineLabel: d.timingLabel, window: { startHour: 0, endHour: hours, label: d.timingLabel ?? 'Flexible' } },
  });
  setVoiceSession((v) => ({ ...v, draft: undefined, stage: undefined, asked: [], pending: undefined }));
  const after = getState();
  if (d.mode === 'offer') {
    const bids = bidsOnOffer(after, positionId);
    return {
      text: bids.length > 0 ? `Released. ${bids.length === 2 ? 'Two buyers are' : 'A buyer is'} already interested in your capacity.` : "Released. I'll tell you when a buyer bids.",
      navigate: { pathname: '/position/[id]', params: { id: positionId } },
    };
  }
  const providers = after.cards.filter((c) => c.kind === 'offer' && c.category === d.category).length;
  const timing = d.timingLabel ? ` ${d.timingLabel.toLowerCase()}` : '';
  return {
    text: `You're looking for ${d.likelyNeed.toLowerCase()}${timing}. I've identified ${providers === 0 ? 'no' : providers} potentially relevant provider${providers === 1 ? '' : 's'}.`,
    navigate: { pathname: '/position/[id]', params: { id: positionId } },
  };
}

/** Plain-language state of a negotiation, from the viewer's side. */
export function negotiationStatus(n: Negotiation, viewerId: string): string {
  const side = sideOf(n, viewerId);
  const theirs = latestBy(n, otherSide(side));
  const mine = latestBy(n, side);
  const them = nameOf(otherSide(side) === 'buyer' ? n.buyerId : n.sellerId);
  if (n.status === 'awaiting_response') return `Your proposal is with ${them}.`;
  if (n.status === 'accepted' || n.status === 'cleared') return `Agreed at ${formatMoney(latestBy(n, side)?.terms.price ?? 0)}.`;
  if (isTerminal(n)) return `This negotiation has ${n.status === 'withdrawn' ? 'stopped' : n.status}.`;
  if (!theirs) return 'No terms on the table yet.';
  const verb = theirs.source === 'listing' ? (side === 'buyer' ? 'is asking' : 'is bidding') : 'has countered at';
  const changes = describeChanges(theirs.terms, n.proposals[0].terms);
  const head = `${them} ${verb} ${formatMoney(theirs.terms.price)}${changes.length ? ` with ${changes.join(', ')}` : ''}.`;
  if (!mine) return head;
  const diff = Math.abs(theirs.terms.price - mine.terms.price);
  return `${head} Your current ${side === 'buyer' ? 'bid' : 'ask'} is ${formatMoney(mine.terms.price)}. The difference is ${formatMoney(diff)}.`;
}

function buildProposal(n: Negotiation, viewerId: string, change: { price?: number } & Partial<Terms>): Terms | undefined {
  const side = sideOf(n, viewerId);
  const standing = latestBy(n, otherSide(side));
  if (!standing) return undefined;
  const termsOnly = { ...standing.terms, ...change };
  if (change.price !== undefined) return { ...termsOnly, price: change.price };
  const option = suggestOptions(n, side, ownLimit(getState(), n.id)).find(
    (o) => !o.confirmed && o.terms.deadline === termsOnly.deadline && o.terms.scope === termsOnly.scope && o.terms.payment === termsOnly.payment
  );
  if (option) return option.terms;
  const ratio = termMultiplier(termsOnly) / termMultiplier(standing.terms);
  return { ...termsOnly, price: roundTo(standing.terms.price * ratio, priceStep(standing.terms.price), side === 'buyer' ? 'down' : 'up') };
}

async function runPending(p: PendingAction): Promise<AgentReply> {
  setVoiceSession((v) => ({ ...v, pending: undefined }));
  const viewerId = viewerOf(getState()).id;
  if (p.kind === 'post') return postDraft(p.draft);
  if (p.kind === 'stop') {
    await stopNegotiation(p.negotiationId);
    return { text: 'Stopped. Nothing was agreed.' };
  }
  if (p.kind === 'accept') {
    const res = await acceptCounter(p.negotiationId);
    if (!res.ok) return { text: "That can't be approved right now." };
    return { text: 'Agreed. The terms are locked in.', navigate: { pathname: '/handled/[id]', params: { id: res.bookingId! } } };
  }
  const res = await proposeTerms(p.negotiationId, p.terms, { raiseLimit: p.raiseLimit });
  if (!res.ok) return { text: res.issue === 'duplicate' ? "You've already proposed exactly that." : "I couldn't send that proposal." };
  const n = getState().negotiations[p.negotiationId];
  if (n.status === 'accepted') return { text: `${nameOf(sideOf(n, viewerId) === 'buyer' ? n.sellerId : n.buyerId)} accepted ${formatMoney(p.terms.price)}.`, navigate: { pathname: '/handled/[id]', params: { id: n.bookingId! } } };
  if (n.status === 'rejected') return { text: `${nameOf(sideOf(n, viewerId) === 'buyer' ? n.sellerId : n.buyerId)} declined. You can try another counterparty.` };
  return { text: negotiationStatus(n, viewerId) };
}

async function act(i: Interpretation, ctx: VoiceContext): Promise<AgentReply> {
  const s = getState();
  const viewer = viewerOf(s);
  const session = getVoiceSession();

  switch (i.type) {
    case 'clarify':
      return { text: i.question, interpretation: i };

    case 'navigate': {
      const to = { exchange: '/discover', deals: '/matches', home: '/today', profile: '/you' }[i.to];
      return { text: 'Opening it.', navigate: { pathname: to } };
    }

    case 'mandate':
      setVoiceSession((v) => ({ ...v, draft: i.draft, stage: 'interpreting', asked: [], pending: undefined }));
      return { text: restate(i.draft), interpretation: i };

    case 'mandate-update': {
      const step = nextStep(i.draft, session.asked);
      setVoiceSession((v) => ({ ...v, draft: i.draft, stage: step.stage, asked: step.asked, pending: step.stage === 'ready' ? { kind: 'post', draft: i.draft } : undefined }));
      const ack = i.changed.includes('need') ? `Got it — ${i.draft.likelyNeed.toLowerCase()}.` : i.changed.includes('timing') && i.draft.timingLabel ? `Got it — ${i.draft.timingLabel.toLowerCase()}.` : 'Got it.';
      return { text: `${ack} ${step.text}`, interpretation: i };
    }

    case 'confirm': {
      if (session.pending) return runPending(session.pending);
      if (session.draft) {
        const step = nextStep(session.draft, session.stage === 'interpreting' ? [] : session.asked);
        setVoiceSession((v) => ({ ...v, stage: step.stage, asked: step.asked, pending: step.stage === 'ready' ? { kind: 'post', draft: session.draft! } : undefined }));
        return { text: step.text, interpretation: { type: 'mandate', draft: session.draft } };
      }
      return { text: 'There is nothing waiting for a yes right now.' };
    }

    case 'decline':
      setVoiceSession((v) => ({ ...v, pending: undefined }));
      return { text: "Okay, I won't do that." };

    case 'negotiation': {
      if (ctx.kind !== 'negotiation') return { text: 'Open a negotiation first, then tell me what to do.' };
      const n = s.negotiations[ctx.negotiationId];
      if (i.action === 'status') return { text: negotiationStatus(n, viewer.id) };
      if (i.action === 'hold') {
        await holdPosition(n.id);
        const mine = latestBy(n, sideOf(n, viewer.id));
        return { text: mine ? `Holding at ${formatMoney(mine.terms.price)}. Nothing changes unless they move.` : 'Holding.' };
      }
      if (i.action === 'stop') {
        setVoiceSession((v) => ({ ...v, pending: { kind: 'stop', negotiationId: n.id } }));
        return { text: `Stop negotiating with ${nameOf(sideOf(n, viewer.id) === 'buyer' ? n.sellerId : n.buyerId)}?` };
      }
      if (i.action === 'accept') {
        const theirs = latestBy(n, otherSide(sideOf(n, viewer.id)));
        if (!theirs || n.status !== 'countered') return { text: negotiationStatus(n, viewer.id) };
        const fees = computeFees(theirs.terms.price);
        setVoiceSession((v) => ({ ...v, pending: { kind: 'accept', negotiationId: n.id } }));
        const pay = sideOf(n, viewer.id) === 'buyer' ? ` You'd pay ${formatMoney(fees.buyerTotal)} including the fee.` : ` You'd receive ${formatMoney(fees.sellerNet)} after the fee.`;
        return { text: `Approve ${formatMoney(theirs.terms.price)}?${pay}` };
      }
      if (i.action !== 'propose') return { text: negotiationStatus(n, viewer.id) };
      const terms = buildProposal(n, viewer.id, i.change);
      if (!terms) return { text: negotiationStatus(n, viewer.id) };
      const limit = ownLimit(s, n.id);
      const side = sideOf(n, viewer.id);
      const over = limit !== undefined && (side === 'buyer' ? terms.price > limit : terms.price < limit);
      const standing = latestBy(n, otherSide(side))!;
      const changes = describeChanges(terms, standing.terms);
      setVoiceSession((v) => ({ ...v, pending: { kind: 'propose', negotiationId: n.id, terms, raiseLimit: over } }));
      const overNote = over ? ` That's past your private limit of ${formatMoney(limit!)} — saying yes raises it.` : '';
      return { text: `Propose ${formatMoney(terms.price)}${changes.length ? ` with ${changes.join(', ')}` : ''}? They haven't seen this yet.${overNote}` };
    }

    case 'bids': {
      if (ctx.kind !== 'bids') return { text: 'Open one of your offers to compare its bids.' };
      const bids = bidsOnOffer(s, ctx.offerId).filter((b) => b.status === 'countered');
      if (bids.length === 0) return { text: 'There are no open bids on this offer.' };
      const described = bids.map((b) => {
        const bid = latestBy(b, 'buyer')!;
        const engagements = bid.terms.volume === 'recurring' ? 3 : 1;
        return { b, bid, engagements, total: bid.terms.price * engagements, who: nameOf(b.buyerId) };
      });
      if (i.action === 'compare') {
        if (described.length === 1) return { text: `${described[0].who} bids ${formatMoney(described[0].bid.terms.price)}.` };
        const [a, b] = [...described].sort((x, y) => y.total - x.total);
        return {
          text: `Two buyers are interested in your capacity. ${a.who} offers more in total — ${formatMoney(a.bid.terms.price)} across ${a.engagements === 3 ? 'three monthly engagements' : 'one engagement'}. ${b.who} offers ${formatMoney(b.bid.terms.price)} for ${b.engagements === 1 ? 'one engagement, leaving room for another' : 'three engagements'}.`,
        };
      }
      const chosen =
        i.pick === 'recurring'
          ? described.find((d) => d.engagements === 3)
          : i.pick === 'single'
            ? described.find((d) => d.engagements === 1)
            : i.pick === 'higher-total'
              ? [...described].sort((x, y) => y.total - x.total)[0]
              : [...described].sort((x, y) => y.bid.terms.price - x.bid.terms.price)[0];
      if (!chosen) return { text: "I couldn't find that bid." };
      setVoiceSession((v) => ({ ...v, pending: { kind: 'accept', negotiationId: chosen.b.id } }));
      return { text: `Accept ${chosen.who}'s bid of ${formatMoney(chosen.bid.terms.price)}? You'd receive ${formatMoney(computeFees(chosen.bid.terms.price).sellerNet)} after the fee.` };
    }

    case 'capacity': {
      const offer = viewer.offers.find((o) => o.capacityHours !== undefined) ?? viewer.offers[0];
      if (!offer) return { text: "You haven't released any capacity yet. Tell me what you can offer." };
      await setOfferCapacity(offer.id, i.hours);
      return { text: `Updated. ${i.hours} hours are now available on “${offer.title}”.` };
    }

    case 'delivery': {
      if (ctx.kind !== 'booking') return { text: 'Open the transaction first.' };
      if (ctx.role === 'seller' && ctx.status === 'paid') {
        await markDelivered(ctx.bookingId);
        return { text: "Marked as delivered. Payment releases once they confirm." };
      }
      if (ctx.role === 'buyer' && ctx.status === 'delivered') {
        await confirmCompletion(ctx.bookingId);
        return { text: 'Confirmed. Payment is released and the transaction is complete. Would you work with them again?' };
      }
      return { text: ctx.status === 'paid' ? 'The work hasn’t been delivered yet.' : 'There’s nothing to confirm right now.' };
    }

    case 'feedback': {
      if (ctx.kind !== 'booking') return { text: 'Open the transaction to leave feedback.' };
      await submitFeedback(ctx.bookingId, i.recommends);
      return { text: 'Thanks — noted on their record.' };
    }

    case 'adjacent': {
      const booking = ctx.kind === 'booking' ? s.bookings.find((b) => b.id === ctx.bookingId) : s.bookings[0];
      const category = booking?.category ?? viewer.needs[0]?.category;
      const adjacent = (category ? ADJACENT_CATEGORIES[category] ?? [] : []).map((c) => s.categories.find((x) => x.id === c)?.label.toLowerCase()).filter(Boolean);
      if (adjacent.length === 0) return { text: 'Nothing obviously related yet. Tell me what else is on your plate.' };
      return { text: `People in your position often look at ${adjacent.join(' or ')} next.`, navigate: { pathname: '/discover', params: { category: ADJACENT_CATEGORIES[category!][0] } } };
    }
  }
}

/** One turn: record what was said, interpret it in context, act, and answer (spoken if enabled). */
export async function handleUtterance(text: string, screen: ScreenContext = { kind: 'none' }): Promise<AgentReply> {
  say(text, 'user');
  const ctx = resolveContext(screen);
  let interpretation = interpret(text, ctx);
  if (/^\s*(no|nope|cancel|don't)\b/i.test(text) && getVoiceSession().pending && interpretation.type !== 'mandate-update') interpretation = { type: 'decline' };
  const reply = await act(interpretation, ctx);
  say(reply.text);
  if (getState().speakReplies) speak(reply.text);
  return { ...reply, interpretation: reply.interpretation ?? interpretation };
}

/** Run the staged action from a tap rather than a spoken "yes". */
export async function confirmPending(): Promise<AgentReply | undefined> {
  const p = getVoiceSession().pending;
  if (!p) return undefined;
  const reply = await runPending(p);
  say(reply.text);
  if (getState().speakReplies) speak(reply.text);
  return reply;
}

export function cancelPending(): void {
  setVoiceSession((v) => ({ ...v, pending: undefined }));
}
