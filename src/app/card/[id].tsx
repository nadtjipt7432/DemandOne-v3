import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Btn, Divider, InfoRow, Row, Screen, Txt } from '@/components/base';
import { Avatar, FitDisclosure, Header, KindTag, StatsRow, TrustBadge, ValueBadge } from '@/components/domain';
import { useAppState, useFit } from '@/state/hooks';
import { computeMarketValue, findScheduleConflict } from '@/domain/matching';
import { FEE_DISCLOSURE } from '@/domain/pricing';
import { likeCard, secureCard } from '@/services/market';
import { colors, space } from '@/theme';

export default function CardDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { cards, people, categories, bookings } = useAppState();
  const card = cards.find((c) => c.id === id);
  const fit = useFit(card);
  const [busy, setBusy] = useState<string | null>(null);

  if (!card) {
    return (
      <Screen>
        <Header onBack={() => router.back()} title="Card" />
        <Txt variant="body" color={colors.textDim}>
          This is no longer available.
        </Txt>
      </Screen>
    );
  }

  const person = people[card.personId];
  const tryPrice = card.negotiable ? Math.max(card.floorPrice ?? 1, Math.round(card.price * 0.9)) : card.price;
  const value = computeMarketValue(card, categories.find((c) => c.id === card.category));
  const conflict = findScheduleConflict(card.window, bookings);

  const secure = async (price: number) => {
    setBusy(String(price));
    const bookingId = await secureCard(card.id, price === card.price ? undefined : price);
    router.replace({ pathname: '/confirmation/[id]', params: { id: bookingId } });
  };

  const like = async () => {
    setBusy('like');
    const matchId = await likeCard(card.id);
    setBusy(null);
    if (matchId) router.replace({ pathname: '/match/[id]', params: { id: matchId } });
  };

  return (
    <Screen scroll>
      <Header
        onBack={() => router.back()}
        title="Details"
        right={
          card.urgencyNote ? (
            <Txt variant="small" color={colors.accent2}>
              {card.urgencyNote}
            </Txt>
          ) : undefined
        }
      />

      <KindTag kind={card.kind} />
      <Txt variant="title" style={{ marginTop: space.sm }}>
        {card.title}
      </Txt>

      {/* Person header — profile style */}
      <Row style={{ justifyContent: 'space-between', marginTop: space.lg }}>
        <Row gap={space.md}>
          <Avatar initials={person?.initials ?? '··'} size={48} />
          <View>
            <Txt variant="heading">{person?.name}</Txt>
            <Row gap={4}>
              <TrustBadge tier={person?.tier ?? 'everyday'} />
              <Txt variant="small" color={colors.textFaint}>
                · {card.distanceMi} mi · {person?.location}
              </Txt>
            </Row>
          </View>
        </Row>
      </Row>
      {person ? (
        <View style={{ marginTop: space.sm }}>
          <StatsRow person={person} />
        </View>
      ) : null}

      {/* Timing + price */}
      <Row style={{ justifyContent: 'space-between', marginTop: space.lg }}>
        <View>
          <Txt variant="small" color={colors.textFaint}>
            {card.window.label}
          </Txt>
        </View>
        <Txt variant="title">${card.price}</Txt>
      </Row>

      <Txt variant="body" color={colors.textDim} style={{ marginTop: space.md }}>
        {card.description}
      </Txt>

      {/* Trust / Fit / Value */}
      <View style={{ marginTop: space.lg }}>
        <InfoRow
          icon="shield"
          label="Trust"
          value={
            person?.verified.insurance
              ? 'Identity + insurance verified'
              : person?.verified.identity
                ? 'Identity verified'
                : 'Not yet verified'
          }
          right={
            person && person.trustPaths > 0 ? (
              <Txt variant="small" color={colors.accent}>
                {person.trustPaths} in your network
              </Txt>
            ) : undefined
          }
        />
        <Divider />
        <InfoRow
          icon="target"
          label="Your fit"
          value="Tap to see exactly why"
          right={fit ? <FitDisclosure fit={fit} /> : undefined}
        />
        <Divider />
        <InfoRow
          icon="bar-chart-2"
          label="Value"
          value={value.isGoodValue ? 'Compared to typical listings' : value.label}
          right={value.isGoodValue ? <ValueBadge value={value} /> : undefined}
        />
      </View>

      {conflict ? (
        <Row gap={space.sm} style={{ marginTop: space.xl, alignItems: 'flex-start' }}>
          <Txt variant="small" color={colors.accent2}>
            ⚠
          </Txt>
          <Txt variant="small" color={colors.accent2} style={{ flex: 1 }}>
            Overlaps with {conflict.service} you already have booked, {conflict.when}.
          </Txt>
        </Row>
      ) : null}

      {/* Actions */}
      <View style={{ marginTop: conflict ? space.md : space.xl, gap: space.md }}>
        <Btn title={`Secure at $${card.price}`} loading={busy === String(card.price)} onPress={() => secure(card.price)} />
        {card.negotiable ? (
          <Btn
            title={`Let your agent try $${tryPrice}`}
            variant="secondary"
            loading={busy === String(tryPrice)}
            onPress={() => secure(tryPrice)}
          />
        ) : null}
        <Btn title="Express interest — talk it through first" variant="ghost" icon="check" loading={busy === 'like'} onPress={like} />
        <Txt variant="small" color={colors.textFaint} style={{ textAlign: 'center' }}>
          {FEE_DISCLOSURE} Nothing is booked without your approval.
        </Txt>
      </View>
    </Screen>
  );
}
