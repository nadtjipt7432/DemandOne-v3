import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { formatMoney, parseMoney } from '@/domain/money';
import { describeEvent, isTerminal, sideOf, suggestOptions, viewFor, type TradeOption } from '@/domain/negotiation';
import { computeFees } from '@/domain/pricing';
import { deadlineLabel, describeChanges, PAYMENT_LABEL, SCOPE_LABEL, sameTerms, UNIT_SHORT, VOLUME_LABEL } from '@/domain/terms';
import { DEMO_UTTERANCES } from '@/infra/voice';
import { acceptCounter, holdPosition, ownLimit, proposeTerms, RESULT_TEXT, stopNegotiation } from '@/services/negotiation';
import { useAppState, useViewer } from '@/state/hooks';
import { AmbientField } from '@/ui/Ambient';
import { Button, Field, Page, Row, Rule, Section, T, TopBar } from '@/ui/core';
import { MarketState, SpreadStrip, StepHistory, TermSheet, type TermRow } from '@/ui/market';
import { VoicePanel } from '@/ui/VoicePanel';
import { colors, space } from '@/theme';
import type { Negotiation, Proposal, Terms } from '@/domain/types';

function termRows(n: Negotiation, mine: Proposal | undefined, theirs: Proposal | undefined): TermRow[] {
  const unit = UNIT_SHORT[n.listing.unit];
  const f = (p: Proposal | undefined, pick: (t: Terms) => string) => (p ? pick(p.terms) : '—');
  return [
    { label: 'Price', mine: f(mine, (t) => `${formatMoney(t.price)}${unit}`), theirs: f(theirs, (t) => `${formatMoney(t.price)}${unit}`), emphasize: true },
    { label: 'Delivery', mine: f(mine, (t) => deadlineLabel(t.deadline, n.listing.timingLabel)), theirs: f(theirs, (t) => deadlineLabel(t.deadline, n.listing.timingLabel)) },
    { label: 'Scope', mine: f(mine, (t) => SCOPE_LABEL[t.scope]), theirs: f(theirs, (t) => SCOPE_LABEL[t.scope]) },
    { label: 'Payment', mine: f(mine, (t) => PAYMENT_LABEL[t.payment]), theirs: f(theirs, (t) => PAYMENT_LABEL[t.payment]) },
    { label: 'Volume', mine: f(mine, (t) => VOLUME_LABEL[t.volume]), theirs: f(theirs, (t) => VOLUME_LABEL[t.volume]) },
  ];
}

/** The negotiation workspace: what's proposed, why it hasn't cleared, what could change, what you'd authorize. */
export default function NegotiationScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useAppState();
  const viewer = useViewer();
  const n = s.negotiations[id];
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [custom, setCustom] = useState('');
  const [armed, setArmed] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [asCounterparty, setAsCounterparty] = useState(false);

  if (!n) {
    return (
      <Page>
        <TopBar onBack={() => router.back()} />
        <T v="title" style={{ marginTop: space.xl }}>This negotiation isn’t available.</T>
      </Page>
    );
  }

  const side = sideOf(n, viewer.id);
  const view = viewFor(n, viewer.id);
  const them = s.people[view.counterpartyId];
  const firstName = them?.name.split(' ')[0] ?? 'They';
  const limit = ownLimit(s, n.id);
  const options = suggestOptions(n, side, limit);
  const nameOf = (pid: string) => s.people[pid]?.name ?? 'Someone';
  const lastTheirs = [...n.events].reverse().find((e) => e.actorId === view.counterpartyId);
  const terminal = isTerminal(n);
  const myWord = side === 'buyer' ? 'bid' : 'ask';
  const theirWord = side === 'buyer' ? 'ask' : 'bid';

  const headline = (() => {
    if (n.status === 'awaiting_response') return `Your proposal is with ${firstName}.`;
    if (n.status === 'accepted' || n.status === 'cleared') return `Agreed at ${formatMoney(n.proposals.find((p) => p.id === n.agreedProposalId)!.terms.price)}.`;
    if (n.status === 'rejected') return `${firstName} declined.`;
    if (n.status === 'expired') return 'Their offer expired.';
    if (n.status === 'withdrawn') return 'You stopped this negotiation.';
    if (lastTheirs?.type === 'held') return `${firstName} is holding at ${formatMoney(view.theirs!.terms.price)}.`;
    if (view.theirs?.source === 'listing' && !view.mine) return `${firstName} is asking ${formatMoney(view.theirs.terms.price)}.`;
    if (lastTheirs) return `${describeEvent(lastTheirs, viewer.id, (pid) => nameOf(pid).split(' ')[0])}.`;
    return n.listing.title;
  })();

  const why = (() => {
    if (n.status === 'awaiting_response') return `${firstName} is considering your terms.`;
    if (n.status === 'rejected') {
      const reason = [...n.events].reverse().find((e) => e.type === 'rejected')?.reason;
      return reason === 'too-far' ? 'Your terms were too far from anything they would consider. You can look for another counterparty.' : 'Your proposal didn’t meet their final offer.';
    }
    if (n.status === 'expired') return 'Standing offers lapse after 48 hours without a response.';
    if (terminal) return undefined;
    if (!view.mine || !view.theirs) return undefined;
    const gap = Math.abs(view.theirs.terms.price - view.mine.terms.price);
    if (view.isFinal) return `This is ${firstName}’s final offer. Approve it, or change the terms — another price-only proposal on the same terms will be declined.`;
    if (lastTheirs?.type === 'held') return `Your last proposal didn’t move them. Repeating it won’t either — change the delivery, scope or payment, or approve their terms.`;
    return `Your ${myWord} is ${formatMoney(gap)} ${side === 'buyer' ? 'below' : 'above'} their ${theirWord} on these terms.`;
  })();

  const run = async (key: string, fn: () => Promise<{ ok: boolean; issue?: string; bookingId?: string } | void>) => {
    setBusy(key);
    setMessage(null);
    const res = await fn();
    setBusy(null);
    setArmed(null);
    if (res && 'ok' in res && !res.ok && res.issue) setMessage(RESULT_TEXT[res.issue as keyof typeof RESULT_TEXT] ?? 'That didn’t go through.');
    if (res && 'ok' in res && res.ok && res.bookingId) router.replace({ pathname: '/handled/[id]', params: { id: res.bookingId } });
  };

  const propose = (o: TradeOption) => {
    if (!o.withinLimit && armed !== o.id) return setArmed(o.id);
    void run(o.id, () => proposeTerms(n.id, o.terms, { raiseLimit: !o.withinLimit }));
  };

  const proposeCustom = () => {
    const price = parseMoney(custom);
    if (!price || !view.theirs) return setMessage('Enter a price.');
    const over = limit !== undefined && (side === 'buyer' ? price > limit : price < limit);
    if (over && armed !== 'custom') return setArmed('custom');
    void run('custom', () => proposeTerms(n.id, { ...view.theirs!.terms, price }, { raiseLimit: over }));
  };

  const shown = asCounterparty ? viewFor(n, view.counterpartyId) : view;
  const buyerHistory = n.proposals.filter((p) => p.by === 'buyer').map((p) => p.terms.price);
  const sellerHistory = n.proposals.filter((p) => p.by === 'seller').map((p) => p.terms.price);
  const unit = UNIT_SHORT[n.listing.unit];
  const comparable = !!view.mine && !!view.theirs && sameTerms(view.mine.terms, view.theirs.terms);
  const theirFirst = n.proposals.find((p) => p.partyId === view.counterpartyId);
  const theirChanges = view.theirs && theirFirst ? describeChanges(view.theirs.terms, theirFirst.terms) : [];
  const termDiffs = view.mine && view.theirs ? describeChanges(view.theirs.terms, view.mine.terms) : [];
  const confirmed = options.find((o) => o.confirmed);
  const alternatives = options.filter((o) => !o.confirmed);
  const enoughHistory = n.proposals.length >= 5;
  const night = { ink: '#F2EDE2', dim: '#BDB6A6', rule: '#3A3B35', bid: '#8FCFB3', ask: '#E6B06C' };
  const state = n.status === 'cleared' ? 'cleared' : n.status === 'accepted' ? 'agreed' : terminal ? 'expired' : 'negotiating';

  return (
    <Page
      backdrop={<AmbientField mood={n.status === 'accepted' || n.status === 'cleared' ? 'handled' : 'negotiating'} height={460} breathe={n.status === 'awaiting_response'} />}
      footer={!terminal ? <VoicePanel variant="dock" context={{ kind: 'negotiation', negotiationId: n.id }} prompts={[DEMO_UTTERANCES.status, DEMO_UTTERANCES.counter]} /> : undefined}>
      <TopBar onBack={() => router.back()} right={<T v="label" color={colors.inkDim}>{terminal ? '' : `Round ${Math.min(n.responses + 1, n.maxRounds)} of ${n.maxRounds}`}</T>} />
      <T v="label" color={side === 'buyer' ? colors.forest : colors.amberText}>{`${side === 'buyer' ? 'Buying from' : 'Selling to'} ${them?.name ?? 'counterparty'}`}</T>
      <T v="small" color={colors.inkDim} style={{ marginTop: 2 }}>{n.listing.title}</T>
      <T v="display" style={{ marginTop: space.md }} testID="negotiation-headline">{headline}</T>
      {why ? <T v="body" color={colors.inkDim} style={{ marginTop: space.sm }} testID="negotiation-why">{why}</T> : null}

      {/* 1. Current terms — the active negotiation, as one dark market panel */}
      {view.theirs ? (
        <View testID="negotiation-card" style={{ marginTop: space.xl, padding: space.lg, borderRadius: 16, backgroundColor: '#1E201D', gap: space.md }}>
          <Row justify="space-between">
            <T v="label" color={night.dim}>Current terms</T>
            <MarketState state={state} />
          </Row>
          <Row align="flex-end">
            <View style={{ flex: 1 }}>
              <T v="label" color={night.dim}>{`Your ${myWord}`}</T>
              <T v="priceLarge" color={night.bid} testID="my-price">{view.mine ? formatMoney(view.mine.terms.price) : '—'}</T>
            </View>
            <View style={{ flex: 1 }}>
              <T v="label" color={night.dim}>{`Their ${theirWord}`}</T>
              <T v="priceLarge" color={night.ask} testID="their-price">{formatMoney(view.theirs.terms.price)}</T>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <T v="label" color={night.dim}>Gap</T>
              <T v="priceLarge" color={night.ink} testID="spread">{view.spread !== undefined ? formatMoney(view.spread) : '—'}</T>
            </View>
          </Row>
          {comparable && view.mine ? (
            <SpreadStrip
              bid={side === 'buyer' ? view.mine.terms.price : view.theirs.terms.price}
              ask={side === 'buyer' ? view.theirs.terms.price : view.mine.terms.price}
              openingBid={buyerHistory[0]}
              openingAsk={sellerHistory[0]}
            />
          ) : view.mine ? (
            <T v="small" color={night.dim}>{`Not like for like: their ${theirWord} includes ${termDiffs.join(', ')}. Compare the terms below, not just the prices.`}</T>
          ) : null}
          {theirFirst && theirFirst.terms.price !== view.theirs.terms.price ? (
            <Row gap={6} style={{ flexWrap: 'wrap' }}>
              <T v="small" color={night.dim}>{`${theirWord[0].toUpperCase()}${theirWord.slice(1)} revised`}</T>
              <T v="small" color={night.dim} style={{ textDecorationLine: 'line-through' }}>{formatMoney(theirFirst.terms.price)}</T>
              <T v="smallStrong" color={night.ink}>{formatMoney(view.theirs.terms.price)}</T>
              {theirChanges.length ? <T v="small" color={night.ask}>{`for ${theirChanges.join(', ')}`}</T> : null}
            </Row>
          ) : null}
          <View style={{ borderTopWidth: 1, borderColor: night.rule, paddingTop: space.sm, gap: 4 }}>
            {[
              ['Delivery', deadlineLabel(view.theirs.terms.deadline, n.listing.timingLabel)],
              ['Scope', SCOPE_LABEL[view.theirs.terms.scope]],
              ['Payment', PAYMENT_LABEL[view.theirs.terms.payment]],
              ...(view.theirs.terms.hours ? [['Hours', `${view.theirs.terms.hours} h, ${formatMoney(view.theirs.terms.price * view.theirs.terms.hours)} total`]] : []),
            ].map(([k, val]) => (
              <Row key={k} gap={space.md}>
                <T v="small" color={night.dim} style={{ width: 72 }}>{k}</T>
                <T v="small" color={night.ink} style={{ flex: 1 }}>{val}</T>
              </Row>
            ))}
          </View>
        </View>
      ) : null}

      {/* 2. What separates the parties */}
      <Section title="What separates you" right={<Pressable accessibilityRole="switch" accessibilityState={{ checked: asCounterparty }} accessibilityLabel={asCounterparty ? 'View as you' : `View as ${firstName} (demo)`} onPress={() => setAsCounterparty((v) => !v)}><T v="label" color={colors.forest}>{asCounterparty ? 'View as you' : `View as ${firstName} (demo)`}</T></Pressable>}>
        <TermSheet rows={termRows(n, shown.mine, shown.theirs)} mineLabel={asCounterparty ? firstName : 'You'} theirsLabel={asCounterparty ? 'You' : firstName} />
        <T v="small" color={colors.inkFaint} style={{ marginTop: space.sm }}>
          {asCounterparty
            ? `Demo: the same shared record from ${firstName}'s side. Neither side sees the other's private limit.`
            : limit !== undefined
              ? `Shaded rows still differ. Your private ${side === 'buyer' ? 'maximum' : 'minimum'}: ${formatMoney(limit)}${unit} — only you see this.`
              : 'Shaded rows still differ.'}
        </T>
      </Section>

      {/* 3. What could change */}
      {n.status === 'countered' ? (
        <Section title="What could change" note={`Your agent’s proposals — ${firstName} hasn’t seen them. Proposing one sends it.`} ruled>
          {alternatives.map((o) => {
            const label = o.changes.map((c) => c[0].toUpperCase() + c.slice(1)).join(', ') || 'Meet in the middle';
            const delta = view.theirs ? o.terms.price - view.theirs.terms.price : 0;
            return (
              <View key={o.id} testID="option-proposal" style={{ paddingVertical: space.md, borderTopWidth: 1, borderStyle: 'dashed', borderColor: colors.inkFaint }}>
                <Row justify="space-between" align="flex-start" gap={space.md}>
                  <View style={{ flex: 1 }}>
                    <T v="bodyStrong">{label}</T>
                    <T v="small" color={!o.withinLimit ? colors.rust : colors.inkDim}>
                      {!o.withinLimit ? `Past your private ${side === 'buyer' ? 'maximum' : 'minimum'}; proposing raises it.` : `${delta < 0 ? '−' : '+'}${formatMoney(Math.abs(delta))} against their ${theirWord}`}
                    </T>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    <T v="price">{`${formatMoney(o.terms.price)}${unit}`}</T>
                    <Button size="sm" kind="quiet" title={armed === o.id ? 'Tap again' : 'Propose'} label={`Propose ${formatMoney(o.terms.price)} with ${label.toLowerCase()}`} loading={busy === o.id} onPress={() => propose(o)} />
                  </View>
                </Row>
              </View>
            );
          })}
          <Row gap={space.sm} align="flex-end" style={{ marginTop: space.md }}>
            <View style={{ flex: 1 }}>
              <Field label={`Or your own ${myWord} on their terms`} prefix="£" value={custom} onChangeText={setCustom} keyboardType="number-pad" />
            </View>
            <Button size="sm" kind="secondary" title={armed === 'custom' ? 'Past my limit — propose' : 'Propose'} onPress={proposeCustom} loading={busy === 'custom'} />
          </Row>
          {message ? <T v="small" color={colors.rust} style={{ marginTop: space.md }} testID="negotiation-message">{message}</T> : null}
        </Section>
      ) : null}

      {/* 4. Your decision */}
      {n.status === 'countered' && confirmed ? (
        <Section title="Your decision">
          <View testID="option-confirmed" style={{ marginTop: space.sm, padding: space.lg, borderRadius: 14, borderWidth: 1.5, borderColor: colors.forest, backgroundColor: colors.raised, gap: 8 }}>
            <Row justify="space-between" align="flex-start">
              <T v="bodyStrong" style={{ flex: 1 }}>{`Approve ${firstName}’s ${view.theirs?.source === 'listing' ? theirWord : 'counteroffer'}`}</T>
              <T v="price">{`${formatMoney(confirmed.terms.price)}${unit}`}</T>
            </Row>
            <T v="small" color={colors.forest}>{`Confirmed by ${firstName}. Approving agrees the deal.`}</T>
            {(() => {
              const total = confirmed.terms.hours ? confirmed.terms.price * confirmed.terms.hours : confirmed.terms.price;
              const fees = computeFees(total);
              return (
                <View style={{ borderTopWidth: 1, borderColor: colors.rule, paddingTop: 6, gap: 2 }}>
                  {confirmed.terms.hours ? <Row justify="space-between"><T v="small" color={colors.inkDim}>{`${confirmed.terms.hours} h at ${formatMoney(confirmed.terms.price)}/hr`}</T><T v="small">{formatMoney(total)}</T></Row> : null}
                  {side === 'buyer' ? (
                    <>
                      <Row justify="space-between"><T v="small" color={colors.inkDim}>DemandOne fee, 5%</T><T v="small">{formatMoney(fees.buyerFee)}</T></Row>
                      <Row justify="space-between"><T v="smallStrong">You authorize (demo payment)</T><T v="smallStrong">{formatMoney(fees.buyerTotal)}</T></Row>
                    </>
                  ) : (
                    <>
                      <Row justify="space-between"><T v="small" color={colors.inkDim}>DemandOne fee, 10%</T><T v="small">{`−${formatMoney(fees.sellerFee)}`}</T></Row>
                      <Row justify="space-between"><T v="smallStrong">You receive</T><T v="smallStrong">{formatMoney(fees.sellerNet)}</T></Row>
                    </>
                  )}
                </View>
              );
            })()}
            {!confirmed.withinLimit ? <T v="small" color={colors.rust}>{`Past your private ${side === 'buyer' ? 'maximum' : 'minimum'}. Approving it raises your limit.`}</T> : null}
            <Button
              title={armed === confirmed.id || confirmed.withinLimit ? `Approve ${formatMoney(confirmed.terms.price)}` : 'Approve past my limit'}
              loading={busy === confirmed.id}
              onPress={() => (!confirmed.withinLimit && armed !== confirmed.id ? setArmed(confirmed.id) : void run(confirmed.id, () => acceptCounter(n.id)))}
            />
          </View>
          <Row gap={space.lg} style={{ marginTop: space.md, flexWrap: 'wrap' }}>
            <Button kind="quiet" title={view.mine ? `Hold at ${formatMoney(view.mine.terms.price)}` : 'Hold'} onPress={() => run('hold', () => holdPosition(n.id))} loading={busy === 'hold'} />
            <Button kind="quiet" title={side === 'buyer' ? 'Other sellers' : 'Other buyers'} onPress={() => router.push({ pathname: '/discover', params: { category: n.listing.category } })} />
            <Button kind="danger" title={armed === 'stop' ? 'Tap again to stop' : 'Stop'} onPress={() => (armed === 'stop' ? void run('stop', () => stopNegotiation(n.id)) : setArmed('stop'))} loading={busy === 'stop'} />
          </Row>
        </Section>
      ) : null}

      {n.status === 'awaiting_response' ? <T v="small" color={colors.inkDim} style={{ marginTop: space.xl }}>{`Waiting for ${firstName}’s response…`}</T> : null}
      {(n.status === 'accepted' || n.status === 'cleared') && n.bookingId ? <Button title="Open the transaction" onPress={() => router.push({ pathname: '/handled/[id]', params: { id: n.bookingId! } })} style={{ marginTop: space.xl }} /> : null}
      {n.status === 'accepted' && !n.bookingId ? <T v="body" color={colors.inkDim} style={{ marginTop: space.xl }}>Agreed in principle. Approve it with the rest of your allocation.</T> : null}
      {n.status === 'rejected' || n.status === 'expired' || n.status === 'withdrawn' ? <Button kind="secondary" title="Find another counterparty" onPress={() => router.push({ pathname: '/discover', params: { category: n.listing.category } })} style={{ marginTop: space.xl }} /> : null}

      {/* 5. History, on request */}
      <View style={{ marginTop: space.xxl, marginBottom: space.lg }}>
        <Rule />
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: showLog }} accessibilityLabel="Price movement and negotiation history" onPress={() => setShowLog((v) => !v)} style={{ paddingVertical: space.md }}>
          <Row justify="space-between">
            <T v="bodyStrong">Price movement & negotiation history</T>
            <T v="small" color={colors.inkDim}>{showLog ? 'Hide' : `${n.proposals.length} proposals`}</T>
          </Row>
        </Pressable>
        {showLog ? (
          <View style={{ gap: space.sm }}>
            {enoughHistory ? (
              <View>
                <StepHistory buyer={buyerHistory} seller={sellerHistory} />
                <T v="label" color={colors.inkFaint}>Each step is a proposal actually made. Steps where terms changed are noted below.</T>
              </View>
            ) : null}
            {n.events.map((e) => (
              <Row key={e.id} align="flex-start" gap={space.md} style={{ paddingVertical: 4 }}>
                <T v="label" color={colors.inkFaint} style={{ width: 44 }}>{new Date(e.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</T>
                <T v="small" style={{ flex: 1 }}>{describeEvent(e, viewer.id, nameOf)}</T>
                {e.proposalId ? <T v="label" color={colors.inkFaint}>{e.proposalId}</T> : null}
              </Row>
            ))}
          </View>
        ) : null}
      </View>
    </Page>
  );
}
