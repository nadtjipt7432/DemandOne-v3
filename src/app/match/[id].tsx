import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Btn, Row, Screen, Txt } from '@/components/base';
import { Avatar, Header, MarketMoment, MatchBadge, Sparkline } from '@/components/domain';
import { useAppState } from '@/state/hooks';
import { findScheduleConflict } from '@/domain/matching';
import { acceptMatch, negotiateMatch, negotiateWithFlexibleTiming, raiseMaximum } from '@/services/market';
import { colors, marketField, radius, space } from '@/theme';

export default function MatchDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { matches, people, cards, categories, bookings, viewerId } = useAppState();
  const match = matches[id];
  const viewer = people[viewerId];
  const [busy, setBusy] = useState<string | null>(null);

  if (!match) {
    return (
      <Screen>
        <Header onBack={() => router.back()} title="Match" />
        <Txt variant="body" color={colors.textDim}>
          This match has closed.
        </Txt>
      </Screen>
    );
  }

  const person = people[match.personId];
  const card = cards.find((c) => c.id === match.cardId);
  const role = match.kind === 'need' ? 'seller' : 'buyer';
  const saved = Math.max(0, match.firstPrice - match.currentPrice);
  const marketAvg = categories.find((c) => c.id === match.category)?.marketAvgPrice;
  const earnedBonus = marketAvg ? Math.round(match.currentPrice - marketAvg) : 0;
  const highlightColor = role === 'buyer' ? colors.accent : colors.accent2;
  const highlightBg = role === 'buyer' ? colors.accentSoft : colors.accent2Soft;
  const conflict = match.status !== 'booked' ? findScheduleConflict(match.window, bookings) : undefined;

  // "Room to move" — the counterpart's own hard boundary, not the viewer's budget
  // (that's a different number, shown on Home's My Market instead). Only a real
  // market moment when there's genuinely more to negotiate.
  const boundary = role === 'buyer' ? match.floorPrice : match.ceilingPrice;
  const spread = boundary !== undefined ? Math.abs(match.currentPrice - boundary) : undefined;
  const hasRoom = match.negotiable && spread !== undefined && spread > 0;
  // Reaching the counterpart's floor/ceiling is a real, final state — shown
  // explicitly rather than just letting the negotiate action quietly vanish.
  const atBoundary = match.negotiable && spread !== undefined && spread <= 0;
  const priceMoved = match.currentPrice !== match.firstPrice;

  // A second negotiation lever, offered only when it's a real trade: the viewer's
  // own need in this category actually has slack to give (not "asap").
  const viewerNeed = role === 'buyer' ? viewer.needs.find((n) => n.category === match.category) : undefined;
  const canTradeTiming =
    role === 'buyer' && match.negotiable && match.status !== 'booked' && viewerNeed !== undefined && viewerNeed.timing.type !== 'asap';

  // The viewer's own stated ceiling for this category — a different number from the
  // counterpart's floor (`boundary` above). When the market's current number is
  // genuinely past it, only the viewer can choose to move it — never silently.
  const maxGap = role === 'buyer' && viewerNeed ? match.currentPrice - viewerNeed.budgetMax : 0;
  const showRaiseMax = role === 'buyer' && match.status !== 'booked' && viewerNeed !== undefined && maxGap > 0;

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    await fn();
    setBusy(null);
  };

  return (
    <Screen scroll>
      <Header onBack={() => router.back()} title="Request" right={<MatchBadge status={match.status} />} />

      <Row gap={space.md} style={{ marginTop: space.sm }}>
        <Avatar initials={person?.initials ?? '··'} size={48} />
        <View>
          <Txt variant="heading">{person?.name}</Txt>
          <Txt variant="small" color={colors.textDim}>
            {card?.title}
          </Txt>
        </View>
      </Row>

      {/* Price — the value this whole negotiation exists to create, made hard to miss */}
      <View style={{ marginTop: space.lg, backgroundColor: highlightBg, borderRadius: radius.surface, padding: space.lg }}>
        <Txt variant="small" color={highlightColor}>
          {role === 'buyer' ? "You'd pay" : "You'd earn"}
        </Txt>
        <Row gap={space.sm} style={{ alignItems: 'flex-end', marginTop: 2 }}>
          <Txt variant="display">${match.currentPrice}</Txt>
          {priceMoved ? <Sparkline from={match.firstPrice} to={match.currentPrice} color={highlightColor} /> : null}
        </Row>
        {role === 'buyer' && saved > 0 ? (
          <Txt variant="bodyStrong" color={highlightColor} style={{ marginTop: space.sm }}>
            ${saved} below the first offer
          </Txt>
        ) : null}
        {role === 'seller' && earnedBonus > 0 ? (
          <Txt variant="bodyStrong" color={highlightColor} style={{ marginTop: space.sm }}>
            ${earnedBonus} above the typical rate for this
          </Txt>
        ) : null}
      </View>

      {/* The viewer's own stated ceiling, not the counterpart's floor (that's the
          MarketMoment panel below) — only the viewer can move this, and only on
          purpose. */}
      {showRaiseMax ? (
        <View style={{ marginTop: space.lg, backgroundColor: colors.accent2Soft, borderRadius: radius.surface, padding: space.lg }}>
          <Txt variant="bodyStrong">
            ${maxGap} over your ${viewerNeed!.budgetMax} maximum
          </Txt>
          <Txt variant="small" color={colors.textDim} style={{ marginTop: 4 }}>
            Only you can raise your maximum — your agent won't do it on its own.
          </Txt>
          <Btn
            title={`Increase my maximum to $${match.currentPrice}`}
            variant="secondary"
            loading={busy === 'raise-max'}
            style={{ marginTop: space.md }}
            onPress={() => run('raise-max', () => raiseMaximum(match.category, match.currentPrice))}
          />
        </View>
      ) : null}

      {/* Conversational timeline */}
      <Txt variant="small" color={colors.textFaint} style={{ marginTop: space.xl }}>
        What's happened
      </Txt>
      <View style={{ marginTop: space.sm, gap: space.sm }}>
        {match.timeline.map((m, i) => (
          <View
            key={i}
            style={[
              bubbleBase,
              m.from === 'them'
                ? { alignSelf: 'flex-start', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }
                : { alignSelf: 'flex-end', backgroundColor: colors.accentSoft },
            ]}>
            <Txt variant="small" color={m.from === 'them' ? colors.textFaint : colors.accent} style={{ marginBottom: 2 }}>
              {m.from === 'them' ? person?.name.split(' ')[0] : 'Your agent'}
            </Txt>
            <Txt variant="body">{m.text}</Txt>
          </View>
        ))}
      </View>

      {hasRoom ? (
        <Pressable
          onPress={() => run('negotiate', () => negotiateMatch(match.id))}
          style={({ pressed }) => [{ marginTop: space.xl }, pressed && { opacity: 0.85 }]}>
          <MarketMoment>
            <Txt variant="bodyStrong" color={marketField.charcoalText}>
              ${spread} of room left to negotiate
            </Txt>
            <Txt variant="small" color={marketField.charcoalTextDim} style={{ marginTop: 4 }}>
              {role === 'buyer' ? `Ask $${match.currentPrice}` : `Bid $${match.currentPrice}`} · could reach ${boundary}
            </Txt>
            <Txt variant="small" color={marketField.charcoalTextDim} style={{ marginTop: space.sm }}>
              DemandOne thinks there's room to move.
            </Txt>
            <Txt variant="smallStrong" color={marketField.charcoalText} style={{ marginTop: space.md }}>
              Continue negotiation →
            </Txt>
          </MarketMoment>
        </Pressable>
      ) : null}

      {/* Actions */}
      {match.status !== 'booked' && (
        <View style={{ marginTop: space.xl, gap: space.md }}>
          {conflict ? (
            <Txt variant="small" color={colors.accent2}>
              ⚠ Overlaps with {conflict.service} you already have booked, {conflict.when}.
            </Txt>
          ) : null}
          <Btn
            title={role === 'buyer' ? `Accept · $${match.currentPrice}` : `Accept · earn $${match.currentPrice}`}
            loading={busy === 'accept'}
            onPress={() =>
              run('accept', async () => {
                const bookingId = await acceptMatch(match.id);
                router.replace({ pathname: '/confirmation/[id]', params: { id: bookingId } });
              })
            }
          />
          {match.negotiable ? (
            <>
              <Btn
                title={
                  atBoundary
                    ? role === 'buyer'
                      ? `Already at ${person?.name.split(' ')[0] ?? 'their'}'s best price`
                      : `Already ${person?.name.split(' ')[0] ?? 'their'}'s best offer`
                    : role === 'buyer'
                      ? 'Ask your agent for a better price'
                      : 'Ask your agent to push for more'
                }
                variant="secondary"
                disabled={atBoundary}
                icon={role === 'buyer' ? 'trending-down' : 'trending-up'}
                loading={busy === 'negotiate'}
                onPress={() => run('negotiate', () => negotiateMatch(match.id))}
              />
              {atBoundary ? (
                <Txt variant="small" color={colors.textFaint} style={{ textAlign: 'center' }}>
                  {boundary !== undefined
                    ? `$${match.currentPrice} is ${role === 'buyer' ? 'their floor' : 'their ceiling'} — nothing more to move on price alone.`
                    : 'Nothing more to move on price alone.'}
                  {canTradeTiming || showRaiseMax ? ' Try one of the options below.' : ''}
                </Txt>
              ) : null}
            </>
          ) : (
            <Txt variant="small" color={colors.textFaint} style={{ textAlign: 'center' }}>
              Fixed price — nothing to negotiate.
            </Txt>
          )}
          {canTradeTiming ? (
            <Btn
              title="Offer more time for a better price"
              variant="secondary"
              icon="clock"
              loading={busy === 'trade-timing'}
              onPress={() => run('trade-timing', () => negotiateWithFlexibleTiming(match.id))}
            />
          ) : null}
        </View>
      )}

      {match.status === 'booked' && (
        <View style={{ marginTop: space.xl }}>
          <Txt variant="heading">Handled.</Txt>
          <Txt variant="small" color={colors.textDim} style={{ marginTop: 4 }}>
            Find this under Requests → Booked.
          </Txt>
          <Btn title="Go to Requests" variant="secondary" style={{ marginTop: space.lg }} onPress={() => router.replace('/matches')} />
        </View>
      )}
    </Screen>
  );
}

const bubbleBase = {
  maxWidth: '86%' as const,
  paddingHorizontal: space.lg,
  paddingVertical: space.md,
  borderRadius: 14,
};
