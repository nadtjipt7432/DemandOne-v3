import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { formatMoney } from '@/domain/money';
import { UNIT_SHORT } from '@/domain/terms';
import { useAppState, useViewer } from '@/state/hooks';
import { Page, Row, Section, T, Tap, TopBar } from '@/ui/core';
import { SideMark } from '@/ui/market';
import { colors, space } from '@/theme';

/** Verified transaction history — completed on both sides of the market. */
export default function History() {
  const router = useRouter();
  const s = useAppState();
  const viewer = useViewer();
  const done = s.bookings.filter((b) => b.status === 'complete' && (b.buyerId === viewer.id || b.sellerId === viewer.id));
  return (
    <Page>
      <TopBar onBack={() => router.back()} />
      <T v="display">History</T>
      <T v="body" color={colors.inkDim} style={{ marginTop: space.sm }}>{`${done.length} verified transaction${done.length === 1 ? '' : 's'}, confirmed by both sides.`}</T>
      <Section title="Completed" ruled>
        {done.length === 0 ? <T v="body" color={colors.inkDim} style={{ paddingVertical: space.md }}>Nothing completed yet.</T> : null}
        {done.map((b) => {
          const buyer = b.buyerId === viewer.id;
          const other = s.people[buyer ? b.sellerId : b.buyerId];
          return (
            <Tap key={b.id} label={b.title} onPress={() => router.push({ pathname: '/handled/[id]', params: { id: b.id } })}>
              <View style={{ paddingVertical: space.md, borderBottomWidth: 1, borderColor: colors.rule, gap: 4 }}>
                <Row justify="space-between">
                  <Row gap={6}>
                    <SideMark kind={buyer ? 'need' : 'offer'} />
                    <T v="label" color={colors.inkDim}>{`${buyer ? 'Bought from' : 'Sold to'} ${other?.name}`}</T>
                  </Row>
                  <T v="label" color={colors.inkFaint}>{b.completedAt ? new Date(b.completedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}</T>
                </Row>
                <Row justify="space-between" gap={space.md}>
                  <T v="entry" style={{ flex: 1 }} lines={1}>{b.title}</T>
                  <T v="price">{`${formatMoney(buyer ? b.fees.buyerTotal : b.fees.sellerNet)}${UNIT_SHORT[b.unit]}`}</T>
                </Row>
                <T v="small" color={colors.inkFaint}>{buyer ? 'Paid, including fee' : 'Received, after fee'}</T>
              </View>
            </Tap>
          );
        })}
      </Section>
    </Page>
  );
}
