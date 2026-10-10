import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { computeFit, windowsFit } from '@/domain/matching';
import { formatMoney } from '@/domain/money';
import { isTerminal, latestBy } from '@/domain/negotiation';
import { computeFees } from '@/domain/pricing';
import { deadlineLabel, UNIT_LABEL, UNIT_SHORT } from '@/domain/terms';
import { DEMO_UTTERANCES } from '@/infra/voice';
import { keepWatching, setOfferCapacity } from '@/services/market';
import { acceptCounter, bidsOnOffer } from '@/services/negotiation';
import { useAppState, useViewer } from '@/state/hooks';
import { AmbientField } from '@/ui/Ambient';
import { Button, Page, Row, Section, Stack, T, Tap, TopBar } from '@/ui/core';
import { evidenceLine, MarketRow, Price, SideLabel } from '@/ui/market';
import { VoicePanel } from '@/ui/VoicePanel';
import { colors, radius, space } from '@/theme';

/** One of the viewer's own positions: who could fill it (need), or who is bidding (offer). */
export default function Position() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useAppState();
  const viewer = useViewer();
  const need = viewer.needs.find((n) => n.id === id);
  const offer = viewer.offers.find((o) => o.id === id);
  const [busy, setBusy] = useState<string | null>(null);

  const providers = useMemo(() => {
    if (!need) return [];
    return s.cards
      .filter((c) => c.kind === 'offer' && c.category === need.category && windowsFit(need.window, c.window) && !s.passedCardIds.includes(c.id))
      .map((c) => ({ card: c, fit: computeFit(c, viewer, s.people[c.personId], need.priorities.length ? need.priorities : undefined) }))
      .sort((a, b) => b.fit.score - a.fit.score)
      .slice(0, 3);
  }, [need, s.cards, s.passedCardIds, s.people, viewer]);

  const negotiations = need ? Object.values(s.negotiations).filter((n) => n.buyerId === viewer.id && n.listing.category === need.category) : [];
  const bids = offer ? bidsOnOffer(s, offer.id) : [];
  const labelOf = (cid: string) => s.categories.find((c) => c.id === cid)?.label ?? cid;

  if (!need && !offer) {
    return (
      <Page>
        <TopBar onBack={() => router.back()} />
        <T v="title" style={{ marginTop: space.xl }}>This position isn’t active.</T>
      </Page>
    );
  }

  const pos = (need ?? offer)!;
  const kind = need ? 'need' : 'offer';

  return (
    <Page
      backdrop={<AmbientField mood="searching" height={300} />}
      footer={offer && bids.length > 0 ? <VoicePanel variant="dock" context={{ kind: 'bids', offerId: offer.id }} prompts={[DEMO_UTTERANCES.compare, 'Take the recurring one']} /> : undefined}>
      <TopBar onBack={() => router.back()} />
      <SideLabel kind={kind} detail={labelOf(pos.category)} />
      <T v="display" style={{ marginTop: space.sm }}>{pos.title}</T>
      <Row justify="space-between" align="flex-end" style={{ marginTop: space.lg }}>
        {need ? <Price amount={need.budgetMax} align="left" caption={`your private maximum, ${UNIT_LABEL[need.unit]}`} large /> : <Price amount={offer!.price} align="left" caption={`your ask, ${UNIT_LABEL[offer!.unit]}`} large />}
        <T v="small" color={colors.inkDim}>{pos.timing.deadlineLabel ?? pos.window.label}</T>
      </Row>

      {offer ? (
        <Row justify="space-between" style={{ marginTop: space.lg, paddingVertical: space.sm, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.rule }}>
          <T v="body">{offer.capacityHours !== undefined ? `${offer.capacityHours} hours released` : 'Capacity not set'}</T>
          <Row gap={space.sm}>
            <Button size="sm" kind="secondary" title="−" label="Release fewer hours" onPress={() => setOfferCapacity(offer.id, (offer.capacityHours ?? 0) - 1)} />
            <Button size="sm" kind="secondary" title="+" label="Release more hours" onPress={() => setOfferCapacity(offer.id, (offer.capacityHours ?? 0) + 1)} />
          </Row>
        </Row>
      ) : null}

      {need ? (
        <>
          {negotiations.length > 0 ? (
            <Section title="Negotiating" ruled>
              {negotiations.map((n) => {
                const theirs = latestBy(n, 'seller');
                return (
                  <Tap key={n.id} label={`Negotiation with ${s.people[n.sellerId]?.name}`} onPress={() => router.push({ pathname: '/negotiation/[id]', params: { id: n.id } })}>
                    <Row justify="space-between" style={{ paddingVertical: space.md, borderBottomWidth: 1, borderColor: colors.rule }}>
                      <View>
                        <T v="bodyStrong">{s.people[n.sellerId]?.name}</T>
                        <T v="small" color={isTerminal(n) ? colors.inkFaint : colors.amberText}>{n.status === 'countered' ? 'Your turn' : n.status === 'awaiting_response' ? 'Waiting on them' : n.status}</T>
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
        </>
      ) : (
        <Section title={bids.length ? `${bids.length} bid${bids.length === 1 ? '' : 's'} on your capacity` : 'No bids yet'} note={bids.length > 1 ? 'Compare total value against how much of your time each commits.' : undefined} ruled={bids.length > 0}>
          <Stack gap={space.sm} style={{ marginTop: space.sm }}>
            {bids.map((n) => {
              const bid = latestBy(n, 'buyer')!;
              const buyer = s.people[n.buyerId];
              const engagements = bid.terms.volume === 'recurring' ? 3 : 1;
              const open = n.status === 'countered';
              return (
                <View key={n.id} testID="bid" style={{ padding: space.md, borderRadius: radius.control, borderWidth: 1, borderColor: colors.rule, gap: 6 }}>
                  <Row justify="space-between" align="flex-start">
                    <View style={{ flex: 1 }}>
                      <T v="bodyStrong">{buyer?.name}</T>
                      <T v="small" color={colors.inkFaint}>{buyer ? evidenceLine(buyer) : ''}</T>
                    </View>
                    <Price amount={bid.terms.price} unit={offer!.unit} />
                  </Row>
                  <Row gap={space.xl}>
                    <View><T v="label" color={colors.inkDim}>Engagements</T><T v="bodyStrong">{String(engagements)}</T></View>
                    <View><T v="label" color={colors.inkDim}>Total value</T><T v="bodyStrong">{`${formatMoney(bid.terms.price * engagements)}${UNIT_SHORT[offer!.unit]}`}</T></View>
                    <View style={{ flex: 1 }}><T v="label" color={colors.inkDim}>Delivery</T><T v="small">{deadlineLabel(bid.terms.deadline, offer!.window.label)}</T></View>
                  </Row>
                  <T v="small" color={colors.inkDim}>{engagements === 3 ? 'Recurring: more in total, commits your time for three months.' : 'One engagement: leaves room for another buyer.'}</T>
                  {open ? (
                    <Row gap={space.sm}>
                      <Button size="sm" title={`Accept, receive ${formatMoney(computeFees(bid.terms.price).sellerNet)}`} loading={busy === n.id} onPress={async () => {
                        setBusy(n.id);
                        const res = await acceptCounter(n.id);
                        setBusy(null);
                        if (res.ok && res.bookingId) router.push({ pathname: '/handled/[id]', params: { id: res.bookingId } });
                      }} style={{ flex: 1 }} />
                      <Button size="sm" kind="secondary" title="Counter" onPress={() => router.push({ pathname: '/negotiation/[id]', params: { id: n.id } })} />
                    </Row>
                  ) : (
                    <T v="small" color={colors.inkFaint}>{n.status === 'accepted' || n.status === 'cleared' ? 'Agreed.' : n.status === 'awaiting_response' ? 'Your counter is with them.' : `Closed: ${n.status}.`}</T>
                  )}
                </View>
              );
            })}
          </Stack>
          {bids.length === 0 ? <T v="body" color={colors.inkDim}>Buyers with matching needs will bid here. Your minimum stays private.</T> : null}
        </Section>
      )}
    </Page>
  );
}
