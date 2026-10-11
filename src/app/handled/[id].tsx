import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { formatMoney } from '@/domain/money';
import { PAYMENT_LABEL, SCOPE_LABEL, UNIT_SHORT, VOLUME_LABEL } from '@/domain/terms';
import { addPaymentMethod } from '@/services/account';
import {
  authorizePayment,
  confirmCompletion,
  markDelivered,
  roleOf,
  simulateBuyerConfirmation,
  simulateSellerDelivery,
  receivedFeedback,
  submitFeedback,
  viewerFeedback,
} from '@/services/transactions';
import { useAppState, useViewer } from '@/state/hooks';
import { getAdjacentListings } from '@/state/myMarket';
import { AmbientField, CircleMark } from '@/ui/Ambient';
import { Button, KeyValue, Page, Row, Rule, Section, Stack, T, TopBar } from '@/ui/core';
import { evidenceLine, MarketRow } from '@/ui/market';
import { ReviewForm, ReviewSummary, SealedReview } from '@/ui/reputation';
import { VoicePanel } from '@/ui/VoicePanel';
import { colors, space } from '@/theme';
import type { BookingStatus } from '@/domain/types';

const STEPS: { status: BookingStatus | 'feedback'; label: string }[] = [
  { status: 'agreed', label: 'Terms agreed' },
  { status: 'paid', label: 'Payment held (demo)' },
  { status: 'delivered', label: 'Work delivered' },
  { status: 'complete', label: 'Confirmed complete' },
  { status: 'feedback', label: 'Feedback' },
];

/** HANDLED — the agreed transaction, its true state, and what to do next. */
export default function Handled() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useAppState();
  const viewer = useViewer();
  const booking = s.bookings.find((b) => b.id === id);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!booking) {
    return (
      <Page>
        <TopBar onBack={() => router.back()} />
        <T v="title" style={{ marginTop: space.xl }}>Transaction not found.</T>
        <Button title="Go to Deals" onPress={() => router.replace('/matches')} style={{ marginTop: space.lg, alignSelf: 'flex-start' }} />
      </Page>
    );
  }

  const role = roleOf(booking, viewer.id);
  const other = s.people[role === 'buyer' ? booking.sellerId : booking.buyerId];
  const first = other?.name.split(' ')[0] ?? 'They';
  const price = booking.terms.price;
  const unit = UNIT_SHORT[booking.unit];
  const myFeedback = viewerFeedback(booking, viewer.id);
  const received = receivedFeedback(booking, viewer.id);
  const stepIndex = booking.status === 'complete' ? (myFeedback === undefined ? 4 : 5) : STEPS.findIndex((x) => x.status === booking.status);
  const related = getAdjacentListings(s, booking, viewer.id);
  const opening = role === 'buyer' ? booking.openingPrice : booking.openingBid ?? booking.openingPrice;
  const movement = role === 'buyer' ? opening - price : price - opening;
  const hasCard = s.paymentMethods.some((p) => p.id === s.defaultPaymentId);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t go through.');
    } finally {
      setBusy(null);
    }
  };

  const action = (() => {
    if (booking.status === 'agreed' && role === 'buyer') {
      return hasCard ? (
        <Button title={`Authorize ${formatMoney(booking.fees.buyerTotal)} (demo)`} onPress={() => run('pay', () => authorizePayment(booking.id))} loading={busy === 'pay'} />
      ) : (
        <Stack gap={space.sm}>
          <T v="small" color={colors.inkDim}>Add a payment method to authorize. This is a demo card; nothing is charged.</T>
          <Button title="Add demo card ending 4242" onPress={() => run('card', () => addPaymentMethod('Demo Visa ending 4242'))} loading={busy === 'card'} />
        </Stack>
      );
    }
    if (booking.status === 'paid' && role === 'buyer') {
      return (
        <Stack gap={space.sm}>
          <T v="body" color={colors.inkDim}>{`Payment is held. ${first} delivers by ${booking.deliveryLabel}.`}</T>
          <Button kind="secondary" title={`Simulate ${first}'s delivery (demo)`} onPress={() => run('sim', () => simulateSellerDelivery(booking.id))} loading={busy === 'sim'} />
        </Stack>
      );
    }
    if (booking.status === 'paid' && role === 'seller') {
      return <Button title="Mark as delivered" onPress={() => run('deliver', () => markDelivered(booking.id))} loading={busy === 'deliver'} />;
    }
    if (booking.status === 'delivered' && role === 'buyer') {
      return <Button title="Confirm the work is done" onPress={() => run('confirm', () => confirmCompletion(booking.id))} loading={busy === 'confirm'} />;
    }
    if (booking.status === 'delivered' && role === 'seller') {
      return (
        <Stack gap={space.sm}>
          <T v="body" color={colors.inkDim}>{`Delivered. Payment releases when ${first} confirms.`}</T>
          <Button kind="secondary" title={`Simulate ${first}'s confirmation (demo)`} onPress={() => run('sim', () => simulateBuyerConfirmation(booking.id))} loading={busy === 'sim'} />
        </Stack>
      );
    }
    if (booking.status === 'complete' && myFeedback === undefined && other) {
      return (
        <Stack gap={space.lg}>
          <ReviewForm role={role === 'buyer' ? 'seller' : 'buyer'} name={other.name} onSubmit={(input) => submitFeedback(booking.id, input)} />
          {received.sealed ? <SealedReview name={other.name} /> : null}
        </Stack>
      );
    }
    if (booking.status === 'complete') {
      return (
        <Stack gap={space.lg}>
          <T v="body">{`Feedback sent. It’s on ${first}’s record now.`}</T>
          {myFeedback ? <ReviewSummary title={`Your feedback on ${first}`} review={myFeedback} testID="given-review" /> : null}
          {received.review ? <ReviewSummary title={`${first}’s feedback on you`} review={received.review} testID="received-review" /> : null}
          <Stack gap={space.xs}>
            {other ? <T v="small" color={colors.inkDim} testID="counterparty-record">{`${other.name}: ${evidenceLine(other)}.`}</T> : null}
            <T v="small" color={colors.inkDim} testID="own-record">{`Your record: ${evidenceLine(viewer)}.`}</T>
          </Stack>
        </Stack>
      );
    }
    return null;
  })();

  return (
    <Page
      backdrop={<AmbientField mood="handled" height={480} />}
      footer={booking.status !== 'complete' || myFeedback === undefined ? <VoicePanel variant="dock" context={{ kind: 'booking', bookingId: booking.id }} prompts={role === 'seller' ? ["The work's delivered"] : booking.status === 'delivered' ? ['Confirm it’s done'] : ['What else might I need?']} /> : undefined}>
      <TopBar onBack={() => router.back()} right={<Button kind="quiet" size="sm" title="Done" onPress={() => router.replace('/matches')} />} />
      <View style={{ alignItems: 'center', marginTop: space.md }}>
        <CircleMark size={84} meet />
      </View>
      <T v="hero" align="center" style={{ marginTop: space.lg }} testID="handled-title">{booking.status === 'complete' ? 'Cleared.' : 'Handled.'}</T>
      <T v="body" color={colors.inkDim} align="center" style={{ marginTop: space.sm }}>{`${role === 'buyer' ? 'You' : first} and ${role === 'buyer' ? first : 'you'} agreed terms on`}</T>
      <T v="entry" align="center" style={{ marginTop: 2 }}>{booking.title}</T>

      <Section title="Where it stands" ruled>
        {STEPS.map((step, i) => {
          const done = i < stepIndex;
          const current = i === stepIndex;
          return (
            <Row key={step.status} gap={space.md} style={{ paddingVertical: 8 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: done ? colors.forest : 'transparent', borderWidth: 1.5, borderColor: done || current ? colors.forest : colors.rule }} />
              <T v={current ? 'bodyStrong' : 'body'} color={done || current ? colors.ink : colors.inkFaint}>{step.label}</T>
            </Row>
          );
        })}
        <View style={{ marginTop: space.md }} testID="handled-action">{action}</View>
        {error ? <T v="small" color={colors.rust} style={{ marginTop: space.sm }}>{error}</T> : null}
      </Section>

      <Section title="Agreed terms" ruled style={{ marginTop: space.xl, padding: space.lg, borderRadius: 14, backgroundColor: colors.raised, borderWidth: 1, borderColor: colors.rule }}>
        <KeyValue label="Price" value={`${formatMoney(price)}${unit}`} />
        <Rule />
        <KeyValue label="Delivery" value={booking.deliveryLabel} />
        <Rule />
        <KeyValue label="Scope" value={SCOPE_LABEL[booking.terms.scope]} />
        <Rule />
        <KeyValue label="Payment" value={PAYMENT_LABEL[booking.terms.payment]} />
        <Rule />
        <KeyValue label="Volume" value={VOLUME_LABEL[booking.terms.volume]} />
        {booking.terms.hours ? (
          <>
            <Rule />
            <KeyValue label="Hours" value={`${booking.terms.hours} h`} />
          </>
        ) : null}
      </Section>

      <Section title="The money" ruled style={{ marginTop: space.xl, padding: space.lg, borderRadius: 14, backgroundColor: colors.raised, borderWidth: 1, borderColor: colors.rule }}>
        <KeyValue label={role === 'buyer' ? 'Initial ask' : 'Initial bid'} value={`${formatMoney(opening)}${unit}`} />
        <Rule />
        <KeyValue label="Agreed price" value={`${formatMoney(price)}${unit}`} />
        {booking.terms.hours ? (
          <>
            <Rule />
            <KeyValue label={`Total, ${booking.terms.hours} h`} value={formatMoney(booking.total)} />
          </>
        ) : null}
        {movement > 0 ? <T v="small" color={colors.forest} style={{ paddingBottom: space.sm }}>{`${formatMoney(movement)}${unit} ${role === 'buyer' ? 'below the initial ask' : 'above the initial bid'}.`}</T> : null}
        <Rule />
        {role === 'buyer' ? (
          <>
            <KeyValue label="DemandOne fee, 5%" value={formatMoney(booking.fees.buyerFee)} />
            <Rule />
            <KeyValue label="You pay" value={formatMoney(booking.fees.buyerTotal)} />
          </>
        ) : (
          <>
            <KeyValue label="DemandOne fee, 10%" value={`−${formatMoney(booking.fees.sellerFee)}`} />
            <Rule />
            <KeyValue label="You receive" value={formatMoney(booking.fees.sellerNet)} />
          </>
        )}
        {booking.payment ? <T v="small" color={colors.inkFaint} style={{ marginTop: space.xs }}>{`Payment: ${booking.payment.methodLabel}. Demo — no money moves.`}</T> : null}
      </Section>

      {related.length > 0 ? (
        <Section title="Often needed next" note={`Services that often follow ${s.categories.find((c) => c.id === booking.category)?.label.toLowerCase() ?? 'this'}.`} ruled>
          {related.map((card) => (
            <MarketRow key={card.id} card={card} person={s.people[card.personId]} categoryLabel={s.categories.find((c) => c.id === card.category)?.label ?? ''} state="Open" onOpen={() => router.push({ pathname: '/listing/[id]', params: { id: card.id } })} />
          ))}
        </Section>
      ) : null}
    </Page>
  );
}
