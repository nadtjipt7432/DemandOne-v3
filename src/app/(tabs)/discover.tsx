import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { computeFit, computeMarketValue, matchesCapability, passesHardConstraints } from '@/domain/matching';
import { isTerminal } from '@/domain/negotiation';
import { useAppState, useViewer } from '@/state/hooks';
import { AmbientField } from '@/ui/Ambient';
import { Page, Row, T, Tabs, Tap } from '@/ui/core';
import { MarketRow, OpportunityCard, type MarketStateKind } from '@/ui/market';
import { acceptListing } from '@/services/negotiation';
import { colors, space } from '@/theme';
import type { MatchCard } from '@/domain/types';

type Side = 'all' | 'need' | 'offer';

const STATUS_LABEL: Record<string, string> = {
  evaluating: 'Your agent is evaluating',
  awaiting_response: 'Your proposal is out',
  countered: 'Counteroffer received',
};

/**
 * The Exchange — open positions, ranked by the viewer's Standard of Value, with
 * demand matching their capabilities lifted. Rows stay compact; mechanics live in
 * the listing and negotiation views.
 */
export default function Exchange() {
  const router = useRouter();
  const { category } = useLocalSearchParams<{ category?: string }>();
  const s = useAppState();
  const viewer = useViewer();
  const [side, setSide] = useState<Side>('all');
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>(category);
  const [expanded, setExpanded] = useState<string | null>(null);

  const live = useMemo(() => {
    const map = new Map<string, string>();
    for (const n of Object.values(s.negotiations)) if (n.listing.cardId && !isTerminal(n)) map.set(n.listing.cardId, STATUS_LABEL[n.status] ?? 'Negotiating');
    return map;
  }, [s.negotiations]);

  const visible = useMemo(() => s.cards.filter((c) => !s.passedCardIds.includes(c.id) && passesHardConstraints(c, viewer)), [s.cards, s.passedCardIds, viewer]);

  const ranked = useMemo(() => {
    const score = (c: MatchCard) => {
      const fit = computeFit(c, viewer, s.people[c.personId]).score;
      const value = computeMarketValue(c, s.cards);
      return fit + (matchesCapability(c, viewer) ? 15 : 0) + (value.isGoodValue ? Math.min(10, value.deltaPct / 2) : 0) + (live.has(c.id) ? 30 : 0);
    };
    return visible
      .filter((c) => (side === 'all' || c.kind === side) && (!categoryFilter || c.category === categoryFilter))
      .sort((a, b) => score(b) - score(a));
  }, [visible, side, categoryFilter, viewer, s.people, s.cards, live]);

  const labelOf = (id: string) => s.categories.find((c) => c.id === id)?.label ?? id;
  const stateOf = (c: MatchCard): { text: string; live: boolean; kind: MarketStateKind } => {
    const l = live.get(c.id);
    if (l) return { text: l, live: true, kind: 'negotiating' };
    if (c.marketEvent) return { text: c.marketEvent, live: true, kind: 'available' };
    if (c.revisions?.length) return { text: 'Price revised', live: true, kind: 'available' };
    if (!c.negotiable) return { text: 'Fixed price', live: false, kind: 'available' };
    return { text: 'Available', live: false, kind: 'available' };
  };

  const accept = async (c: MatchCard) => {
    const res = await acceptListing(c.id);
    if (res.ok && res.bookingId) router.push({ pathname: '/handled/[id]', params: { id: res.bookingId } });
  };

  return (
    <Page backdrop={<AmbientField mood="searching" height={260} />}>
      <T v="display" style={{ marginTop: space.lg }}>Exchange</T>
      <T v="body" color={colors.inkDim} style={{ marginTop: space.xs }}>Ranked by your standard of value.</T>

      <View style={{ marginTop: space.lg }}>
        <Tabs<Side>
          value={side}
          onChange={setSide}
          items={[
            { key: 'all', label: 'All', count: visible.length },
            { key: 'need', label: 'Needs', count: visible.filter((c) => c.kind === 'need').length },
            { key: 'offer', label: 'Offers', count: visible.filter((c) => c.kind === 'offer').length },
          ]}
        />
      </View>

      {categoryFilter ? (
        <Row justify="space-between" style={{ paddingVertical: space.sm }}>
          <T v="small" color={colors.inkDim}>{`Showing ${labelOf(categoryFilter).toLowerCase()}`}</T>
          <Tap label="Show everything" onPress={() => setCategoryFilter(undefined)}>
            <T v="smallStrong" color={colors.forest}>Show everything</T>
          </Tap>
        </Row>
      ) : null}

      <View testID="exchange-list">
        {ranked.length === 0 ? (
          <T v="body" color={colors.inkDim} style={{ paddingVertical: space.xl }}>Nothing open here right now. Your agent will surface new positions as they appear.</T>
        ) : (
          ranked.map((c) => {
            const st = stateOf(c);
            if (expanded === c.id) {
              return (
                <OpportunityCard
                  key={c.id}
                  card={c}
                  person={s.people[c.personId]}
                  categoryLabel={labelOf(c.category)}
                  state={st.text}
                  stateKind={st.kind}
                  fitLine={`Why it ranks for you: ${computeFit(c, viewer, s.people[c.personId]).explanation[0] ?? ''}`}
                  onNegotiate={() => router.push({ pathname: '/listing/[id]', params: { id: c.id, act: 'negotiate' } })}
                  onAccept={() => accept(c)}
                  onDetails={() => router.push({ pathname: '/listing/[id]', params: { id: c.id } })}
                  onCollapse={() => setExpanded(null)}
                />
              );
            }
            return (
              <MarketRow
                key={c.id}
                card={c}
                person={s.people[c.personId]}
                categoryLabel={labelOf(c.category)}
                state={st.text}
                stateTone={st.live ? 'live' : 'quiet'}
                stateKind={st.kind}
                forYou={matchesCapability(c, viewer)}
                onOpen={() => setExpanded(c.id)}
                onAction={() => router.push({ pathname: '/listing/[id]', params: { id: c.id, act: 'negotiate' } })}
              />
            );
          })
        )}
      </View>
    </Page>
  );
}
