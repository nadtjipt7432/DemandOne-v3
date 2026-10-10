import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Divider, Row, Screen, Txt } from '@/components/base';
import { Avatar, Header } from '@/components/domain';
import { useAppState } from '@/state/hooks';
import { colors, space } from '@/theme';

/** Every completed transaction, buyer and seller side — the "past transactions" list. */
export default function History() {
  const router = useRouter();
  const { bookings, people } = useAppState();
  const past = bookings.filter((b) => b.status === 'complete');

  return (
    <Screen scroll>
      <Header onBack={() => router.back()} title="Transaction history" />
      <Txt variant="small" color={colors.textFaint} style={{ marginTop: space.xs }}>
        {past.length} completed, both sides of the exchange.
      </Txt>

      <View style={{ marginTop: space.lg }}>
        {past.length === 0 ? (
          <Txt variant="small" color={colors.textFaint} style={{ paddingVertical: space.md }}>
            Nothing completed yet — it'll show up here once work is verified done.
          </Txt>
        ) : (
          past.map((b, i) => {
            const person = people[b.personId];
            return (
              <View key={b.id}>
                {i > 0 ? <Divider /> : null}
                <Pressable
                  onPress={() => router.push({ pathname: '/confirmation/[id]', params: { id: b.id } })}
                  style={({ pressed }) => [{ paddingVertical: space.md }, pressed && { opacity: 0.6 }]}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Row gap={space.md} style={{ flex: 1 }}>
                      <Avatar initials={person?.initials ?? '··'} />
                      <View style={{ flex: 1 }}>
                        <Txt variant="bodyStrong" numberOfLines={1}>
                          {b.service}
                        </Txt>
                        <Txt variant="small" color={colors.textFaint} numberOfLines={1}>
                          {person?.name} · {b.when}
                        </Txt>
                      </View>
                    </Row>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Txt variant="heading">${b.price}</Txt>
                      <Txt variant="small" color={colors.textFaint}>
                        {b.role === 'buyer' ? 'Paid' : 'Earned'}
                      </Txt>
                    </View>
                  </Row>
                  {b.savedAmount ? (
                    <Txt variant="small" color={colors.accent} style={{ marginTop: 4 }}>
                      ${b.savedAmount} {b.role === 'buyer' ? 'saved' : 'above typical rate'}
                    </Txt>
                  ) : null}
                </Pressable>
              </View>
            );
          })
        )}
      </View>
    </Screen>
  );
}
