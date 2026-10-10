import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { formatMoney, parseMoney } from '@/domain/money';
import { computeFit, findScheduleConflict } from '@/domain/matching';
import { ISSUE_TEXT } from '@/domain/negotiation';
import { deadlineLabel, PAYMENT_LABEL, SCOPE_LABEL, UNIT_LABEL, VOLUME_LABEL } from '@/domain/terms';
import { passCard } from '@/services/market';
import { acceptListing, activeNegotiationForCard, defaultOwnLimit, startNegotiation, suggestedOpening } from '@/services/negotiation';
import { useAppState, useViewer } from '@/state/hooks';
import { Button, Choice, Field, KeyValue, Page, Row, Rule, Section, Stack, T, TopBar } from '@/ui/core';
import { CapacityBar, capacityText, evidenceLine, Price, SideLabel } from '@/ui/market';
import { colors, space } from '@/theme';
import type { DeadlineOption, PaymentOption, ScopeOption, VolumeOption } from '@/domain/types';

/** A listing in full: public terms, evidence, why it ranks for you — and authorizing your agent. */
export default function Listing() {
  const router = useRouter();
  const { id, act } = useLocalSearchParams<{ id: string; act?: string }>();
  const s = useAppState();
  const viewer = useViewer();
  const card = s.cards.find((c) => c.id === id);
  const active = card ? activeNegotiationForCard(s, card.id) : undefined;

  const viewerBuys = card?.kind === 'offer';
  const defaultLimit = card ? defaultOwnLimit(card, viewer) : 0;

  const [setup, setSetup] = useState(act === 'negotiate');
  const [limit, setLimit] = useState(String(defaultLimit));
  const [opening, setOpening] = useState(card ? String(suggestedOpening(card, defaultLimit)) : '');
  const [deadline, setDeadline] = useState<DeadlineOption>('listed');
  const [scope, setScope] = useState<ScopeOption>('full');
  const [payment, setPayment] = useState<PaymentOption>('on-completion');
  const [volume, setVolume] = useState<VolumeOption>('single');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'start' | 'accept' | null>(null);

  const fit = useMemo(() => (card ? computeFit(card, viewer, s.people[card.personId]) : undefined), [card, viewer, s.people]);

  if (!card) {
    return (
      <Page>
        <TopBar onBack={() => router.back()} />
        <T v="title" style={{ marginTop: space.xl }}>This position has left the market.</T>
        <Button kind="secondary" title="Back to the Exchange" onPress={() => router.replace('/discover')} style={{ marginTop: space.lg, alignSelf: 'flex-start' }} />
      </Page>
    );
  }

  const person = s.people[card.personId];
  const category = s.categories.find((c) => c.id === card.category)?.label ?? card.category;
  const conflict = findScheduleConflict(card.window, s.bookings, viewer.id);
  const revision = card.revisions?.[card.revisions.length - 1];
  const limitNum = parseMoney(limit);
  const openingNum = parseMoney(opening);
  const firstName = person.name.split(' ')[0];

  const authorize = async () => {
    if (!limitNum || !openingNum) return setError('Enter your private limit and an opening price.');
    setError(null);
    setBusy('start');
    const res = await startNegotiation(card.id, { price: openingNum, deadline, scope, payment, volume }, limitNum);
    setBusy(null);
    if (!res.ok) return setError(res.issue === 'not-negotiable' ? 'This is a fixed-price listing.' : res.issue === 'not-found' ? 'This position has left the market.' : ISSUE_TEXT[res.issue]);
    router.replace(res.bookingId ? { pathname: '/handled/[id]', params: { id: res.bookingId } } : { pathname: '/negotiation/[id]', params: { id: res.negotiationId } });
  };

  const accept = async () => {
    setBusy('accept');
    const res = await acceptListing(card.id);
    setBusy(null);
    if (res.ok && res.bookingId) router.replace({ pathname: '/handled/[id]', params: { id: res.bookingId } });
  };

  return (
    <Page>
      <TopBar onBack={() => router.back()} />
      <SideLabel kind={card.kind} detail={category} />
      <T v="display" style={{ marginTop: space.sm }}>{card.title}</T>

      <Row justify="space-between" align="flex-end" style={{ marginTop: space.lg }}>
        <Price amount={card.price} align="left" large caption={`${viewerBuys ? 'Ask' : 'Bid'}, ${UNIT_LABEL[card.unit]}`} />
        {card.capacity ? (
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <CapacityBar capacity={card.capacity} width={88} />
            <T v="small" color={colors.inkDim}>{capacityText(card.capacity)}</T>
          </View>
        ) : null}
      </Row>
      {revision ? <T v="small" color={colors.inkDim} style={{ marginTop: space.xs }}>{`Ask revised from ${formatMoney(revision.price)} on ${revision.at}.`}</T> : null}
      <T v="body" color={colors.inkDim} style={{ marginTop: space.md }}>{card.description}</T>

      <Section title="Terms as listed" ruled>
        <KeyValue label="Timing" value={card.timingNote} />
        <Rule />
        <KeyValue label="Scope" value={SCOPE_LABEL.full} />
        <Rule />
        <KeyValue label="Payment" value={PAYMENT_LABEL['on-completion']} />
        <Rule />
        <KeyValue label="Negotiable" value={card.negotiable ? 'Price and terms' : 'No, fixed price'} />
      </Section>

      <Section title={person.name} note={person.bio} ruled>
        <KeyValue label="Track record" value={evidenceLine(person)} />
        <Rule />
        <KeyValue label="Based in" value={person.location || 'Not stated'} />
        {fit ? (
          <>
            <Rule />
            <View style={{ paddingVertical: space.md, gap: 4 }}>
              <T v="small" color={colors.inkDim}>Why it ranks for you</T>
              {fit.explanation.map((line) => <T key={line} v="small">{line}</T>)}
            </View>
          </>
        ) : null}
      </Section>

      {conflict ? <T v="small" color={colors.rust} style={{ marginTop: space.lg }}>{`Overlaps with ${conflict.title}, which you already have agreed.`}</T> : null}

      {active ? (
        <View style={{ marginTop: space.xxl }}>
          <T v="body" color={colors.inkDim}>{`You're already negotiating this with ${firstName}.`}</T>
          <Button title="Open the negotiation" onPress={() => router.push({ pathname: '/negotiation/[id]', params: { id: active.id } })} style={{ marginTop: space.md }} />
        </View>
      ) : setup && card.negotiable ? (
        <Section title="Authorize your agent" note={`It proposes these terms to ${firstName}, follows the conventions for trade-offs, and asks you before agreeing anything.`} ruled>
          <Stack gap={space.lg} style={{ marginTop: space.md }}>
            <Field label={viewerBuys ? 'Your private maximum' : 'Your private minimum'} prefix="£" value={limit} onChangeText={setLimit} keyboardType="number-pad" hint={`Only you see this. Your agent never goes ${viewerBuys ? 'above' : 'below'} it without asking you.`} />
            <Field label={viewerBuys ? 'Opening bid' : 'Opening ask'} prefix="£" value={opening} onChangeText={setOpening} keyboardType="number-pad" />
            <Choice label="Delivery" value={deadline} onChange={setDeadline} options={[{ key: 'listed', label: deadlineLabel('listed', card.window.label) }, { key: 'plus3', label: '+3 days' }, { key: 'plus7', label: '+1 week' }]} />
            <Choice label="Scope" value={scope} onChange={setScope} options={[{ key: 'full', label: 'Full, 2 revisions' }, { key: 'one-revision', label: '1 revision' }, { key: 'core', label: 'Core only' }]} />
            <Choice label="Payment" value={payment} onChange={setPayment} options={[{ key: 'on-completion', label: 'On completion' }, { key: 'deposit', label: '50% deposit' }, { key: 'upfront', label: 'Up front' }]} />
            <Choice label="Volume" value={volume} onChange={setVolume} options={[{ key: 'single', label: VOLUME_LABEL.single }, { key: 'recurring', label: VOLUME_LABEL.recurring }]} />
            {error ? <T v="small" color={colors.rust}>{error}</T> : null}
            <Button title="Authorize agent" onPress={authorize} loading={busy === 'start'} />
          </Stack>
        </Section>
      ) : (
        <Stack gap={space.sm} style={{ marginTop: space.xxl }}>
          {card.negotiable ? <Button title="Negotiate terms" onPress={() => setSetup(true)} /> : null}
          <Button kind={card.negotiable ? 'secondary' : 'primary'} title={`${viewerBuys ? 'Accept' : 'Take it at'} ${formatMoney(card.price)}`} onPress={accept} loading={busy === 'accept'} />
          <Button kind="quiet" title="Not for me" onPress={() => passCard(card.id).then(() => router.back())} />
          <T v="small" color={colors.inkFaint} align="center">Nothing is agreed until you approve. Fees are shown before you do.</T>
        </Stack>
      )}
    </Page>
  );
}
