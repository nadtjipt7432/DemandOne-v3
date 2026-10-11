import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { homeRouteFor } from '@/domain/identity';
import { signOut } from '@/services/account';
import { useAppState } from '@/state/hooks';
import { AmbientField, CircleMark, MarkExit } from '@/ui/Ambient';
import { Button, Row, T, Tap } from '@/ui/core';
import { field, MAX_WIDTH, space } from '@/theme';

const STEPS = [
  ['Say it', 'What you need, or the time you can sell — in your own words.'],
  ['Your agent works the market', 'It finds the other side and negotiates within your private limits.'],
  ['You approve', 'Nothing binds until you say yes.'],
];

/** How long each departure plays before the next screen takes over. */
const EXIT_MS: Record<MarkExit, number> = { join: 1250, part: 950 };

/**
 * Landing — the front door and the brand moment. Always reachable: a returning,
 * signed-in user continues from here; anyone else enters with their email.
 * Counts are the real open positions in the market. Leaving plays one short
 * moment: continuing merges the two circles and opens into the app; switching
 * accounts lets them drift apart.
 */
export default function Landing() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { cards, account, signedIn, people } = useAppState();
  const needs = cards.filter((c) => c.kind === 'need').length;
  const offers = cards.filter((c) => c.kind === 'offer').length;
  const me = signedIn && account ? people[account.personId] : undefined;
  const reduced = useReducedMotion();
  const [exit, setExit] = useState<MarkExit>();
  const copy = useSharedValue(1);
  const copyStyle = useAnimatedStyle(() => ({ opacity: copy.value, transform: [{ translateY: (1 - copy.value) * 12 }] }));

  const leave = (kind: MarkExit, then: () => void) => {
    if (exit) return;
    if (reduced) return then();
    setExit(kind);
    copy.value = withTiming(0, { duration: 450 });
    setTimeout(then, EXIT_MS[kind]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: field.night }}>
      <AmbientField mood="night" breathe />
      <View style={{ flex: 1, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', paddingHorizontal: space.xl, paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xl }}>
        <Row gap={space.sm}>
          <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#2E6A58' }} />
          <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: field.amber, marginLeft: -8, opacity: 0.9 }} />
          <T v="entry" color={field.nightInk} style={{ marginLeft: 4 }}>DemandOne</T>
        </Row>

        <View style={{ flex: 1, justifyContent: 'center', paddingVertical: space.xl }}>
          <CircleMark size={130} meet onNight exit={exit} style={{ marginBottom: space.xl, zIndex: 1 }} />
          <Animated.View style={copyStyle}>
            <T v="hero" color={field.nightInk} testID="landing-title">An exchange for what people know how to do.</T>
            <View style={{ marginTop: space.xl, gap: space.md }}>
              {STEPS.map(([title, body], i) => (
                <Row key={title} align="flex-start" gap={space.md}>
                  <T v="entry" color={field.amber} style={{ width: 18 }}>{String(i + 1)}</T>
                  <View style={{ flex: 1 }}>
                    <T v="bodyStrong" color={field.nightInk}>{title}</T>
                    <T v="small" color={field.nightDim}>{body}</T>
                  </View>
                </Row>
              ))}
            </View>
          </Animated.View>
        </View>

        <Animated.View style={[{ gap: space.md }, copyStyle]} pointerEvents={exit ? 'none' : 'auto'}>
          <Row style={{ borderTopWidth: 1, borderColor: 'rgba(242,237,226,0.18)', paddingTop: space.md }} gap={space.xxl}>
            <View>
              <T v="price" color={field.nightInk}>{String(needs)}</T>
              <T v="label" color={field.nightDim}>open needs</T>
            </View>
            <View>
              <T v="price" color={field.nightInk}>{String(offers)}</T>
              <T v="label" color={field.nightDim}>open offers</T>
            </View>
          </Row>
          {me ? (
            <>
              <Button kind="inverse" title={`Continue as ${me.name}`} onPress={() => leave('join', () => router.replace(homeRouteFor(account, signedIn) as never))} />
              <Tap label="Use a different account" onPress={() => leave('part', () => signOut().then(() => router.push('/login')))} style={{ alignSelf: 'center', padding: space.sm }}>
                <T v="smallStrong" color={field.nightInk}>Use a different account</T>
              </Tap>
            </>
          ) : (
            <>
              <Button kind="inverse" title="Enter with your email" onPress={() => router.push('/login')} />
              <T v="small" color={field.nightDim} align="center">New or returning. Nothing binds until you approve it.</T>
            </>
          )}
        </Animated.View>
      </View>
    </View>
  );
}
