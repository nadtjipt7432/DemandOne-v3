import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Dimensions, Pressable, StyleSheet } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { Txt } from './base';
import { colors, fontDisplay, fontDisplayItalic, space } from '@/theme';

/**
 * The landing page's one-time brand moment: the two Logomark circles (same pine +
 * amber as everywhere else — no new colors) spiral around each other, expand past
 * the edges of the screen, then hold on a tagline before carrying straight into
 * the sign-up screen. Tappable to skip at any point — a splash should never make
 * someone wait on it; skipping reveals the static landing page underneath
 * (already mounted the whole time) instead of forcing the login screen.
 */

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const CIRCLE = 64;
const ORBIT_RADIUS = 34;
const SCALE_TARGET = Math.ceil((Math.sqrt(SCREEN_W * SCREEN_W + SCREEN_H * SCREEN_H) / CIRCLE) * 1.3);

const ORBIT_MS = 2400;
const EXPAND_MS = 1000;
const TEXT_FADE_MS = 550;
const TEXT_HOLD_MS = 1900;
const FINAL_FADE_MS = 500;

const TEXT_START = ORBIT_MS + EXPAND_MS * 0.7;
const FINAL_FADE_START = TEXT_START + TEXT_FADE_MS + TEXT_HOLD_MS;

export function IntroAnimation({ onSkip }: { onSkip: () => void }) {
  const router = useRouter();
  const angle = useSharedValue(0);
  const radius = useSharedValue(ORBIT_RADIUS);
  const scale = useSharedValue(1);
  const textOpacity = useSharedValue(0);
  const overlayOpacity = useSharedValue(1);

  useEffect(() => {
    // Spiral: orbit while the radius collapses toward the center, so the two
    // circles are already together right as the expand phase begins.
    angle.value = withTiming(Math.PI * 4, { duration: ORBIT_MS, easing: Easing.inOut(Easing.ease) });
    radius.value = withTiming(0, { duration: ORBIT_MS, easing: Easing.in(Easing.quad) });
    scale.value = withDelay(ORBIT_MS, withTiming(SCALE_TARGET, { duration: EXPAND_MS, easing: Easing.out(Easing.cubic) }));
    textOpacity.value = withDelay(TEXT_START, withTiming(1, { duration: TEXT_FADE_MS }));
    overlayOpacity.value = withDelay(
      FINAL_FADE_START,
      withTiming(0, { duration: FINAL_FADE_MS }, (finished) => {
        if (finished) runOnJS(goToLogin)();
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goToLogin = () => router.replace('/login');

  const skip = () => {
    cancelAnimation(angle);
    cancelAnimation(radius);
    cancelAnimation(scale);
    cancelAnimation(textOpacity);
    cancelAnimation(overlayOpacity);
    overlayOpacity.value = 0;
    onSkip();
  };

  const circleAStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: Math.cos(angle.value) * radius.value },
      { translateY: Math.sin(angle.value) * radius.value },
      { scale: scale.value },
    ],
  }));
  const circleBStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: Math.cos(angle.value + Math.PI) * radius.value },
      { translateY: Math.sin(angle.value + Math.PI) * radius.value },
      { scale: scale.value },
    ],
  }));
  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));
  const textStyle = useAnimatedStyle(() => ({ opacity: textOpacity.value }));

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }, overlayStyle]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={skip} />
      <Animated.View
        style={[
          { position: 'absolute', width: CIRCLE, height: CIRCLE, borderRadius: CIRCLE / 2, backgroundColor: colors.accent },
          circleAStyle,
        ]}
      />
      <Animated.View
        style={[
          { position: 'absolute', width: CIRCLE, height: CIRCLE, borderRadius: CIRCLE / 2, backgroundColor: colors.accent2, opacity: 0.92 },
          circleBStyle,
        ]}
      />
      <Animated.View style={[{ paddingHorizontal: space.xxl, alignItems: 'center' }, textStyle]} pointerEvents="none">
        <Txt
          style={{ fontFamily: fontDisplayItalic, fontSize: 24, lineHeight: 30, color: '#FFFFFF', textAlign: 'center' }}>
          An agentic exchange{'\n'}for human capability.
        </Txt>
        <Txt
          style={{
            fontFamily: fontDisplay,
            fontSize: 14,
            lineHeight: 20,
            color: 'rgba(255,255,255,0.82)',
            textAlign: 'center',
            marginTop: space.md,
          }}>
          Finding the right person, at the right price, shouldn't take weeks.
        </Txt>
      </Animated.View>
    </Animated.View>
  );
}
