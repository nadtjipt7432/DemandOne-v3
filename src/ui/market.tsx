/**
 * Market components. One anatomy for every position in the exchange:
 * market identity → economics → market state → counterparty evidence → action.
 * Instruments (spread strip, step history, capacity bar) appear only when the
 * data behind them is real; nothing here ever shows a private limit.
 */
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { formatMoney } from '@/domain/money';
import { UNIT_LABEL } from '@/domain/terms';
import type { CardKind, ListingCapacity, MatchCard, Person, PriceUnit } from '@/domain/types';
import { colors, space } from '@/theme';
import { Row, T, Tap } from './core';
import { Icon } from './Icon';

/* ---------------------------------------------------------------- marks */

/** Need = forest square, Offer = amber disc. Same shapes everywhere. */
export function SideMark({ kind, size = 8 }: { kind: CardKind; size?: number }) {
  return (
    <View
      accessibilityLabel={kind === 'need' ? 'Need' : 'Offer'}
      style={{ width: size, height: size, backgroundColor: kind === 'need' ? colors.forest : colors.amber, borderRadius: kind === 'need' ? 1 : size / 2 }}
    />
  );
}

export function SideLabel({ kind, detail }: { kind: CardKind; detail?: string }) {
  return (
    <Row gap={6}>
      <SideMark kind={kind} />
      <T v="label" color={kind === 'need' ? colors.forest : colors.amberText}>{kind === 'need' ? 'Need' : 'Offer'}</T>
      {detail ? <T v="label" color={colors.inkDim}>{detail}</T> : null}
    </Row>
  );
}

export function Price({ amount, unit, caption, align = 'right', large = false }: { amount: number; unit?: PriceUnit; caption?: string; align?: 'left' | 'right'; large?: boolean }) {
  return (
    <View style={{ alignItems: align === 'right' ? 'flex-end' : 'flex-start' }}>
      <T v={large ? 'priceLarge' : 'price'}>{formatMoney(amount)}</T>
      <T v="label" color={colors.inkFaint}>{caption ?? (unit ? UNIT_LABEL[unit] : '')}</T>
    </View>
  );
}

/* ----------------------------------------------------------- instruments */

export function CapacityBar({ capacity, width = 64 }: { capacity: ListingCapacity; width?: number }) {
  const pct = capacity.total > 0 ? capacity.remaining / capacity.total : 0;
  return (
    <View accessibilityLabel={`${capacity.remaining} of ${capacity.total} ${capacity.unit} left`} style={{ width, height: 3, backgroundColor: colors.sunk }}>
      <View style={{ width: `${Math.round(pct * 100)}%`, height: 3, backgroundColor: colors.amber }} />
    </View>
  );
}

/**
 * Bid/ask strip for a live position: where each side stands now, where each
 * opened, and the gap between. Positions animate when a side moves.
 */
export function SpreadStrip({ bid, ask, openingBid, openingAsk }: { bid: number; ask: number; openingBid?: number; openingAsk?: number }) {
  const lo = Math.min(bid, ask, openingBid ?? bid, openingAsk ?? ask);
  const hi = Math.max(bid, ask, openingBid ?? bid, openingAsk ?? ask);
  const span = Math.max(1, hi - lo);
  const pos = (v: number) => ((v - lo) / span) * 100;
  const reduced = useReducedMotion();
  const bidX = useSharedValue(pos(bid));
  const askX = useSharedValue(pos(ask));
  useEffect(() => {
    const cfg = { duration: reduced ? 0 : 700, easing: Easing.out(Easing.cubic) };
    bidX.value = withTiming(pos(bid), cfg);
    askX.value = withTiming(pos(ask), cfg);
  });
  const bidStyle = useAnimatedStyle(() => ({ left: `${bidX.value}%` }));
  const askStyle = useAnimatedStyle(() => ({ left: `${askX.value}%` }));
  const gapStyle = useAnimatedStyle(() => ({ left: `${Math.min(bidX.value, askX.value)}%`, width: `${Math.abs(askX.value - bidX.value)}%` }));
  return (
    <View accessibilityLabel={`Bid ${formatMoney(bid)}, ask ${formatMoney(ask)}, ${formatMoney(Math.abs(ask - bid))} apart`} style={{ height: 26, marginHorizontal: 6 }}>
      <View style={{ position: 'absolute', left: 0, right: 0, top: 12, height: 1, backgroundColor: colors.rule }} />
      <Animated.View style={[{ position: 'absolute', top: 9, height: 7, borderRadius: 4, backgroundColor: colors.amberSoft }, gapStyle]} />
      {openingBid !== undefined && openingBid !== bid ? <View style={{ position: 'absolute', top: 8, left: `${pos(openingBid)}%`, marginLeft: -4, width: 9, height: 9, borderRadius: 5, borderWidth: 1.5, borderColor: colors.forest }} /> : null}
      {openingAsk !== undefined && openingAsk !== ask ? <View style={{ position: 'absolute', top: 8, left: `${pos(openingAsk)}%`, marginLeft: -4, width: 9, height: 9, borderRadius: 5, borderWidth: 1.5, borderColor: colors.amber }} /> : null}
      <Animated.View style={[{ position: 'absolute', top: 6, marginLeft: -6, width: 13, height: 13, borderRadius: 7, backgroundColor: colors.forest, borderWidth: 2, borderColor: colors.bg }, bidStyle]} />
      <Animated.View style={[{ position: 'absolute', top: 6, marginLeft: -6, width: 13, height: 13, borderRadius: 7, backgroundColor: colors.amber, borderWidth: 2, borderColor: colors.bg }, askStyle]} />
    </View>
  );
}

/** Step chart of proposals actually made — one step per proposal, nothing interpolated. */
export function StepHistory({ buyer, seller, width = 320, height = 96 }: { buyer: number[]; seller: number[]; width?: number; height?: number }) {
  const all = [...buyer, ...seller];
  if (buyer.length + seller.length < 3) return null;
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const pad = 8;
  const y = (v: number) => pad + (1 - (v - lo) / Math.max(1, hi - lo)) * (height - pad * 2);
  const steps = Math.max(buyer.length, seller.length);
  const x = (i: number) => (i / Math.max(1, steps)) * (width - 12);
  const path = (vals: number[]) => vals.reduce((d, v, i) => d + (i === 0 ? `M0 ${y(v)}` : ` H${x(i)} V${y(v)}`), '') + ` H${width - 12}`;
  const lastB = buyer[buyer.length - 1];
  const lastS = seller[seller.length - 1];
  return (
    <View accessibilityLabel={`Bids ${buyer.map(formatMoney).join(', ')}. Asks ${seller.map(formatMoney).join(', ')}.`}>
      <Svg width={width} height={height}>
        <Line x1="0" y1={height - 1} x2={width} y2={height - 1} stroke={colors.rule} />
        {seller.length ? <Path d={path(seller)} stroke={colors.amber} strokeWidth={2} fill="none" /> : null}
        {buyer.length ? <Path d={path(buyer)} stroke={colors.forest} strokeWidth={2} fill="none" /> : null}
        {lastS !== undefined ? <Circle cx={width - 12} cy={y(lastS)} r={4.5} fill={colors.amber} /> : null}
        {lastB !== undefined ? <Circle cx={width - 12} cy={y(lastB)} r={4.5} fill={colors.forest} /> : null}
      </Svg>
    </View>
  );
}

/* ------------------------------------------------------------ term sheet */

export interface TermRow {
  label: string;
  mine: string;
  theirs: string;
  emphasize?: boolean;
}

/** Ledger term sheet: your terms against theirs, rows that still differ shaded. */
export function TermSheet({ rows, mineLabel = 'You', theirsLabel }: { rows: TermRow[]; mineLabel?: string; theirsLabel: string }) {
  return (
    <View accessibilityRole="summary">
      <Row style={{ paddingBottom: 6, borderBottomWidth: 1, borderColor: colors.ruleStrong }}>
        <T v="label" color={colors.inkDim} style={{ flex: 1.1 }}>Term</T>
        <T v="label" color={colors.inkDim} style={{ flex: 1, textAlign: 'right' }}>{mineLabel}</T>
        <T v="label" color={colors.inkDim} style={{ flex: 1, textAlign: 'right' }}>{theirsLabel}</T>
      </Row>
      {rows.map((r) => {
        const differs = r.mine !== r.theirs;
        return (
          <Row key={r.label} align="flex-start" style={{ paddingVertical: 10, paddingHorizontal: differs ? 6 : 0, marginHorizontal: differs ? -6 : 0, borderBottomWidth: 1, borderColor: colors.rule, backgroundColor: differs ? colors.amberSoft : 'transparent' }}>
            <T v="small" color={colors.inkDim} style={{ flex: 1.1 }}>{r.label}</T>
            <T v={r.emphasize ? 'bodyStrong' : 'small'} color={r.emphasize ? colors.forest : colors.ink} style={{ flex: 1, textAlign: 'right' }}>{r.mine}</T>
            <T v={r.emphasize ? 'bodyStrong' : 'small'} color={r.emphasize ? colors.amberText : colors.ink} style={{ flex: 1, textAlign: 'right' }}>{r.theirs}</T>
          </Row>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------- evidence */

/** Verified trust evidence — counts and relationships, one qualification line. No stars, no badges. */
export function evidenceLine(p: Person): string {
  if (p.completedCount === 0) return 'First transaction on DemandOne';
  const parts = [`${p.completedCount} verified`, `${p.recommendCount} recommend`];
  if (p.trustPaths > 0) parts.push(`${p.trustPaths} in your network`);
  return parts.join(', ');
}

/* -------------------------------------------------------------- the row */

/**
 * The standard compact Exchange row. Default state shows capability, timing,
 * price and terms, market state and one action. Instruments stay in detail views,
 * except a capacity bar or an ask revision — single facts that changed.
 */
export function capacityText(c: ListingCapacity): string {
  const unit = c.unit === 'slots' ? (c.total === 1 ? 'slot' : 'slots') : 'hours';
  return `${c.remaining} of ${c.total} ${unit} left`;
}

export function MarketRow({
  card,
  person,
  categoryLabel,
  state,
  stateTone = 'quiet',
  forYou,
  onOpen,
  onAction,
}: {
  card: MatchCard;
  person: Person;
  categoryLabel: string;
  state: string;
  stateTone?: 'quiet' | 'live';
  forYou?: boolean;
  onOpen: () => void;
  onAction?: () => void;
}) {
  const revision = card.revisions?.[card.revisions.length - 1];
  const showCapacity = card.capacity && card.capacity.total > 1;
  const showFor = forYou && stateTone === 'quiet';
  return (
    <View style={{ paddingVertical: space.md, borderBottomWidth: 1, borderColor: colors.rule }}>
      <Tap onPress={onOpen} label={`${card.kind === 'need' ? 'Need' : 'Offer'}: ${card.title}, ${formatMoney(card.price)} ${UNIT_LABEL[card.unit]}`}>
        <Row justify="space-between">
          <SideLabel kind={card.kind} detail={categoryLabel} />
          <T v="label" color={stateTone === 'live' ? colors.amberText : showFor ? colors.forest : colors.inkFaint}>{showFor ? 'For you' : state}</T>
        </Row>
        <Row align="flex-start" justify="space-between" gap={space.md} style={{ marginTop: 4 }}>
          <T v="entry" lines={2} style={{ flex: 1 }}>{card.title}</T>
          <Price amount={card.price} caption={`${card.kind === 'offer' ? 'ask' : 'bid'}${card.unit === 'fixed' ? ', fixed' : card.unit === 'hour' ? ' / hour' : ' / sprint'}`} />
        </Row>
        <Row gap={space.md} style={{ marginTop: 4, flexWrap: 'wrap', rowGap: 2 }}>
          <Row gap={4}>
            <Icon name="clock" size={13} color={colors.inkFaint} />
            <T v="small" color={colors.inkDim}>{card.timingNote}</T>
          </Row>
          {showCapacity ? (
            <Row gap={6}>
              <CapacityBar capacity={card.capacity!} width={32} />
              <T v="small" color={colors.inkDim}>{capacityText(card.capacity!)}</T>
            </Row>
          ) : null}
          {revision ? <T v="small" color={colors.inkDim}>{`was ${formatMoney(revision.price)}`}</T> : null}
        </Row>
      </Tap>
      <Row justify="space-between" gap={space.md} style={{ marginTop: 6 }}>
        <T v="small" color={colors.inkFaint} lines={1} style={{ flex: 1 }}>
          <T v="smallStrong">{person.name}</T>
          {`  ${person.completedCount === 0 ? 'First transaction' : `${person.completedCount} verified, ${person.recommendCount} recommend`}`}
        </T>
        {onAction ? (
          <Tap onPress={onAction} label={`${card.kind === 'offer' ? 'Bid on' : 'Make an offer on'} ${card.title}`} style={{ paddingVertical: 4, paddingLeft: space.md }}>
            <T v="smallStrong" color={colors.forest}>{card.kind === 'offer' ? 'Bid' : 'Offer'}</T>
          </Tap>
        ) : null}
      </Row>
    </View>
  );
}
