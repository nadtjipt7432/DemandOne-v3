import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { Btn, Card, Divider, Row, Screen, Txt } from '@/components/base';
import { Avatar, Header, TrustBadge } from '@/components/domain';
import { useAppState, useViewer } from '@/state/hooks';
import { computeFit, findScheduleConflict, windowsFit } from '@/domain/matching';
import { FEE_DISCLOSURE } from '@/domain/pricing';
import { keepWatching, likeCard, secureCard } from '@/services/market';
import { colors, radius, space } from '@/theme';
import type { MatchCard, Person } from '@/domain/types';

/**
 * The proof layer (§3/§4 of the trust revision): qualification + trust evidence, kept
 * out of the main card and behind one tap — "DemandOne ranks internally and shows
 * evidence externally," not a résumé the user has to read to decide.
 */
function ProofDisclosure({ person }: { person: Person }) {
  const [open, setOpen] = useState(false);
  const [requested, setRequested] = useState(false);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={({ pressed }) => pressed && { opacity: 0.6 }}>
        <Txt variant="small" color={colors.accent}>
          View proof
        </Txt>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(32,31,27,0.5)', alignItems: 'center', justifyContent: 'center', padding: space.lg }}
          onPress={() => setOpen(false)}>
          <Pressable onPress={() => {}}>
            <Card style={{ width: 340, maxWidth: '100%' }}>
              <Txt variant="heading">{person.name}</Txt>
              <Txt variant="small" color={colors.textDim} style={{ marginTop: 4 }}>
                {person.bio}
              </Txt>
              <Divider style={{ marginVertical: space.lg }} />
              <Txt variant="small" color={colors.textFaint}>
                DemandOne transaction history
              </Txt>
              <Txt variant="body" style={{ marginTop: 2 }}>
                {person.completedCount} completed · {person.recommendCount} would work with them again
              </Txt>
              {person.trustPaths > 0 ? (
                <Txt variant="small" color={colors.textDim} style={{ marginTop: space.sm }}>
                  {person.trustPaths} {person.trustPaths === 1 ? 'person' : 'people'} in your network have worked with them
                </Txt>
              ) : null}
              {person.reference ? (
                <View style={{ marginTop: space.md, padding: space.md, backgroundColor: colors.surface2, borderRadius: radius.surface }}>
                  <Txt variant="smallStrong">{person.reference.name} worked with them</Txt>
                  <Txt variant="small" color={colors.textFaint} style={{ marginTop: 2 }}>
                    {person.reference.context}
                  </Txt>
                  <Row style={{ justifyContent: 'space-between', marginTop: space.sm }}>
                    <Txt variant="small" color={colors.accent}>
                      {person.reference.recommends ? 'Recommends them' : ''}
                    </Txt>
                    <Pressable onPress={() => setRequested(true)} disabled={requested}>
                      <Txt variant="small" color={requested ? colors.textFaint : colors.accent}>
                        {requested ? 'Reference requested ✓' : 'Request reference'}
                      </Txt>
                    </Pressable>
                  </Row>
                </View>
              ) : null}
              <Btn title="Got it" variant="secondary" style={{ marginTop: space.xl }} onPress={() => setOpen(false)} />
            </Card>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

/**
 * The magic moment: say what you need, and within moments see up to three real,
 * ranked, already-priced options — never more than three, each answering why this,
 * what it costs, and what happens next. No market math on screen; the ranking is the
 * same `computeFit` engine that powers the Exchange, just narrowed to one ask.
 */
export default function Recommendations() {
  const router = useRouter();
  const { id: targetId, mode } = useLocalSearchParams<{ id: string; mode: 'need' | 'offer' }>();
  const { people, cards, bookings } = useAppState();
  const viewer = useViewer();
  const [busy, setBusy] = useState<string | null>(null);

  const target = mode === 'need' ? viewer.needs.find((n) => n.id === targetId) : viewer.offers.find((o) => o.id === targetId);

  const matches = useMemo(() => {
    if (!target) return [];
    const complementKind = mode === 'need' ? 'offer' : 'need';
    // Timing is a hard constraint here, not a preference: this is one specific mission
    // with one real window, so anything that doesn't actually fit isn't a candidate.
    const pool = cards.filter(
      (c) => c.category === target.category && c.kind === complementKind && windowsFit(target.window, c.window)
    );
    const orderOverride = target.priorities?.length ? target.priorities : undefined;
    return pool
      .map((card) => ({ card, fit: computeFit(card, viewer, people[card.personId], orderOverride) }))
      .sort((a, b) => b.fit.score - a.fit.score)
      .slice(0, 3);
  }, [target, mode, cards, viewer, people]);

  if (!target) {
    return (
      <Screen>
        <Header onBack={() => router.back()} title="Recommendations" />
        <Txt variant="body" color={colors.textDim}>
          This request is no longer active.
        </Txt>
      </Screen>
    );
  }

  const approve = async (card: MatchCard) => {
    setBusy(card.id);
    const bookingId = await secureCard(card.id);
    setBusy(null);
    router.replace({ pathname: '/confirmation/[id]', params: { id: bookingId } });
  };

  const negotiate = async (card: MatchCard) => {
    setBusy(card.id);
    const matchId = await likeCard(card.id);
    setBusy(null);
    if (matchId) router.replace({ pathname: '/match/[id]', params: { id: matchId } });
  };

  const watch = async () => {
    setBusy('watch');
    await keepWatching(mode, targetId);
    setBusy(null);
    router.replace('/today');
  };

  return (
    <Screen scroll>
      <Header onBack={() => router.back()} title="Your agent found this" />

      <Txt variant="title" style={{ marginTop: space.sm }}>
        {mode === 'need' ? 'Looking for' : 'Offering'}: {target.title}
      </Txt>

      {matches.length === 0 ? (
        <View style={{ marginTop: space.xl }}>
          <Txt variant="body" color={colors.textDim}>
            Nothing clears the bar right now — no good options nearby, in your window, at a fair price.
          </Txt>
          <Txt variant="small" color={colors.textDim} style={{ marginTop: space.sm }}>
            Nothing fits yet. DemandOne can keep watching.
          </Txt>
          <Btn
            title="Keep an eye out for me"
            icon="eye"
            loading={busy === 'watch'}
            style={{ marginTop: space.lg }}
            onPress={watch}
          />
          <Txt variant="small" color={colors.textFaint} style={{ marginTop: space.sm }}>
            We'll keep looking until {target.timing?.deadlineLabel ?? 'the market lines up'} or until you cancel.
          </Txt>
        </View>
      ) : (
        <>
          <Txt variant="small" color={colors.textDim} style={{ marginTop: space.xs }}>
            {matches.length} option{matches.length === 1 ? '' : 's'}, ranked for you.
          </Txt>

          <View style={{ marginTop: space.lg }}>
            {matches.map(({ card, fit }, i) => {
              const person = people[card.personId];
              return (
                <View key={card.id}>
                  {i > 0 ? <Divider /> : null}
                  <View style={{ paddingVertical: space.lg }}>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <Row gap={space.md} style={{ flex: 1 }}>
                        <Avatar initials={person.initials} />
                        <View style={{ flex: 1 }}>
                          <Txt variant="bodyStrong">{person.name}</Txt>
                          <Row gap={4}>
                            <TrustBadge tier={person.tier} />
                            <Txt variant="small" color={colors.textFaint}>
                              · {card.distanceMi} mi · {card.window.label}
                            </Txt>
                          </Row>
                        </View>
                      </Row>
                      <Txt variant="heading">${card.price}</Txt>
                    </Row>

                    <Txt variant="small" color={colors.textDim} style={{ marginTop: space.sm }}>
                      {person.bio}
                    </Txt>
                    <Txt variant="small" color={colors.textFaint} style={{ marginTop: 2 }}>
                      {person.completedCount} completed · {person.recommendCount} recommend · Available {card.window.label}
                    </Txt>

                    <Txt variant="smallStrong" color={colors.textDim} style={{ marginTop: space.md }}>
                      Why {person.name.split(' ')[0]}
                    </Txt>
                    <Txt variant="small" color={colors.textDim} style={{ marginTop: 2 }}>
                      {fit.explanation.join(' · ')}
                    </Txt>

                    {mode === 'need' && card.negotiable && card.floorPrice && card.floorPrice < card.price ? (
                      <Txt variant="smallStrong" color={colors.accent2} style={{ marginTop: space.sm }}>
                        Your agent could get this down to ~${card.floorPrice}
                      </Txt>
                    ) : null}
                    {mode === 'offer' && card.negotiable && card.ceilingPrice && card.ceilingPrice > card.price ? (
                      <Txt variant="smallStrong" color={colors.accent2} style={{ marginTop: space.sm }}>
                        Your agent could push this up to ~${card.ceilingPrice}
                      </Txt>
                    ) : null}

                    {(() => {
                      const conflict = findScheduleConflict(card.window, bookings);
                      return conflict ? (
                        <Txt variant="small" color={colors.accent2} style={{ marginTop: space.sm }}>
                          ⚠ Overlaps with {conflict.service} you already have booked, {conflict.when}.
                        </Txt>
                      ) : null;
                    })()}

                    <View style={{ marginTop: space.sm }}>
                      <ProofDisclosure person={person} />
                    </View>

                    <Row gap={space.md} style={{ marginTop: space.md }}>
                      <Btn
                        title={`Approve · $${card.price}`}
                        loading={busy === card.id}
                        style={{ flex: 1, height: 48 }}
                        onPress={() => approve(card)}
                      />
                      {card.negotiable ? (
                        <Btn
                          title="Negotiate"
                          variant="secondary"
                          icon={mode === 'need' ? 'trending-down' : 'trending-up'}
                          loading={busy === card.id}
                          style={{ height: 48, paddingHorizontal: space.lg }}
                          onPress={() => negotiate(card)}
                        />
                      ) : null}
                    </Row>
                  </View>
                </View>
              );
            })}
          </View>

          <Txt variant="small" color={colors.textFaint} style={{ marginTop: space.md }}>
            Approve and it's booked, nothing more to do. Negotiate and your agent asks for a better
            price first — either way, nothing charges until you approve. {FEE_DISCLOSURE}
          </Txt>
        </>
      )}
    </Screen>
  );
}
