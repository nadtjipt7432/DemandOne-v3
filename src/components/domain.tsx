import Feather from '@expo/vector-icons/Feather';
import { ReactNode, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { colors, marketField, radius, space } from '@/theme';
import type { BookingStatus, CardKind, Fit, MarketValue, MatchStatus, Person, TrustTier } from '@/domain/types';
import { Btn, Card, IconName, Row, Txt } from './base';

/* ------------------------------------------------------------- Logomark */

/**
 * Two overlapping circles, pine + amber — the two-sided market as a mark:
 * everyone here is both, and the overlap is where a match actually happens.
 */
export function Logomark({ size = 28 }: { size?: number }) {
  const d = size * 1.24; // each circle's diameter
  const overlap = d * 0.36;
  return (
    <View style={{ width: d * 2 - overlap, height: d, justifyContent: 'center' }}>
      <View
        style={{
          position: 'absolute',
          left: 0,
          width: d,
          height: d,
          borderRadius: d / 2,
          backgroundColor: colors.accent,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: d - overlap,
          width: d,
          height: d,
          borderRadius: d / 2,
          backgroundColor: colors.accent2,
          opacity: 0.88,
        }}
      />
    </View>
  );
}

/** A small scatter of dots in both accents — the "grain" stand-in for native (no SVG noise filters on-device). Decorative only. */
const SCATTER: { x: number; y: number; r: number; tone: 'accent' | 'accent2'; o: number }[] = [
  { x: 4, y: 10, r: 3, tone: 'accent', o: 0.4 },
  { x: 34, y: 2, r: 2, tone: 'accent2', o: 0.55 },
  { x: 60, y: 22, r: 4, tone: 'accent', o: 0.25 },
  { x: 82, y: 4, r: 2.5, tone: 'accent2', o: 0.45 },
  { x: 16, y: 40, r: 2, tone: 'accent', o: 0.3 },
  { x: 52, y: 54, r: 3, tone: 'accent2', o: 0.35 },
];

export function DotScatter({ size = 96, style }: { size?: number; style?: object }) {
  const scale = size / 96;
  return (
    <View style={[{ width: size, height: size }, style]} pointerEvents="none">
      {SCATTER.map((d, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: d.x * scale,
            top: d.y * scale,
            width: d.r * 2 * scale,
            height: d.r * 2 * scale,
            borderRadius: d.r * scale,
            backgroundColor: d.tone === 'accent' ? colors.accent : colors.accent2,
            opacity: d.o,
          }}
        />
      ))}
    </View>
  );
}

/* --------------------------------------------------------------- Avatar */

export function Avatar({ initials, size = 44 }: { initials: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.surface2,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Txt variant="smallStrong" color={colors.textDim}>
        {initials}
      </Txt>
    </View>
  );
}

/* ----------------------------------------------------------- Trust tier */

export const TIER_META: Record<TrustTier, { label: string; icon: IconName }> = {
  everyday: { label: 'Everyday', icon: 'user' },
  trades: { label: 'Trades', icon: 'tool' },
  expert: { label: 'Expert', icon: 'award' },
};

/** Plain text, folded into a metadata line — not a boxed badge. */
export function TrustBadge({ tier }: { tier: TrustTier }) {
  const meta = TIER_META[tier];
  return (
    <Txt variant="small" color={tier === 'expert' ? colors.accent : colors.textDim}>
      {meta.label}
    </Txt>
  );
}

/** Which side of the market this card's person is on — an offer posts supply (seller), a need posts demand (buyer). */
export function KindTag({ kind }: { kind: CardKind }) {
  const isOffer = kind === 'offer';
  return (
    <Txt variant="smallStrong" color={isOffer ? colors.accent : colors.textDim}>
      {isOffer ? 'Seller' : 'Buyer'}
    </Txt>
  );
}

export function VerifyPill({ label = 'Verified' }: { label?: string }) {
  return (
    <Row gap={4}>
      <Feather name="check" size={13} color={colors.accent} />
      <Txt variant="small" color={colors.accent}>
        {label}
      </Txt>
    </Row>
  );
}

/* --------------------------------------------------------------- Status */

const MATCH_STATUS: Record<MatchStatus, { label: string; color: string }> = {
  pending: { label: 'Sent', color: colors.textDim },
  mutual: { label: 'Ready to talk price', color: colors.accent },
  negotiating: { label: 'Talking price', color: colors.accent },
  accepted: { label: 'Accepted', color: colors.accent },
  booked: { label: 'Booked', color: colors.accent },
  passed: { label: 'Passed', color: colors.textFaint },
};

const BOOKING_STATUS: Record<BookingStatus, { label: string; color: string }> = {
  confirmed: { label: 'Confirmed', color: colors.accent },
  live: { label: 'Live', color: colors.accent },
  delivered: { label: 'Delivered', color: colors.accent2 },
  complete: { label: 'Cleared', color: colors.textDim },
};

export function StatusDot({ color }: { color: string }) {
  return <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />;
}

export function MatchBadge({ status }: { status: MatchStatus }) {
  const s = MATCH_STATUS[status];
  return (
    <Row gap={space.xs}>
      <StatusDot color={s.color} />
      <Txt variant="small" color={s.color}>
        {s.label}
      </Txt>
    </Row>
  );
}

export function BookingBadge({ status }: { status: BookingStatus }) {
  const s = BOOKING_STATUS[status];
  return (
    <Row gap={space.xs}>
      <StatusDot color={s.color} />
      <Txt variant="small" color={s.color}>
        {s.label}
      </Txt>
    </Row>
  );
}

/* --------------------------------------------------------------- Header */

export function Header({
  title,
  onBack,
  right,
}: {
  title?: string;
  onBack?: () => void;
  right?: ReactNode;
}) {
  return (
    <Row style={{ justifyContent: 'space-between', paddingVertical: space.sm, minHeight: 44 }}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={12} style={({ pressed }) => pressed && { opacity: 0.6 }}>
          <Row gap={space.xs}>
            <Feather name="chevron-left" size={22} color={colors.text} />
            {title ? <Txt variant="bodyStrong">{title}</Txt> : null}
          </Row>
        </Pressable>
      ) : (
        <Txt variant="heading">{title}</Txt>
      )}
      {right ?? <View />}
    </Row>
  );
}

/* --------------------------------------------------- Fit — explained, never scored */

/**
 * No numeric "match score" on screen — `fit.score` still drives ranking internally
 * (see matching.ts/discover.tsx's sort), but the public surface is only the
 * plain-language reasons. Internal complexity, external simplicity.
 */
export function FitDisclosure({ fit, label = 'Why this fits' }: { fit: Fit; label?: string }) {
  const [open, setOpen] = useState(false);
  const styles = getStyles();
  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={({ pressed }) => pressed && { opacity: 0.6 }}>
        <Row gap={2}>
          <Txt variant="smallStrong" color={colors.accent}>
            {label}
          </Txt>
          <Feather name="chevron-right" size={13} color={colors.accent} />
        </Row>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable onPress={() => {}}>
            <Card style={styles.sheet}>
              <Txt variant="heading">Why this is a good fit</Txt>
              <View style={{ marginTop: space.md, gap: space.sm }}>
                {fit.explanation.map((line) => (
                  <Row key={line} gap={space.sm} style={{ alignItems: 'flex-start' }}>
                    <Feather name="check" size={14} color={colors.accent} style={{ marginTop: 3 }} />
                    <Txt variant="small" color={colors.textDim} style={{ flex: 1 }}>
                      {line}
                    </Txt>
                  </Row>
                ))}
              </View>
              <Btn title="Got it" variant="secondary" style={{ marginTop: space.xl }} onPress={() => setOpen(false)} />
            </Card>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

/* -------------------------------------- Market value — objective, not personalized */

/** Only rendered by callers when `value.isGoodValue` — stays rare on purpose. Plain text, not a badge. */
export function ValueBadge({ value }: { value: MarketValue }) {
  return (
    <Txt variant="small" color={colors.accent}>
      Good value — {value.label}
    </Txt>
  );
}

/** The QVC/demand-creation moment, named: something you weren't looking for, surfaced anyway. */
export function DiscoveryTag() {
  return (
    <Txt variant="small" color={colors.accent2}>
      Didn't know this was possible
    </Txt>
  );
}

/* ------------------------------------------------------- Compact stats row */

/** Quantified, not a star rating — completed transactions and how many would work with them again. */
export function StatsRow({ person }: { person: Person }) {
  return (
    <Row gap={space.md}>
      <Txt variant="small" color={colors.textDim}>
        {person.completedCount} completed · {person.recommendCount} recommend
      </Txt>
      <Txt variant="small" color={colors.textDim}>
        {person.responseTimeLabel}
      </Txt>
    </Row>
  );
}

/* ------------------------------------------------------------ Sparkline */

/**
 * A tiny bar-trend, not a chart — no axes, no indicators. Only rendered by callers
 * when a price has actually moved (from !== to), so it never reads as decoration.
 * Same plain-`View` technique as MarketField, just a handful of bars.
 */
export function Sparkline({ from, to, color = colors.accent2, height = 14 }: { from: number; to: number; color?: string; height?: number }) {
  const bars = useMemo(() => {
    const steps = 4;
    const values = Array.from({ length: steps + 1 }, (_, i) => from + (to - from) * (i / steps));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = Math.max(1, max - min);
    return values.map((v) => (height * 0.35) + ((v - min) / range) * (height * 0.65));
  }, [from, to, height]);

  return (
    <Row gap={2} style={{ alignItems: 'flex-end', height }}>
      {bars.map((h, i) => (
        <View key={i} style={{ width: 3, height: h, borderRadius: 1, backgroundColor: color }} />
      ))}
    </Row>
  );
}

/* --------------------------------------------------- Market Moment panel */

/**
 * The dark charcoal "near-clearance" editorial panel — a fixed-color device
 * independent of the light/dark theme toggle, reserved for genuine tension moments
 * (a real spread, real room to move). Rare on purpose; callers compose content with
 * `marketField.charcoalText`/`charcoalTextDim`, never the mutable `colors` object,
 * since this panel must look the same regardless of app theme.
 */
export function MarketMoment({ children }: { children: ReactNode }) {
  return <View style={{ backgroundColor: marketField.charcoalSurface, borderRadius: radius.surface, padding: space.lg }}>{children}</View>;
}

// A function, not a module-level StyleSheet.create — see base.tsx's getStyles for why.
function getStyles() {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(32,31,27,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: space.lg,
    },
    sheet: { width: 340, maxWidth: '100%' },
  });
}
