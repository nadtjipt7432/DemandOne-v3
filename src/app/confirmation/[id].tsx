import Feather from '@expo/vector-icons/Feather';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Btn, Card, Row, Screen, Txt } from '@/components/base';
import { Avatar, VerifyPill } from '@/components/domain';
import { useAppState, useViewer } from '@/state/hooks';
import { FEE_DISCLOSURE } from '@/domain/pricing';
import { confirmFulfillment, markDelivered, submitFeedback } from '@/services/market';
import { colors, fontDisplay, radius, space } from '@/theme';

const STATUS_LABEL = { confirmed: 'Confirmed', live: 'Live', delivered: 'Delivered', complete: 'Cleared' } as const;

export default function Confirmation() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { bookings, people, categories } = useAppState();
  const booking = bookings.find((b) => b.id === id);
  const [authorized, setAuthorized] = useState(false);
  const [fulfillBusy, setFulfillBusy] = useState(false);
  const [feedbackBusy, setFeedbackBusy] = useState<'yes' | 'no' | null>(null);
  const [beforeCounts, setBeforeCounts] = useState<{ completed: number; recommend: number } | null>(null);

  if (!booking) {
    return (
      <Screen>
        <Txt variant="body" color={colors.textDim} style={{ marginTop: space.xxl }}>
          Booking not found.
        </Txt>
        <Btn title="Go home" style={{ marginTop: space.lg }} onPress={() => router.replace('/today')} />
      </Screen>
    );
  }

  const p = people[booking.personId];
  const viewer = useViewer();
  const isBuyer = booking.role === 'buyer';
  const marketAvg = categories.find((c) => c.id === booking.category)?.marketAvgPrice;
  const earnedBonus = !isBuyer && marketAvg ? Math.round(booking.price - marketAvg) : 0;
  const isDiscovery = !!booking.category && !viewer.categories.includes(booking.category);
  const highlightColor = isBuyer ? colors.accent : colors.accent2;
  const highlightBg = isBuyer ? colors.accentSoft : colors.accent2Soft;

  const onMarkDelivered = async () => {
    setFulfillBusy(true);
    await markDelivered(booking.id);
    setFulfillBusy(false);
  };

  const onConfirmFulfillment = async () => {
    setFulfillBusy(true);
    await confirmFulfillment(booking.id);
    setFulfillBusy(false);
  };

  const onFeedback = async (recommends: boolean) => {
    setFeedbackBusy(recommends ? 'yes' : 'no');
    setBeforeCounts({ completed: p?.completedCount ?? 0, recommend: p?.recommendCount ?? 0 });
    await submitFeedback(booking.id, recommends);
    setFeedbackBusy(null);
  };

  return (
    <Screen scroll>
      <Row style={{ justifyContent: 'flex-end', marginTop: space.sm }}>
        <VerifyPill label={STATUS_LABEL[booking.status]} />
      </Row>

      {/* Hero */}
      <View style={{ alignItems: 'center', marginTop: space.lg }}>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: radius.control,
            backgroundColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: space.md,
          }}>
          <Feather name="check" size={28} color={colors.accentText} />
        </View>
        <Txt variant="display" style={{ fontFamily: fontDisplay }}>
          Handled.
        </Txt>
        <Txt variant="small" color={colors.textDim} style={{ marginTop: space.xs, textAlign: 'center' }}>
          {isBuyer ? `${p?.name} is booked · ${booking.when}.` : `You're booked for ${p?.name} · ${booking.when}.`}
        </Txt>
      </View>

      {/* The value story — the whole point, made hard to miss */}
      <View style={{ marginTop: space.xl, backgroundColor: highlightBg, borderRadius: radius.surface, padding: space.lg }}>
        <Txt variant="small" color={highlightColor}>
          {isBuyer ? 'You saved' : "You'll earn"}
        </Txt>
        <Txt variant="display" color={colors.text} style={{ marginTop: 2 }}>
          ${isBuyer ? (booking.savedAmount ?? 0) : booking.price}
        </Txt>
        <Txt variant="small" color={colors.textDim} style={{ marginTop: 4 }}>
          {isBuyer
            ? booking.savedAmount
              ? 'through your agent negotiating on your behalf'
              : 'at the price you approved'
            : earnedBonus > 0
              ? `— $${earnedBonus} above the typical rate for this`
              : 'once the work is verified complete'}
        </Txt>
        {isDiscovery ? (
          <Txt variant="small" color={highlightColor} style={{ marginTop: space.sm, fontWeight: '600' }}>
            {isBuyer ? "A service you might not have thought to look for." : "Work you didn't know was out there."}
          </Txt>
        ) : null}
      </View>

      {/* Booking */}
      <Card style={{ marginTop: space.md }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Row gap={space.md} style={{ flex: 1 }}>
            <Avatar initials={p?.initials ?? '··'} />
            <View style={{ flex: 1 }}>
              <Txt variant="bodyStrong">{p?.name}</Txt>
              <Txt variant="small" color={colors.textFaint}>
                {booking.service}
              </Txt>
            </View>
          </Row>
          <Txt variant="heading">${booking.price}</Txt>
        </Row>
        <Row style={{ justifyContent: 'space-between', marginTop: space.md }}>
          <Txt variant="small" color={colors.textDim}>
            {booking.when} · {booking.distanceMi} mi
          </Txt>
          <VerifyPill label="Checked" />
        </Row>
      </Card>

      <Card style={{ marginTop: space.md, backgroundColor: colors.successSoft, borderColor: colors.successSoft }}>
        <Txt variant="bodyStrong" color={colors.accent}>
          Payment held safely
        </Txt>
        <Txt variant="small" color={colors.textDim} style={{ marginTop: 2 }}>
          Released only after the work is complete. {booking.verifiedLine}. {FEE_DISCLOSURE}
        </Txt>
      </Card>

      {/* Fulfillment — a seller marking their own work complete can never release
          payment by itself; only the buyer's own confirmation moves this to Cleared. */}
      {booking.status !== 'complete' ? (
        <Card style={{ marginTop: space.md }}>
          <Txt variant="bodyStrong">
            {booking.status === 'delivered' ? 'Delivered — awaiting confirmation' : 'In progress'}
          </Txt>
          <Txt variant="small" color={colors.textDim} style={{ marginTop: 2 }}>
            {booking.status === 'delivered'
              ? isBuyer
                ? 'Confirm the work is done to release payment.'
                : `Waiting on ${viewer.name.split(' ')[0]} to confirm.`
              : isBuyer
                ? `${p?.name.split(' ')[0]} is working on this.`
                : 'Mark it ready once the work is done.'}
          </Txt>
          {!isBuyer && booking.status !== 'delivered' ? (
            <Btn title="Mark deliverable ready" loading={fulfillBusy} style={{ marginTop: space.md }} onPress={onMarkDelivered} />
          ) : null}
          {isBuyer && booking.status === 'delivered' ? (
            <Btn title="Confirm completion" loading={fulfillBusy} style={{ marginTop: space.md }} onPress={onConfirmFulfillment} />
          ) : null}
        </Card>
      ) : null}

      {/* Lightweight post-transaction trust signal (§2) — not a star rating, just
          whether the two of them actually worked together and it went well. This is
          the literal "market memory" mechanism: it writes real completedCount/
          recommendCount updates (submitFeedback), not a cosmetic local toggle. */}
      {booking.status === 'complete' ? (
        <Card style={{ marginTop: space.md }}>
          {booking.feedbackGiven ? (
            <>
              <Txt variant="body">Thanks — noted.</Txt>
              {beforeCounts ? (
                <Txt variant="small" color={colors.textFaint} style={{ marginTop: 4 }}>
                  {p?.name}: {beforeCounts.completed} → {p?.completedCount} completed, {beforeCounts.recommend} → {p?.recommendCount}{' '}
                  recommend
                </Txt>
              ) : null}
            </>
          ) : (
            <>
              <Txt variant="bodyStrong">Would you work with {p?.name.split(' ')[0]} again?</Txt>
              <Row gap={space.md} style={{ marginTop: space.md }}>
                <Btn
                  title="Yes"
                  variant="secondary"
                  loading={feedbackBusy === 'yes'}
                  disabled={feedbackBusy !== null}
                  style={{ flex: 1, height: 44 }}
                  onPress={() => onFeedback(true)}
                />
                <Btn
                  title="No"
                  variant="secondary"
                  loading={feedbackBusy === 'no'}
                  disabled={feedbackBusy !== null}
                  style={{ flex: 1, height: 44 }}
                  onPress={() => onFeedback(false)}
                />
              </Row>
            </>
          )}
        </Card>
      ) : null}

      {/* Actions */}
      <View style={{ marginTop: space.xl, gap: space.md }}>
        {isBuyer ? (
          <Btn
            title={authorized ? 'Payment authorized ✓' : `Authorize $${booking.price}`}
            icon={authorized ? 'check' : 'credit-card'}
            variant="secondary"
            onPress={() => setAuthorized(true)}
          />
        ) : null}
        <Btn title="Done" variant="ghost" onPress={() => router.replace('/matches')} />
      </View>
    </Screen>
  );
}
