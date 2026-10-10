import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';
import { formatMoney } from '@/domain/money';
import { latestBy, otherSide, sideOf } from '@/domain/negotiation';
import { describeChanges, UNIT_SHORT } from '@/domain/terms';
import { useAppState, useViewer } from '@/state/hooks';
import { getAgentActivity, getDecisions, getPositions, getRelevantDemand, type Decision } from '@/state/myMarket';
import { AmbientField } from '@/ui/Ambient';
import { Button, Page, Row, Section, T, Tap } from '@/ui/core';
import { MarketRow, SideLabel, SpreadStrip } from '@/ui/market';
import { colors, space } from '@/theme';
import type { AppState } from '@/domain/types';

function first(name: string | undefined): string {
  return name?.split(' ')[0] ?? 'They';
}

/** The headline for a decision, in plain words, with where it leads. */
function describeDecision(d: Decision, s: AppState, viewerId: string): { headline: string; detail: string; cta: string; route: { pathname: string; params: Record<string, string> } } {
  if (d.kind === 'counter') {
    const n = d.negotiation;
    const side = sideOf(n, viewerId);
    const theirs = latestBy(n, otherSide(side))!;
    const mine = latestBy(n, side);
    const who = first(s.people[side === 'buyer' ? n.sellerId : n.buyerId]?.name);
    const changes = describeChanges(theirs.terms, n.proposals[0].terms);
    return {
      headline: theirs.source === 'listing' ? `${who} is holding at ${formatMoney(theirs.terms.price)}.` : `${who} came back at ${formatMoney(theirs.terms.price)}.`,
      detail: `${n.listing.title}.${changes.length ? ` Their terms: ${changes.join(', ')}.` : ''}${mine ? ` Your ${side === 'buyer' ? 'bid' : 'ask'} is ${formatMoney(mine.terms.price)}.` : ''}`,
      cta: 'Review terms',
      route: { pathname: '/negotiation/[id]', params: { id: n.id } },
    };
  }
  if (d.kind === 'bids') {
    return {
      headline: d.negotiations.length > 1 ? `${d.negotiations.length} buyers want your capacity.` : `${first(s.people[d.negotiations[0].buyerId]?.name)} bid on your capacity.`,
      detail: `${d.title}. Compare total value and flexibility before you accept.`,
      cta: 'Compare bids',
      route: { pathname: '/position/[id]', params: { id: d.offerId } },
    };
  }
  const b = d.booking;
  const who = first(s.people[b.buyerId === viewerId ? b.sellerId : b.buyerId]?.name);
  const map = {
    pay: { headline: 'Authorize the payment to start the work.', detail: `${b.title}. ${formatMoney(b.fees.buyerTotal)} is held until you confirm the work. Demo payment.`, cta: 'Authorize' },
    deliver: { headline: `${who} has paid. Deliver when ready.`, detail: `${b.title}, due ${b.deliveryLabel}.`, cta: 'Open transaction' },
    confirm: { headline: `${who} has delivered.`, detail: 'Confirm the work is done to release payment.', cta: 'Confirm' },
    feedback: { headline: `Would you work with ${who} again?`, detail: 'One tap. It updates their verified record.', cta: 'Answer' },
  }[d.kind];
  return { ...map, route: { pathname: '/handled/[id]', params: { id: b.id } } };
}

/** Home — the viewer's position in the market, composed like a front page. */
export default function Home() {
  const router = useRouter();
  const s = useAppState();
  const viewer = useViewer();
  const decisions = useMemo(() => getDecisions(s, viewer.id), [s, viewer.id]);
  const positions = useMemo(() => getPositions(s, viewer), [s, viewer]);
  const demand = useMemo(() => getRelevantDemand(s, viewer), [s, viewer]);
  const activity = useMemo(() => getAgentActivity(s, viewer.id), [s, viewer.id]);
  const lead = decisions[0] ? describeDecision(decisions[0], s, viewer.id) : undefined;
  const leadNegotiation = decisions[0]?.kind === 'counter' ? decisions[0].negotiation : undefined;
  const leadView = leadNegotiation ? { mine: latestBy(leadNegotiation, sideOf(leadNegotiation, viewer.id)), theirs: latestBy(leadNegotiation, otherSide(sideOf(leadNegotiation, viewer.id))) } : undefined;
  const categoryLabel = (id: string) => s.categories.find((c) => c.id === id)?.label ?? id;
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <Page backdrop={<AmbientField mood={leadNegotiation ? 'negotiating' : 'searching'} height={420} />}>
      <Row justify="space-between">
        <T v="label" color={colors.inkDim}>{viewer.location ? `${viewer.name}, ${viewer.location}` : viewer.name}</T>
        <T v="label" color={colors.inkDim}>{today}</T>
      </Row>

      <View style={{ marginTop: space.xxl }}>
        {lead ? (
          <>
            <T v="display" testID="home-headline">{lead.headline}</T>
            <T v="body" color={colors.inkDim} style={{ marginTop: space.sm }}>{lead.detail}</T>
            {leadView?.mine && leadView.theirs ? (
              <View style={{ marginTop: space.lg }}>
                <SpreadStrip bid={leadView.mine.by === 'buyer' ? leadView.mine.terms.price : leadView.theirs.terms.price} ask={leadView.mine.by === 'buyer' ? leadView.theirs.terms.price : leadView.mine.terms.price} />
              </View>
            ) : null}
            <Button title={lead.cta} onPress={() => router.push(lead.route as never)} style={{ marginTop: space.lg, alignSelf: 'flex-start' }} />
          </>
        ) : (
          <>
            <T v="display" testID="home-headline">{positions.length ? 'Your agent is watching the market.' : 'Nothing is waiting on you.'}</T>
            <T v="body" color={colors.inkDim} style={{ marginTop: space.sm }}>Say what you need, or release some capacity. Your agent does the searching.</T>
            <Button title="Speak to your agent" icon="mic" onPress={() => router.navigate('/ask')} style={{ marginTop: space.lg, alignSelf: 'flex-start' }} />
          </>
        )}
      </View>

      {decisions.length > 1 ? (
        <Section title="Also waiting on you" ruled>
          {decisions.slice(1).map((d, i) => {
            const x = describeDecision(d, s, viewer.id);
            return (
              <Tap key={i} label={x.headline} onPress={() => router.push(x.route as never)}>
                <View style={{ paddingVertical: space.md, borderBottomWidth: 1, borderColor: colors.rule }}>
                  <T v="bodyStrong">{x.headline}</T>
                  <T v="small" color={colors.inkDim} lines={1}>{x.detail}</T>
                </View>
              </Tap>
            );
          })}
        </Section>
      ) : null}

      {positions.length > 0 ? (
        <Section title="Your positions" ruled>
          {positions.map((p) => (
            <Tap key={p.id} label={`${p.kind === 'need' ? 'Need' : 'Offer'}: ${p.title}`} onPress={() => router.push({ pathname: '/position/[id]', params: { id: p.id } })}>
              <View style={{ paddingVertical: space.md, borderBottomWidth: 1, borderColor: colors.rule, gap: 4 }}>
                <Row justify="space-between">
                  <SideLabel kind={p.kind} />
                  <T v="label" color={p.live ? colors.amberText : colors.inkFaint}>{p.state}</T>
                </Row>
                <Row justify="space-between" align="flex-start" gap={space.md}>
                  <T v="entry" style={{ flex: 1 }} lines={2}>{p.title}</T>
                  <View style={{ alignItems: 'flex-end' }}>
                    <T v="price">{`${formatMoney(p.price)}${UNIT_SHORT[p.unit as 'fixed']}`}</T>
                    <T v="label" color={colors.inkFaint}>{p.kind === 'need' ? 'your maximum, private' : 'your ask'}</T>
                  </View>
                </Row>
              </View>
            </Tap>
          ))}
        </Section>
      ) : null}

      {demand.length > 0 ? (
        <Section title="Demand for what you do" note={viewer.capability ? `Matched to: ${viewer.capability.summary}` : undefined} ruled>
          {demand.map((card) => (
            <MarketRow
              key={card.id}
              card={card}
              person={s.people[card.personId]}
              categoryLabel={categoryLabel(card.category)}
              state="Open"
              forYou
              onOpen={() => router.push({ pathname: '/listing/[id]', params: { id: card.id } })}
            />
          ))}
        </Section>
      ) : null}

      {activity.length > 0 ? (
        <Section title="What your agent has done">
          {activity.map((a) => (
            <Tap key={a.id} label={a.text} onPress={() => router.push({ pathname: '/negotiation/[id]', params: { id: a.negotiationId } })}>
              <Row align="flex-start" gap={space.md} style={{ paddingVertical: space.sm }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.forest, marginTop: 7 }} />
                <T v="small" color={colors.inkDim} style={{ flex: 1 }}>{a.text}</T>
                <T v="label" color={colors.inkFaint}>{new Date(a.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</T>
              </Row>
            </Tap>
          ))}
        </Section>
      ) : null}
    </Page>
  );
}
