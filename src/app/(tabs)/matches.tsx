import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Divider, Row, Screen, Segmented, Txt } from '@/components/base';
import { Avatar, BookingBadge, MatchBadge } from '@/components/domain';
import { useAppState } from '@/state/hooks';
import { colors, space } from '@/theme';

type Seg = 'new' | 'negotiating' | 'booked';

export default function Matches() {
  const router = useRouter();
  const { matches, people, bookings, cards } = useAppState();
  const [seg, setSeg] = useState<Seg>('new');

  const allMatches = Object.values(matches);
  const newOnes = allMatches.filter((m) => m.status === 'pending' || m.status === 'mutual');
  const negotiating = allMatches.filter((m) => m.status === 'negotiating');

  const items: { key: Seg; label: string; count: number }[] = [
    { key: 'new', label: 'New', count: newOnes.length },
    { key: 'negotiating', label: 'Talking', count: negotiating.length },
    { key: 'booked', label: 'Booked', count: bookings.length },
  ];

  const shown = seg === 'new' ? newOnes : seg === 'negotiating' ? negotiating : [];

  return (
    <Screen scroll>
      <Txt variant="title" style={{ marginTop: space.sm }}>
        Requests
      </Txt>

      <View style={{ marginTop: space.lg }}>
        <Segmented items={items} value={seg} onChange={(k) => setSeg(k as Seg)} />
      </View>

      <View style={{ marginTop: space.lg }}>
        {seg !== 'booked' &&
          (shown.length === 0 ? (
            <Txt variant="small" color={colors.textFaint} style={{ paddingVertical: space.md }}>
              {seg === 'new' ? 'Nothing new yet. Mark something interested in the Exchange.' : 'Nothing being negotiated right now.'}
            </Txt>
          ) : (
            shown.map((m, i) => {
              const person = people[m.personId];
              const card = cards.find((c) => c.id === m.cardId);
              return (
                <View key={m.id}>
                  {i > 0 ? <Divider /> : null}
                  <Pressable
                    onPress={() => router.push({ pathname: '/match/[id]', params: { id: m.id } })}
                    style={({ pressed }) => [{ paddingVertical: space.md }, pressed && { opacity: 0.6 }]}>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <Row gap={space.md} style={{ flex: 1 }}>
                        <Avatar initials={person?.initials ?? '··'} />
                        <View style={{ flex: 1 }}>
                          <Txt variant="bodyStrong" numberOfLines={1}>
                            {card?.title ?? person?.name}
                          </Txt>
                          <MatchBadge status={m.status} />
                        </View>
                      </Row>
                      <Txt variant="heading">${m.currentPrice}</Txt>
                    </Row>
                  </Pressable>
                </View>
              );
            })
          ))}

        {seg === 'booked' &&
          (bookings.length === 0 ? (
            <Txt variant="small" color={colors.textFaint} style={{ paddingVertical: space.md }}>
              No bookings yet. Approve a recommendation and it lands here.
            </Txt>
          ) : (
            bookings.map((b, i) => {
              const person = people[b.personId];
              return (
                <View key={b.id}>
                  {i > 0 ? <Divider /> : null}
                  <Pressable
                    onPress={() => router.push({ pathname: '/confirmation/[id]', params: { id: b.id } })}
                    style={({ pressed }) => [{ paddingVertical: space.md }, pressed && { opacity: 0.6 }]}>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <BookingBadge status={b.status} />
                      <Txt variant="heading">${b.price}</Txt>
                    </Row>
                    <Txt variant="bodyStrong" style={{ marginTop: space.sm }}>
                      {b.service}
                    </Txt>
                    <Txt variant="small" color={colors.textDim} style={{ marginTop: 4 }}>
                      {person?.name} · {b.when} · {b.distanceMi} mi
                    </Txt>
                    {b.savedAmount ? (
                      <Txt variant="small" color={colors.accent} style={{ marginTop: 4 }}>
                        ${b.savedAmount} saved
                      </Txt>
                    ) : null}
                  </Pressable>
                </View>
              );
            })
          ))}
      </View>
    </Screen>
  );
}
