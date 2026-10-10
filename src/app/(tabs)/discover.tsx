import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Dimensions, Pressable, ScrollView, View } from 'react-native';
import { Chip, Divider, Row, Screen, Segmented, Txt } from '@/components/base';
import { Avatar, DiscoveryTag, FitDisclosure, TrustBadge, ValueBadge } from '@/components/domain';
import { MarketField } from '@/components/MarketField';
import { useAppState, useFit } from '@/state/hooks';
import { inferWorkCategories, WORK_LABEL } from '@/domain/intents';
import { computeFit, computeMarketValue, passesHardConstraints, timeBucket, TIME_LABEL } from '@/domain/matching';
import { likeCard, passCard } from '@/services/market';
import { colors, fontDisplay, space } from '@/theme';
import type { MatchCard } from '@/domain/types';
import type { WorkCategory } from '@/domain/intents';
import type { TimeBucket } from '@/domain/matching';

const SCREEN_WIDTH = Dimensions.get('window').width;

/** How much a strong market-value deal can lift a card above its raw fit score. */
const VALUE_BOOST_CAP = 12;

type Filter = 'all' | 'offer' | 'need';
type TimeFilter = 'anytime' | TimeBucket;
type WorkFilter = 'all' | WorkCategory;

const TIME_OPTIONS: { key: TimeFilter; label: string }[] = [
  { key: 'anytime', label: 'Anytime' },
  { key: 'now', label: TIME_LABEL.now },
  { key: 'week', label: TIME_LABEL.week },
  { key: 'month', label: TIME_LABEL.month },
  { key: 'later', label: TIME_LABEL.later },
];

const WORK_OPTIONS: { key: WorkFilter; label: string }[] = [
  { key: 'all', label: 'All work' },
  ...(Object.keys(WORK_LABEL) as WorkCategory[]).map((w) => ({ key: w, label: WORK_LABEL[w] })),
];

export default function Discover() {
  const { category: categoryParam } = useLocalSearchParams<{ category?: string }>();
  const { people, viewerId, cards, categories } = useAppState();
  const viewer = people[viewerId];
  const [filter, setFilter] = useState<Filter>('all');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('anytime');
  const [workFilter, setWorkFilter] = useState<WorkFilter>('all');
  // Not a visible chip row — set only by a drill-in link from Universal Intent Search
  // (/intent-results), so that "View" on a specific category still narrows to it without
  // resurrecting a raw-category taxonomy as a top-level filter control.
  const [taskFilter, setTaskFilter] = useState<string[]>(categoryParam ? [categoryParam] : []);
  const categoryById = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories]);

  useEffect(() => {
    if (categoryParam) setTaskFilter([categoryParam]);
  }, [categoryParam]);

  const anyFilterActive = filter !== 'all' || timeFilter !== 'anytime' || workFilter !== 'all' || taskFilter.length > 0;
  const clearFilters = () => {
    setFilter('all');
    setTimeFilter('anytime');
    setWorkFilter('all');
    setTaskFilter([]);
  };

  // Filters narrow which part of the live market is in view — they never replace the
  // recommendation engine. Within whatever's left, ranking is still entirely
  // computeFit/computeMarketValue, same as an unfiltered Exchange. Price is
  // deliberately not a filter dimension here: it's part of the clearing mechanism
  // (budget/floor/ceiling/negotiation authority), not a discovery knob — see
  // negotiateMatch in service.ts and the mandate fields in intent-results.tsx.
  // Timing is the one hard constraint: if you have an active need/offer in a card's
  // category, its window must actually overlap yours, no matter how good the rest of
  // the fit or the price is — see passesHardConstraints. The Time filter below is a
  // separate, coarser browsing grouping (timeBucket), not that gate.
  const ranked = useMemo(() => {
    const kindPool = filter === 'all' ? cards : cards.filter((c) => c.kind === filter);
    const taskPool = taskFilter.length === 0 ? kindPool : kindPool.filter((c) => taskFilter.includes(c.category));
    const timePool = timeFilter === 'anytime' ? taskPool : taskPool.filter((c) => timeBucket(c.window) === timeFilter);
    const workPool =
      workFilter === 'all' ? timePool : timePool.filter((c) => inferWorkCategories(`${c.title} ${c.description}`, c.category).includes(workFilter));
    const pool = workPool.filter((c) => passesHardConstraints(c, viewer));
    const scoreOf = (c: MatchCard) => {
      const fit = computeFit(c, viewer, people[c.personId]).score;
      const value = computeMarketValue(c, categoryById[c.category]);
      const boost = value.isGoodValue ? Math.min(VALUE_BOOST_CAP, value.deltaPct / 2) : 0;
      return fit + boost;
    };
    return [...pool].sort((a, b) => scoreOf(b) - scoreOf(a));
  }, [cards, filter, taskFilter, timeFilter, workFilter, viewer, people, categoryById]);

  // "3 advisory opportunities worth seeing" rather than a raw, chronological list —
  // the filters describe a slice of the market; this says what DemandOne found in it.
  const summaryLine = useMemo(() => {
    if (!anyFilterActive || ranked.length === 0) return null;
    const workWord = workFilter !== 'all' ? `${WORK_LABEL[workFilter].toLowerCase()} ` : '';
    const sideWord = filter === 'need' ? 'requests' : 'opportunities';
    return `${ranked.length} ${workWord}${sideWord} worth seeing`;
  }, [anyFilterActive, ranked.length, filter, workFilter]);

  return (
    <Screen scroll padded={false}>
      <View style={{ paddingHorizontal: space.lg }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt variant="title" style={{ marginTop: space.sm }}>
            Exchange
          </Txt>
          {anyFilterActive ? (
            <Pressable onPress={clearFilters}>
              <Txt variant="small" color={colors.accent}>
                Clear filters
              </Txt>
            </Pressable>
          ) : null}
        </Row>
        <Txt variant="small" color={colors.textFaint} style={{ marginTop: space.xs }}>
          {summaryLine ?? 'Ranked best fit first — compare a few before you act on any of them.'}
        </Txt>

        <View style={{ marginTop: space.lg }}>
          <Segmented
            items={[
              { key: 'all', label: 'All' },
              { key: 'need', label: 'Needs' },
              { key: 'offer', label: 'Offers' },
            ]}
            value={filter}
            onChange={(k) => setFilter(k as Filter)}
          />
        </View>
      </View>

      <MarketField width={SCREEN_WIDTH} height={30} dotCount={140} style={{ marginTop: space.md }} />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.md }}>
        {TIME_OPTIONS.map((o) => (
          <Chip key={o.key} label={o.label} active={timeFilter === o.key} onPress={() => setTimeFilter(o.key)} />
        ))}
      </ScrollView>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.md }}>
        {WORK_OPTIONS.map((o) => (
          <Chip key={o.key} label={o.label} active={workFilter === o.key} onPress={() => setWorkFilter(o.key)} />
        ))}
      </ScrollView>

      <View style={{ paddingHorizontal: space.lg }}>
        {ranked.length === 0 ? (
          <Txt variant="small" color={colors.textDim} style={{ paddingVertical: space.md }}>
            Nothing here right now. Your agent is still watching.
          </Txt>
        ) : (
          ranked.map((card, i) => (
            <View key={card.id}>
              {i > 0 ? <Divider /> : null}
              <DirectoryRow card={card} />
            </View>
          ))
        )}
      </View>
    </Screen>
  );
}

function DirectoryRow({ card }: { card: MatchCard }) {
  const router = useRouter();
  const { people, viewerId, categories } = useAppState();
  const person = people[card.personId];
  const fit = useFit(card);
  const category = categories.find((c) => c.id === card.category);
  const value = computeMarketValue(card, category);
  const isDiscovery = !people[viewerId].categories.includes(card.category);
  const [busy, setBusy] = useState<'like' | 'pass' | null>(null);

  const openDetail = () => router.push({ pathname: '/card/[id]', params: { id: card.id } });

  const like = async () => {
    setBusy('like');
    const matchId = await likeCard(card.id);
    setBusy(null);
    if (matchId) router.push({ pathname: '/match/[id]', params: { id: matchId } });
  };

  const pass = async () => {
    setBusy('pass');
    await passCard(card.id);
    setBusy(null);
  };

  return (
    <View style={{ paddingVertical: space.lg }}>
      <Pressable onPress={openDetail} style={({ pressed }) => pressed && { opacity: 0.6 }}>
        <Txt variant="label" color={card.kind === 'need' ? colors.accent : colors.accent2}>
          {card.kind === 'need' ? 'NEED' : 'OFFER'}
        </Txt>

        {/* Title + price are the two things actually worth scanning first — everything else is quieter on purpose. */}
        <Row style={{ justifyContent: 'space-between', marginTop: 4, alignItems: 'flex-start' }}>
          <Txt variant="heading" numberOfLines={1} style={{ flex: 1, marginRight: space.sm }}>
            {card.title}
          </Txt>
          <View style={{ alignItems: 'flex-end' }}>
            <Txt style={{ fontFamily: fontDisplay, fontSize: 22, color: colors.text, lineHeight: 26 }}>${card.price}</Txt>
            <Txt variant="label" color={colors.textFaint}>
              {card.kind === 'offer' ? 'ask' : 'budget'}
            </Txt>
          </View>
        </Row>

        <Row gap={6} style={{ marginTop: space.xs }}>
          <Avatar initials={person.initials} size={18} />
          <Txt variant="small" color={colors.textDim} numberOfLines={1}>
            {person.name} · <TrustBadge tier={person.tier} />
          </Txt>
        </Row>

        <Txt variant="small" color={colors.textFaint} style={{ marginTop: space.sm }} numberOfLines={1}>
          {card.description}
        </Txt>

        <Txt variant="label" color={colors.textFaint} style={{ marginTop: space.sm }}>
          {card.window.label} · {person.completedCount} completed · {person.recommendCount} recommend
        </Txt>

        {value.isGoodValue || card.urgencyNote || isDiscovery ? (
          <Row gap={space.md} style={{ marginTop: space.xs, flexWrap: 'wrap' }}>
            {isDiscovery ? <DiscoveryTag /> : null}
            {value.isGoodValue ? <ValueBadge value={value} /> : null}
            {card.urgencyNote ? (
              <Txt variant="small" color={colors.accent2}>
                {card.urgencyNote}
              </Txt>
            ) : null}
          </Row>
        ) : null}

        {fit ? (
          <View style={{ marginTop: space.sm }}>
            <FitDisclosure fit={fit} label="Why this is in your market" />
          </View>
        ) : null}
      </Pressable>

      <Row style={{ justifyContent: 'flex-end', marginTop: space.md }} gap={space.lg}>
        <Pressable onPress={pass} disabled={busy !== null}>
          <Txt variant="smallStrong" color={busy === 'pass' ? colors.textFaint : colors.textDim}>
            Pass
          </Txt>
        </Pressable>
        <Pressable onPress={like} disabled={busy !== null}>
          <Txt variant="smallStrong" color={busy === 'like' ? colors.textFaint : colors.accent}>
            Interested
          </Txt>
        </Pressable>
      </Row>
    </View>
  );
}
