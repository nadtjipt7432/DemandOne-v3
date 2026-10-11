import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { computeFit, windowsFit } from '@/domain/matching';
import { formatMoney } from '@/domain/money';
import { isTerminal, latestBy } from '@/domain/negotiation';
import { UNIT_LABEL } from '@/domain/terms';
import { keepWatching, setOfferCapacity } from '@/services/market';
import { allocationView, approveAllocation, authorizeAllocation, planOutcome } from '@/services/allocation';
import { agreedTotal } from '@/services/transactions';
import { useAppState, useViewer } from '@/state/hooks';
import { AmbientField } from '@/ui/Ambient';
import { CapacityPlan, StrategyCard } from '@/ui/allocation';
import { Button, Page, Row, Section, Stack, T, Tap, TopBar } from '@/ui/core';
import { evidenceLine, MarketRow, MarketState, Price, SideLabel, type MarketStateKind } from '@/ui/market';
import { VoicePanel } from '@/ui/VoicePanel';
import { colors, space } from '@/theme';
import type { StrategyKey } from '@/domain/allocation';
import type { AppState, Need, Negotiation, Offer } from '@/domain/types';

const COMPLEXITY_LABEL = { light: 'Light scope', standard: 'Standard scope', complex: 'Complex scope' } as const;

/** "Week of 12 Oct" for each released week, from when the capacity was released. */
function weekLabels(offer: Offer): string[] {
  const start = new Date(offer.createdAt);
  const monday = new Date(start);
  monday.setDate(start.getDate() + ((8 - start.getDay()) % 7 || 7));
  return (offer.weeklyHours ?? [offer.capacityHours ?? 0]).map((_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i * 7);
    return `Week of ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
  });
}

function bidState(n: Negotiation): MarketStateKind {
  if (n.bookingId) return 'agreed';
  if (n.status === 'expired' || n.status === 'withdrawn' || n.status === 'rejected') return 'expired';
  return 'negotiating';
}

/* -------------------------------------------------------------- seller */

function OfferAllocation({ offer }: { offer: Offer }) {
  const router = useRouter();
  const s = useAppState();
  const v = useMemo(() => allocationView(s, offer), [s, offer]);
  const [selected, setSelected] = useState<StrategyKey | undefined>(undefined);
  const [busy, setBusy] = useState<'authorize' | 'approve' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showProposals, setShowProposals] = useState(false);
  const labels = weekLabels(offer);
  const plan = offer.allocation;
  const chosen = v.strategies.find((x) => x.key === (selected ?? v.recommended?.key));
  const preview = !plan && chosen ? chosen.perWeek : undefined;
  const requested = v.proposals.filter((n) => n.request).reduce((a, n) => a + n.request!.hours, 0);
  const open = v.proposals.filter((n) => !isTerminal(n) && !n.bookingId);
  const planNegs = plan ? plan.negotiationIds.map((id) => s.negotiations[id]).filter(Boolean) : [];
  const agreed = planNegs.filter((n) => planOutcome(n) === 'agreed' || planOutcome(n) === 'committed');
  const agreedValue = agreed.reduce((a, n) => a + agreedTotal(n.proposals.find((p) => p.id === n.agreedProposalId)!.terms), 0);
  const name = (n: Negotiation) => s.people[n.buyerId]?.name ?? 'Buyer';

  const summary = (() => {
    if (v.proposals.length === 0) return 'Your capacity is live. Bids will appear here.';
    if (plan?.status === 'negotiating') return 'Your agent is negotiating the selected proposals.';
    if (plan?.status === 'ready') return `${agreed.length} of ${planNegs.length} agreed in principle. Approve to commit the hours.`;
    if (plan?.status === 'committed') return `Allocated. ${v.capacity.committed} hours committed, ${v.capacity.free} still free.`;
    const below = v.belowMinimum.length ? ` ${v.belowMinimum.length === 1 ? 'One is' : `${v.belowMinimum.length} are`} below your minimum.` : '';
    const words = ['no', 'one', 'two', 'three'];
    return `${v.proposals.length} proposals received.${below} DemandOne found ${words[v.strategies.length] ?? v.strategies.length} promising allocation strateg${v.strategies.length === 1 ? 'y' : 'ies'}.`;
  })();

  const authorize = async () => {
    if (!chosen) return;
    setBusy('authorize');
    setError(null);
    const res = await authorizeAllocation(offer.id, chosen.key);
    setBusy(null);
    if (!res.ok) setError(res.reason ?? 'That allocation could not be authorized.');
  };

  const approve = async () => {
    setBusy('approve');
    await approveAllocation(offer.id);
    setBusy(null);
  };

  return (
    <Page
      backdrop={<AmbientField mood={plan?.status === 'committed' ? 'handled' : 'searching'} height={340} breathe={plan?.status === 'negotiating'} />}
      footer={<VoicePanel variant="dock" context={{ kind: 'bids', offerId: offer.id }} prompts={['Which of these proposals is best for me?', 'Can I take on two of them?', 'What happens if I accept Northbridge?', 'Which option leaves me the most flexibility?']} />}>
      <TopBar onBack={() => router.back()} />
      <SideLabel kind="offer" detail="Your released capacity" />
      <T v="small" color={colors.inkDim} style={{ marginTop: space.xs }}>{`${offer.title}, ${formatMoney(offer.price)} ${UNIT_LABEL[offer.unit]}`}</T>
      <View testID="allocation-summary" accessibilityLabel={summary} style={{ marginTop: space.sm }}>
        <T v="display">{summary.split('. ')[0].replace(/\.$/, '') + '.'}</T>
        {summary.split('. ').length > 1 ? <T v="body" color={colors.inkDim} style={{ marginTop: space.xs }}>{summary.split('. ').slice(1).join('. ')}</T> : null}
      </View>

      <Row gap={space.xl} style={{ marginTop: space.lg, flexWrap: 'wrap' }}>
        <View><T v="label" color={colors.inkDim}>Released</T><T v="price">{`${v.capacity.released} h`}</T></View>
        <View><T v="label" color={colors.inkDim}>Proposals</T><T v="price">{String(v.proposals.length)}</T></View>
        <View><T v="label" color={colors.inkDim}>Hours asked for</T><T v="price">{`${requested} h`}</T></View>
        {v.compatibleOpportunities > 0 ? <View><T v="label" color={colors.inkDim}>Other open needs</T><T v="price">{String(v.compatibleOpportunities)}</T></View> : null}
      </Row>

      {/* Capacity: the scarce thing being allocated */}
      <View style={{ marginTop: space.xl, padding: space.lg, borderRadius: 14, backgroundColor: colors.raised, borderWidth: 1, borderColor: colors.rule, gap: space.md }}>
        <Row justify="space-between">
          <T v="bodyStrong">{preview ? `Your hours, with “${chosen!.title.toLowerCase()}” previewed` : 'Your hours'}</T>
          {!plan ? (
            <Row gap={space.xs}>
              <Button size="sm" kind="quiet" title="−" label="Release fewer hours" disabled={v.capacity.free <= 0} onPress={() => setOfferCapacity(offer.id, (offer.capacityHours ?? 0) - (offer.weeklyHours?.length ?? 1))} />
              <Button size="sm" kind="quiet" title="+" label="Release more hours" onPress={() => setOfferCapacity(offer.id, (offer.capacityHours ?? 0) + (offer.weeklyHours?.length ?? 1))} />
            </Row>
          ) : null}
        </Row>
        <CapacityPlan capacity={v.capacity} preview={preview} weekLabels={labels} />
        {preview ? <T v="small" color={colors.inkFaint}>Previewed hours aren’t reserved until you authorize, and aren’t committed until you approve.</T> : null}
      </View>

      {/* Strategies (layer 2) */}
      {!plan && v.strategies.length > 0 ? (
        <Section title="Recommended allocations" note="Every combination that fits your hours was weighed on earnings, rate, scope, schedule, trust and your standard of value.">
          <Stack gap={space.md} style={{ marginTop: space.sm }}>
            {[...v.strategies].sort((a, b) => (a === v.recommended ? -1 : b === v.recommended ? 1 : 0)).map((st) => (
              <StrategyCard key={st.key} strategy={st} recommended={st === v.recommended} selected={chosen?.key === st.key} onSelect={() => setSelected(st.key)} />
            ))}
          </Stack>
          {chosen ? (
            <View style={{ marginTop: space.lg, padding: space.lg, borderRadius: 14, backgroundColor: colors.ink, gap: space.sm }}>
              <T v="bodyStrong" color={colors.bg}>{`Authorize “${chosen.title.toLowerCase()}”`}</T>
              <T v="small" color={colors.sunk}>{`Your agent reserves ${chosen.hours} hours and negotiates ${chosen.picks.map((c) => c.name.split(' ')[0]).join(', ')} toward your ${formatMoney(offer.price)}/hr ask — never below your private minimum of ${formatMoney(v.floor)}/hr. Nothing is committed until you approve the outcomes.`}</T>
              {error ? <T v="small" color={colors.amber}>{error}</T> : null}
              <Button kind="inverse" title="Authorize negotiation" onPress={authorize} loading={busy === 'authorize'} />
            </View>
          ) : null}
        </Section>
      ) : null}
      {!plan && v.proposals.length > 0 && v.strategies.length === 0 ? <T v="body" color={colors.inkDim} style={{ marginTop: space.xl }}>No combination of the open proposals fits your free hours at or above your minimum.</T> : null}

      {/* Plan outcomes */}
      {plan ? (
        <Section title={plan.status === 'committed' ? 'Allocated' : plan.status === 'ready' ? 'Ready for your approval' : 'Negotiating'} ruled>
          {planNegs.map((n) => {
            const outcome = planOutcome(n);
            const agreedTerms = n.proposals.find((p) => p.id === n.agreedProposalId)?.terms;
            const theirs = latestBy(n, 'buyer')!;
            return (
              <Tap key={n.id} label={`${name(n)}: ${outcome}`} onPress={() => (n.bookingId ? router.push({ pathname: '/handled/[id]', params: { id: n.bookingId } }) : router.push({ pathname: '/negotiation/[id]', params: { id: n.id } }))}>
                <Row justify="space-between" align="flex-start" style={{ paddingVertical: space.md, borderBottomWidth: 1, borderColor: colors.rule }} testID="plan-row">
                  <View style={{ flex: 1 }}>
                    <T v="bodyStrong">{name(n)}</T>
                    <T v="small" color={colors.inkDim}>{`${n.request!.hours} h, ${n.request!.summary}`}</T>
                    <T v="small" color={outcome === 'fell-through' ? colors.rust : outcome === 'working' ? colors.amberText : colors.forest}>
                      {outcome === 'committed' ? 'Committed' : outcome === 'agreed' ? (agreedTerms!.price > n.proposals[1].terms.price ? `Agreed at ${formatMoney(agreedTerms!.price)}/hr, up from their ${formatMoney(n.proposals[1].terms.price)} bid` : `Agreed at their bid, ${formatMoney(agreedTerms!.price)}/hr`) : outcome === 'working' ? 'Your agent is negotiating…' : `Didn’t agree: their best was ${formatMoney(theirs.terms.price)}/hr`}
                    </T>
                  </View>
                  {agreedTerms ? <T v="price">{formatMoney(agreedTotal(agreedTerms))}</T> : null}
                </Row>
              </Tap>
            );
          })}
          {plan.status === 'ready' ? (
            <View style={{ marginTop: space.lg, gap: space.sm }}>
              <Row justify="space-between"><T v="body" color={colors.inkDim}>Agreed value</T><T v="price">{formatMoney(agreedValue)}</T></Row>
              <Button title={`Approve ${agreed.length} transaction${agreed.length === 1 ? '' : 's'}`} onPress={approve} loading={busy === 'approve'} disabled={agreed.length === 0} />
              <T v="small" color={colors.inkFaint}>Approving commits the hours and creates the transactions. Proposals that no longer fit are declined for you.</T>
            </View>
          ) : null}
        </Section>
      ) : null}

      {/* Proposal details (layer 3) */}
      {v.proposals.length > 0 ? (
        <View style={{ marginTop: space.xxl }}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: showProposals }} accessibilityLabel={`All ${v.proposals.length} proposals`} onPress={() => setShowProposals((x) => !x)} style={{ paddingVertical: space.md, borderTopWidth: 1, borderColor: colors.ruleStrong }}>
            <Row justify="space-between">
              <T v="heading">{`All ${v.proposals.length} proposals`}</T>
              <T v="small" color={colors.inkDim}>{showProposals ? 'Hide' : `${open.length} open`}</T>
            </Row>
          </Pressable>
          {showProposals
            ? v.proposals.map((n) => {
                const bid = latestBy(n, 'buyer')!;
                const below = v.belowMinimum.includes(n);
                const buyer = s.people[n.buyerId];
                return (
                  <Tap key={n.id} label={`Proposal from ${name(n)}`} onPress={() => router.push({ pathname: '/negotiation/[id]', params: { id: n.id } })}>
                    <View testID="proposal-row" style={{ paddingVertical: space.md, borderBottomWidth: 1, borderColor: colors.rule, gap: 3 }}>
                      <Row justify="space-between">
                        <T v="bodyStrong">{name(n)}</T>
                        <MarketState state={bidState(n)} label={below && !isTerminal(n) ? 'Below your minimum' : undefined} />
                      </Row>
                      <Row justify="space-between" align="flex-start" gap={space.md}>
                        <T v="small" color={colors.inkDim} style={{ flex: 1 }}>{n.request ? `${n.request.summary}. ${n.request.hours} h, ${labels[n.request.week]?.toLowerCase() ?? 'flexible'}, ${COMPLEXITY_LABEL[n.request.complexity].toLowerCase()}.` : ''}</T>
                        <View style={{ alignItems: 'flex-end' }}>
                          <T v="price">{`${formatMoney(bid.terms.price)}/hr`}</T>
                          {n.request ? <T v="label" color={colors.inkFaint}>{`${formatMoney(bid.terms.price * n.request.hours)} total`}</T> : null}
                        </View>
                      </Row>
                      <T v="small" color={colors.inkFaint}>{buyer ? evidenceLine(buyer) : ''}</T>
                    </View>
                  </Tap>
                );
              })
            : null}
        </View>
      ) : null}
    </Page>
  );
}

/* --------------------------------------------------------------- buyer */

function NeedView({ need, s }: { need: Need; s: AppState }) {
  const router = useRouter();
  const viewer = useViewer();
  const providers = useMemo(
    () =>
      s.cards
        .filter((c) => c.kind === 'offer' && c.category === need.category && windowsFit(need.window, c.window) && !s.passedCardIds.includes(c.id))
        .map((c) => ({ card: c, fit: computeFit(c, viewer, s.people[c.personId], need.priorities.length ? need.priorities : undefined) }))
        .sort((a, b) => b.fit.score - a.fit.score)
        .slice(0, 3),
    [need, s.cards, s.passedCardIds, s.people, viewer]
  );
  const negotiations = Object.values(s.negotiations).filter((n) => n.buyerId === viewer.id && n.listing.category === need.category);
  const labelOf = (cid: string) => s.categories.find((c) => c.id === cid)?.label ?? cid;
  return (
    <Page backdrop={<AmbientField mood="searching" height={300} />}>
      <TopBar onBack={() => router.back()} />
      <SideLabel kind="need" detail={labelOf(need.category)} />
      <T v="display" style={{ marginTop: space.sm }}>{need.title}</T>
      <Row justify="space-between" align="flex-end" style={{ marginTop: space.lg }}>
        <Price amount={need.budgetMax} align="left" caption={`your private maximum, ${UNIT_LABEL[need.unit]}`} large />
        <T v="small" color={colors.inkDim}>{need.timing.deadlineLabel ?? need.window.label}</T>
      </Row>
      {negotiations.length > 0 ? (
        <Section title="Negotiating" ruled>
          {negotiations.map((n) => {
            const theirs = latestBy(n, 'seller');
            return (
              <Tap key={n.id} label={`Negotiation with ${s.people[n.sellerId]?.name}`} onPress={() => router.push({ pathname: '/negotiation/[id]', params: { id: n.id } })}>
                <Row justify="space-between" style={{ paddingVertical: space.md, borderBottomWidth: 1, borderColor: colors.rule }}>
                  <View>
                    <T v="bodyStrong">{s.people[n.sellerId]?.name}</T>
                    <MarketState state={isTerminal(n) ? (n.status === 'cleared' ? 'cleared' : n.status === 'accepted' ? 'agreed' : 'expired') : 'negotiating'} />
                  </View>
                  {theirs ? <T v="price">{formatMoney(theirs.terms.price)}</T> : null}
                </Row>
              </Tap>
            );
          })}
        </Section>
      ) : null}
      <Section title={providers.length ? 'Who could fill it' : 'Nothing fits yet'} note={providers.length ? 'Ranked by your standard of value. Only positions that fit your dates are shown.' : 'No open offer matches your dates right now.'} ruled={providers.length > 0}>
        {providers.map(({ card }) => (
          <MarketRow
            key={card.id}
            card={card}
            person={s.people[card.personId]}
            categoryLabel={labelOf(card.category)}
            state={card.negotiable ? 'Open' : 'Fixed price'}
            onOpen={() => router.push({ pathname: '/listing/[id]', params: { id: card.id } })}
            onAction={() => router.push({ pathname: '/listing/[id]', params: { id: card.id, act: 'negotiate' } })}
          />
        ))}
        {providers.length === 0 ? (
          <Button kind="secondary" title={need.howLong === 'watching' ? 'Watching the market' : 'Keep watching for me'} disabled={need.howLong === 'watching'} onPress={() => keepWatching('need', need.id)} style={{ marginTop: space.md, alignSelf: 'flex-start' }} />
        ) : null}
      </Section>
    </Page>
  );
}

/** One of the viewer's own positions: who could fill it (need), or how to allocate it (offer). */
export default function Position() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useAppState();
  const viewer = useViewer();
  const need = viewer.needs.find((n) => n.id === id);
  const offer = viewer.offers.find((o) => o.id === id);
  if (offer) return <OfferAllocation offer={offer} />;
  if (need) return <NeedView need={need} s={s} />;
  return (
    <Page>
      <TopBar onBack={() => router.back()} />
      <T v="title" style={{ marginTop: space.xl }}>This position isn’t active.</T>
    </Page>
  );
}
