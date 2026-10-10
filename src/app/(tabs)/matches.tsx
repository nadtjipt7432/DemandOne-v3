import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { formatMoney } from '@/domain/money';
import { isTerminal, latestBy, otherSide, sideOf } from '@/domain/negotiation';
import { UNIT_SHORT } from '@/domain/terms';
import { useAppState, useViewer } from '@/state/hooks';
import { Page, Row, Section, T, Tap } from '@/ui/core';
import { SideMark } from '@/ui/market';
import { colors, space } from '@/theme';
import type { Booking, Negotiation } from '@/domain/types';

const BOOKING_STATE: Record<Booking['status'], string> = {
  agreed: 'Agreed, payment to authorize',
  paid: 'Payment held, work in progress',
  delivered: 'Delivered, awaiting confirmation',
  complete: 'Cleared',
};

const NEG_STATE: Record<Negotiation['status'], string> = {
  evaluating: 'Evaluating',
  awaiting_response: 'Waiting on them',
  countered: 'Your turn',
  accepted: 'Agreed',
  rejected: 'Declined',
  expired: 'Expired',
  withdrawn: 'Stopped',
  cleared: 'Cleared',
};

/** Deals — every negotiation and transaction, grouped by whose move it is. */
export default function Deals() {
  const router = useRouter();
  const s = useAppState();
  const viewer = useViewer();
  const mine = Object.values(s.negotiations).filter((n) => n.buyerId === viewer.id || n.sellerId === viewer.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const bookings = s.bookings.filter((b) => b.buyerId === viewer.id || b.sellerId === viewer.id);

  const yourTurn = mine.filter((n) => n.status === 'countered');
  const waiting = mine.filter((n) => n.status === 'awaiting_response' || n.status === 'evaluating');
  const inProgress = bookings.filter((b) => b.status !== 'complete');
  const closed = [...bookings.filter((b) => b.status === 'complete').map((b) => ({ kind: 'b' as const, b, at: b.completedAt ?? b.createdAt })), ...mine.filter((n) => isTerminal(n) && !n.bookingId).map((n) => ({ kind: 'n' as const, n, at: n.updatedAt }))].sort((a, b) => b.at.localeCompare(a.at));

  const negRow = (n: Negotiation) => {
    const side = sideOf(n, viewer.id);
    const theirs = latestBy(n, otherSide(side));
    const who = s.people[side === 'buyer' ? n.sellerId : n.buyerId]?.name;
    return (
      <Tap key={n.id} label={`${n.listing.title}, ${NEG_STATE[n.status]}`} onPress={() => router.push({ pathname: '/negotiation/[id]', params: { id: n.id } })}>
        <View style={{ paddingVertical: space.md, borderBottomWidth: 1, borderColor: colors.rule, gap: 4 }}>
          <Row justify="space-between">
            <Row gap={6}><SideMark kind={side === 'buyer' ? 'need' : 'offer'} /><T v="label" color={colors.inkDim}>{`${side === 'buyer' ? 'Buying from' : 'Selling to'} ${who}`}</T></Row>
            <T v="label" color={n.status === 'countered' ? colors.amberText : colors.inkFaint}>{NEG_STATE[n.status]}</T>
          </Row>
          <Row justify="space-between" align="flex-start" gap={space.md}>
            <T v="entry" lines={2} style={{ flex: 1 }}>{n.listing.title}</T>
            {theirs ? <T v="price">{`${formatMoney(theirs.terms.price)}${UNIT_SHORT[n.listing.unit]}`}</T> : null}
          </Row>
        </View>
      </Tap>
    );
  };

  const bookingRow = (b: Booking) => {
    const buyer = b.buyerId === viewer.id;
    const who = s.people[buyer ? b.sellerId : b.buyerId]?.name;
    return (
      <Tap key={b.id} label={`${b.title}, ${BOOKING_STATE[b.status]}`} onPress={() => router.push({ pathname: '/handled/[id]', params: { id: b.id } })}>
        <View style={{ paddingVertical: space.md, borderBottomWidth: 1, borderColor: colors.rule, gap: 4 }}>
          <Row justify="space-between">
            <Row gap={6}><SideMark kind={buyer ? 'need' : 'offer'} /><T v="label" color={colors.inkDim}>{`${buyer ? 'Bought from' : 'Sold to'} ${who}`}</T></Row>
            <T v="label" color={b.status === 'complete' ? colors.inkFaint : colors.forest}>{BOOKING_STATE[b.status]}</T>
          </Row>
          <Row justify="space-between" align="flex-start" gap={space.md}>
            <T v="entry" lines={2} style={{ flex: 1 }}>{b.title}</T>
            <T v="price">{`${formatMoney(b.terms.price)}${UNIT_SHORT[b.unit]}`}</T>
          </Row>
        </View>
      </Tap>
    );
  };

  const empty = mine.length === 0 && bookings.length === 0;

  return (
    <Page>
      <T v="display" style={{ marginTop: space.lg }}>Deals</T>
      {empty ? (
        <T v="body" color={colors.inkDim} style={{ marginTop: space.md }}>Nothing yet. Bid on a position in the Exchange, or tell your agent what you need.</T>
      ) : null}
      {yourTurn.length ? <Section title="Your turn" ruled>{yourTurn.map(negRow)}</Section> : null}
      {inProgress.length ? <Section title="In progress" ruled>{inProgress.map(bookingRow)}</Section> : null}
      {waiting.length ? <Section title="Waiting on them" ruled>{waiting.map(negRow)}</Section> : null}
      {closed.length ? <Section title="Closed" ruled>{closed.map((c) => (c.kind === 'b' ? bookingRow(c.b) : negRow(c.n)))}</Section> : null}
    </Page>
  );
}
