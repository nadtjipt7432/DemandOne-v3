import Feather from '@expo/vector-icons/Feather';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import type { ReactNode } from 'react';
import { Divider, Row, Screen, Txt } from '@/components/base';
import { Avatar, MarketMoment, StatusDot } from '@/components/domain';
import { useAppState } from '@/state/hooks';
import { computeFit, computeMarketValue, passesHardConstraints } from '@/domain/matching';
import {
  getAgentActivity,
  getCapabilityOpportunities,
  getDecisions,
  getMarketFavor,
  getNetworkRelevance,
  getPortfolio,
  getTimingOpportunities,
} from '@/state/myMarket';
import { getCalendarNudge } from '@/infra/calendar';
import { colors, marketField, radius, space } from '@/theme';

const VALUE_BOOST_CAP = 12;

/**
 * Home = "My Market": the viewer's live position in the exchange, not a feed. Each
 * block below is computed in data/myMarket.ts and hidden entirely when it has
 * nothing to say — this screen just renders whichever subset actually applies,
 * roughly in order of how much it matters right now.
 */
export default function Today() {
  const router = useRouter();
  const { people, viewerId, cards, matches, categories } = useAppState();
  const viewer = people[viewerId];
  const categoryById = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories]);

  const decisions = useMemo(() => getDecisions(matches, people, viewer), [matches, people, viewer]);
  const portfolio = useMemo(() => getPortfolio(viewer, matches, cards), [viewer, matches, cards]);
  const timingOpportunities = useMemo(() => getTimingOpportunities(viewer, cards), [viewer, cards]);
  const favors = useMemo(() => getMarketFavor(viewer, matches, cards, people, categories), [viewer, matches, cards, people, categories]);
  const activityLines = useMemo(() => getAgentActivity(viewer, matches, cards), [viewer, matches, cards]);
  const capabilityOpportunities = useMemo(() => getCapabilityOpportunities(viewer, cards, categories), [viewer, cards, categories]);
  const networkLine = useMemo(() => getNetworkRelevance(matches, people), [matches, people]);
  const nudge = useMemo(() => getCalendarNudge(), []);

  // Market pulse — secondary and compact on purpose, the only section that's always
  // visible regardless of what else is going on.
  const pulse = useMemo(() => {
    return cards
      .filter((card) => passesHardConstraints(card, viewer))
      .map((card) => ({
        card,
        fit: computeFit(card, viewer, people[card.personId]),
        value: computeMarketValue(card, categoryById[card.category]),
      }))
      .sort((a, b) => {
        const boostA = a.value.isGoodValue ? Math.min(VALUE_BOOST_CAP, a.value.deltaPct / 2) : 0;
        const boostB = b.value.isGoodValue ? Math.min(VALUE_BOOST_CAP, b.value.deltaPct / 2) : 0;
        return b.fit.score + boostB - (a.fit.score + boostA);
      })
      .slice(0, 2);
  }, [cards, viewer, people, categoryById]);

  // Sections show/hide dynamically (per the "My Market" design — nothing permanent,
  // nothing empty), so a divider between them can't be hardcoded in JSX; this tracks
  // which section is first-shown so only genuine section BREAKS get a rule, never a
  // stray one sitting right under the header.
  let anySectionShown = false;
  const section = (content: ReactNode) => {
    const isFirst = !anySectionShown;
    anySectionShown = true;
    return (
      <View style={{ marginTop: isFirst ? space.xl : 0 }}>
        {!isFirst ? <Divider style={{ marginBottom: space.xl }} /> : null}
        {content}
      </View>
    );
  };

  return (
    <Screen scroll>
      <Row style={{ justifyContent: 'space-between', marginTop: space.sm }}>
        <Txt variant="small" color={colors.textFaint}>
          {viewer.location.split(',')[0]}
        </Txt>
        <Avatar initials={viewer.initials} size={36} />
      </Row>

      {/* 1. Decisions waiting for me — a real spread gets the dark editorial panel; everything else stays on the normal cream row. */}
      {decisions.length > 0 &&
        section(
          <View style={{ gap: space.sm }}>
            <Txt variant="heading">Needs your decision</Txt>
            {decisions.map((d) =>
              d.tension ? (
                <Pressable
                  key={d.match.id}
                  onPress={() => router.push({ pathname: '/match/[id]', params: { id: d.match.id } })}
                  style={({ pressed }) => pressed && { opacity: 0.85 }}>
                  <MarketMoment>
                    <Txt variant="bodyStrong" color={marketField.charcoalText}>
                      ${d.tension.spread} separates you
                    </Txt>
                    <Txt variant="small" color={marketField.charcoalTextDim} style={{ marginTop: 4 }}>
                      {d.tension.yourLabel} ${d.tension.yourAmount} · {d.tension.theirLabel} ${d.tension.theirAmount}
                    </Txt>
                    <Txt variant="small" color={marketField.charcoalTextDim} style={{ marginTop: space.sm }}>
                      DemandOne thinks there's room to move.
                    </Txt>
                    <Txt variant="smallStrong" color={marketField.charcoalText} style={{ marginTop: space.md }}>
                      Continue negotiation →
                    </Txt>
                  </MarketMoment>
                </Pressable>
              ) : (
                <Pressable
                  key={d.match.id}
                  onPress={() => router.push({ pathname: '/match/[id]', params: { id: d.match.id } })}
                  style={({ pressed }) => [{ paddingVertical: space.sm }, pressed && { opacity: 0.6 }]}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <View style={{ flex: 1 }}>
                      <Txt variant="bodyStrong">{d.headline}</Txt>
                      {d.favorable ? (
                        <Txt variant="small" color={colors.accent} style={{ marginTop: 2 }}>
                          Already within your range
                        </Txt>
                      ) : null}
                    </View>
                    <Txt variant="heading">${d.match.currentPrice}</Txt>
                  </Row>
                </Pressable>
              )
            )}
          </View>
        )}

      {/* 2. What I currently have in the market */}
      {portfolio.length > 0 &&
        section(
          <View>
            <Txt variant="heading">What you have in the market</Txt>
            <View style={{ marginTop: space.sm }}>
              {portfolio.map((p, i) => (
                <View key={p.id}>
                  {i > 0 ? <Divider /> : null}
                  <Pressable
                    onPress={() => router.push({ pathname: '/recommendations', params: { id: p.id, mode: p.kind } })}
                    style={({ pressed }) => [{ paddingVertical: space.md }, pressed && { opacity: 0.6 }]}>
                    <Row gap={6}>
                      <Txt variant="label" color={p.kind === 'need' ? colors.accent : colors.accent2}>
                        {p.kind === 'need' ? 'NEED' : 'OFFER'}
                      </Txt>
                      <Txt variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
                        {p.title}
                      </Txt>
                    </Row>
                    <Txt variant="small" color={colors.textFaint} style={{ marginTop: 2 }}>
                      {p.matchCount} match{p.matchCount === 1 ? '' : 'es'}
                      {p.negotiatingCount > 0 ? ` · ${p.negotiatingCount} negotiating` : ''}
                      {p.watching ? ' · standing' : ''}
                    </Txt>
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
        )}

      {/* 3. Almost-clearable — timing near-misses */}
      {timingOpportunities.length > 0 &&
        section(
          <View style={{ gap: space.sm }}>
            {timingOpportunities.map((t) => (
              <Pressable
                key={t.id}
                onPress={() => router.push({ pathname: '/recommendations', params: { id: t.id, mode: t.kind } })}
                style={({ pressed }) => pressed && { opacity: 0.6 }}>
                <Row
                  gap={space.sm}
                  style={{ backgroundColor: colors.surface2, borderRadius: radius.surface, padding: space.md, alignItems: 'flex-start' }}>
                  <Feather name="clock" size={16} color={colors.accent2} style={{ marginTop: 2 }} />
                  <Txt variant="small" color={colors.textDim} style={{ flex: 1 }}>
                    Widening your {t.title.toLowerCase()} window by about 2 days could unlock {t.unlockCount} more match
                    {t.unlockCount === 1 ? '' : 'es'}.
                  </Txt>
                </Row>
              </Pressable>
            ))}
          </View>
        )}

      {/* 4. Where the market moved in my favor */}
      {(favors.length > 0 || !!networkLine) &&
        section(
          <View>
            {favors.length > 0 ? (
              <>
                <Txt variant="heading">Working in your favor</Txt>
                <View style={{ marginTop: space.sm, gap: space.sm }}>
                  {favors.map((f) => (
                    <Pressable
                      key={f.cardId}
                      onPress={() => router.push({ pathname: '/card/[id]', params: { id: f.cardId } })}
                      style={({ pressed }) => pressed && { opacity: 0.6 }}>
                      <Txt variant="small" color={colors.textDim}>
                        <Txt variant="smallStrong" color={colors.text}>
                          {f.personName}'s {f.title.toLowerCase()}
                        </Txt>{' '}
                        is {f.valueLabel} — worth a look for your {f.forTitle.toLowerCase()}.
                      </Txt>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}
            {networkLine ? (
              <Txt variant="small" color={colors.textFaint} style={{ marginTop: favors.length > 0 ? space.sm : 0 }}>
                {networkLine}
              </Txt>
            ) : null}
          </View>
        )}

      {/* 5. What DemandOne is doing for me */}
      {activityLines.length > 0 &&
        section(
          <View>
            <Txt variant="heading">What your agent's doing</Txt>
            <View style={{ marginTop: space.sm, gap: space.sm }}>
              {activityLines.map((line) => (
                <Row key={line} gap={space.sm}>
                  <StatusDot color={colors.accent} />
                  <Txt variant="small" color={colors.textDim}>
                    {line}
                  </Txt>
                </Row>
              ))}
            </View>
          </View>
        )}

      {/* 5b. Opportunities for what your capability profile says you offer */}
      {capabilityOpportunities.length > 0 &&
        section(
          <View>
            <Txt variant="heading">Opportunities for what you offer</Txt>
            <View style={{ marginTop: space.sm, gap: space.sm }}>
              {capabilityOpportunities.map((o) => (
                <Pressable
                  key={o.categoryId}
                  onPress={() => router.push({ pathname: '/intent-results', params: { text: viewer.capability?.summary ?? '' } })}
                  style={({ pressed }) => pressed && { opacity: 0.6 }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Txt variant="small" color={colors.textDim} style={{ flex: 1 }}>
                      {o.needCount} {o.needCount === 1 ? 'person' : 'people'} need {o.categoryLabel.toLowerCase()} help — you mentioned this.
                    </Txt>
                    <Feather name="chevron-right" size={16} color={colors.textFaint} />
                  </Row>
                </Pressable>
              ))}
            </View>
          </View>
        )}

      {/* 6. Create new demand or supply — the universal intent box */}
      {section(
        <Pressable
          onPress={() => router.push({ pathname: '/ask', params: { autoListen: 'true' } })}
          style={({ pressed }) => pressed && { opacity: 0.7 }}>
          <Row
            gap={space.md}
            style={{
              backgroundColor: colors.accentSoft,
              borderRadius: radius.surface,
              paddingVertical: space.md,
              paddingHorizontal: space.lg,
              alignItems: 'flex-start',
            }}>
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: radius.pill,
                backgroundColor: colors.accent,
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 2,
              }}>
              <Feather name="mic" size={15} color={colors.accentText} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt variant="bodyStrong" color={colors.accent}>
                {nudge.prompt}
              </Txt>
              <Txt variant="small" color={colors.textDim} style={{ marginTop: 2 }}>
                {nudge.sub}
              </Txt>
            </View>
            <Feather name="chevron-right" size={18} color={colors.accent} style={{ marginTop: 6 }} />
          </Row>
        </Pressable>
      )}

      {/* 8. Market pulse — secondary, compact, always here */}
      {section(
        <View>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="heading">Also happening in the Exchange</Txt>
            <Pressable onPress={() => router.navigate('/discover')}>
              <Txt variant="small" color={colors.accent}>
                See all
              </Txt>
            </Pressable>
          </Row>
          <View style={{ marginTop: space.sm }}>
            {pulse.length === 0 ? (
              <Txt variant="small" color={colors.textFaint} style={{ paddingVertical: space.sm }}>
                Nothing new right now. Your agent is still watching.
              </Txt>
            ) : (
              pulse.map((p, i) => (
                <View key={p.card.id}>
                  {i > 0 ? <Divider /> : null}
                  <Pressable
                    onPress={() => router.push({ pathname: '/card/[id]', params: { id: p.card.id } })}
                    style={({ pressed }) => [{ paddingVertical: space.sm }, pressed && { opacity: 0.6 }]}>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <Txt variant="small" color={colors.textDim} numberOfLines={1} style={{ flex: 1 }}>
                        {p.card.title} · {people[p.card.personId].name.split(' ')[0]}
                      </Txt>
                      <Txt variant="smallStrong">${p.card.price}</Txt>
                    </Row>
                  </Pressable>
                </View>
              ))
            )}
          </View>
        </View>
      )}
    </Screen>
  );
}
