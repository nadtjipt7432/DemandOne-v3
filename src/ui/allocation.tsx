/**
 * Capacity allocation visuals. A week is one bar of its released hours:
 * committed (solid forest), tentatively reserved (hatched amber), a proposed
 * allocation being previewed (outlined, not yet reserved) and free (paper).
 * Everything is drawn from capacityOf() — never from hard-coded numbers.
 */
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg';
import type { CapacityState, Strategy } from '@/domain/allocation';
import { formatMoney } from '@/domain/money';
import { colors, radius, space } from '@/theme';
import { Button, Row, T } from './core';

function Hatch({ id, color, bg }: { id: string; color: string; bg: string }) {
  return (
    <Pattern id={id} width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <Rect width={6} height={6} fill={bg} />
      <Line x1={0} y1={0} x2={0} y2={6} stroke={color} strokeWidth={3} />
    </Pattern>
  );
}

/** One week's bar. Widths animate when the allocation changes. */
function WeekBar({ index, released, committed, tentative, preview, width }: { index: number; released: number; committed: number; tentative: number; preview: number; width: number }) {
  const reduced = useReducedMotion();
  const unit = released > 0 ? width / released : 0;
  const c = useSharedValue(committed * unit);
  const t = useSharedValue(tentative * unit);
  const p = useSharedValue(preview * unit);
  useEffect(() => {
    const cfg = { duration: reduced ? 0 : 600, easing: Easing.out(Easing.cubic) };
    c.value = withTiming(committed * unit, cfg);
    t.value = withTiming(tentative * unit, cfg);
    p.value = withTiming(preview * unit, cfg);
  }, [committed, tentative, preview, unit, reduced, c, t, p]);
  const cStyle = useAnimatedStyle(() => ({ width: c.value }));
  const tStyle = useAnimatedStyle(() => ({ left: c.value, width: t.value }));
  const pStyle = useAnimatedStyle(() => ({ left: c.value + t.value, width: p.value }));
  return (
    <View style={{ width, height: 22, borderRadius: 4, backgroundColor: colors.sunk, overflow: 'hidden' }}>
      <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: colors.forest }, cStyle]} />
      <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, overflow: 'hidden' }, tStyle]}>
        <Svg width={width} height={22}>
          <Defs>
            <Hatch id={`h${index}`} color={colors.amber} bg={colors.amberSoft} />
          </Defs>
          <Rect width={width} height={22} fill={`url(#h${index})`} />
        </Svg>
      </Animated.View>
      {preview > 0 ? <Animated.View style={[{ position: 'absolute', top: 2, bottom: 2, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.forest, borderRadius: 3 }, pStyle]} /> : null}
      {/* hour ticks: capacity reads as countable hours, not an abstract bar */}
      {Array.from({ length: Math.max(0, released - 1) }, (_, i) => (
        <View key={i} style={{ position: 'absolute', top: 0, bottom: 0, left: (i + 1) * unit, width: 1, backgroundColor: colors.bg, opacity: 0.55 }} />
      ))}
    </View>
  );
}

export function CapacityPlan({ capacity, preview, weekLabels }: { capacity: CapacityState; preview?: number[]; weekLabels: string[] }) {
  const [width, setWidth] = useState(0);
  const p = preview ?? capacity.weeks.map(() => 0);
  const legend: [string, object][] = [
    ['Committed', { backgroundColor: colors.forest }],
    ['Reserved', { backgroundColor: colors.amber }],
    ...(preview ? ([['Proposed', { borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.forest }]] as [string, object][]) : []),
    ['Free', { backgroundColor: colors.sunk }],
  ];
  return (
    <View
      accessibilityLabel={capacity.weeks
        .map((w, i) => `${weekLabels[i] ?? `Week ${i + 1}`}: ${w.released} hours, ${w.committed} committed, ${w.tentative} reserved${preview ? `, ${p[i]} proposed` : ''}, ${Math.max(0, w.free - p[i])} free`)
        .join('. ')}
      onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))}
      style={{ gap: space.sm }}>
      {width > 0 && capacity.weeks.map((w, i) => (
        <View key={i} style={{ gap: 4 }}>
          <Row justify="space-between">
            <T v="label" color={colors.inkDim}>{weekLabels[i] ?? `Week ${i + 1}`}</T>
            <T v="label" color={colors.inkDim}>{`${Math.max(0, w.free - p[i])} of ${w.released} h free`}</T>
          </Row>
          <WeekBar index={i} released={w.released} committed={w.committed} tentative={w.tentative} preview={Math.min(p[i], w.free)} width={width} />
        </View>
      ))}
      <Row gap={space.md} style={{ flexWrap: 'wrap', marginTop: 2 }}>
        {legend.map(([label, style]) => (
          <Row key={label} gap={5}>
            <View style={[{ width: 10, height: 10, borderRadius: 2 }, style]} />
            <T v="label" color={colors.inkDim}>{label}</T>
          </Row>
        ))}
      </Row>
    </View>
  );
}

/** A recommended allocation, as a decision card. */
export function StrategyCard({ strategy, recommended, selected, onSelect }: { strategy: Strategy; recommended: boolean; selected: boolean; onSelect: () => void }) {
  return (
    <View
      testID={`strategy-${strategy.key}`}
      style={{ padding: space.lg, borderRadius: 14, borderWidth: selected ? 2 : 1, borderColor: selected ? colors.forest : colors.rule, backgroundColor: colors.raised, gap: space.sm }}>
      <Row justify="space-between" align="flex-start">
        <View style={{ flex: 1 }}>
          {recommended ? <T v="label" color={colors.forest}>Best fit for your standard of value</T> : null}
          <T v="heading">{strategy.title}</T>
          <T v="small" color={colors.inkDim}>{strategy.aim}</T>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <T v="priceLarge">{formatMoney(strategy.earnings)}</T>
          <T v="label" color={colors.inkFaint}>{`${formatMoney(strategy.effectiveRate)}/hr effective`}</T>
        </View>
      </Row>
      <Row gap={space.xl} style={{ borderTopWidth: 1, borderColor: colors.rule, paddingTop: space.sm }}>
        <View><T v="label" color={colors.inkDim}>Hours</T><T v="bodyStrong">{`${strategy.hours} used`}</T></View>
        <View><T v="label" color={colors.inkDim}>Left free</T><T v="bodyStrong">{`${strategy.free} h`}</T></View>
        <View><T v="label" color={colors.inkDim}>Buyers</T><T v="bodyStrong">{String(strategy.picks.length)}</T></View>
      </Row>
      <View style={{ gap: 3 }}>
        {strategy.tradeoffs.map((t) => (
          <T key={t} v="small" color={colors.inkDim}>{t}</T>
        ))}
      </View>
      <Button size="sm" kind={selected ? 'primary' : 'secondary'} title={selected ? 'Selected' : 'Preview this allocation'} label={`${selected ? 'Selected' : 'Preview'}: ${strategy.title}`} onPress={onSelect} />
    </View>
  );
}

export const CARD_RADIUS = radius.control + 4;
