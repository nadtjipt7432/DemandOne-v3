/**
 * Living Paper atmosphere: soft state fields, halftone and the overlapping-circle
 * mark. Each field corresponds to a product state — listening, searching,
 * negotiating, handled — so atmosphere carries meaning instead of decorating.
 * Motion is slow, singular, and off when the OS asks for reduced motion.
 */
import { useEffect } from 'react';
import { View, ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, G, LinearGradient, Mask, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';
import { field } from '@/theme';

export type Mood = 'listening' | 'searching' | 'negotiating' | 'handled' | 'night';

interface Glow {
  cx: string;
  cy: string;
  rx: string;
  ry: string;
  color: string;
  opacity: number;
}

const MOODS: Record<Mood, Glow[]> = {
  listening: [
    { cx: '75%', cy: '15%', rx: '75%', ry: '45%', color: field.amber, opacity: 0.42 },
    { cx: '10%', cy: '30%', rx: '55%', ry: '35%', color: field.rust, opacity: 0.2 },
    { cx: '50%', cy: '105%', rx: '90%', ry: '40%', color: field.indigo, opacity: 0.25 },
  ],
  searching: [
    { cx: '95%', cy: '0%', rx: '70%', ry: '80%', color: field.indigo, opacity: 0.2 },
    { cx: '0%', cy: '15%', rx: '55%', ry: '70%', color: field.amber, opacity: 0.16 },
  ],
  negotiating: [
    { cx: '50%', cy: '0%', rx: '100%', ry: '70%', color: field.indigo, opacity: 0.36 },
    { cx: '100%', cy: '45%', rx: '50%', ry: '35%', color: field.amber, opacity: 0.18 },
  ],
  handled: [
    { cx: '50%', cy: '10%', rx: '90%', ry: '60%', color: field.forest, opacity: 0.3 },
    { cx: '85%', cy: '35%', rx: '45%', ry: '30%', color: field.amber, opacity: 0.16 },
  ],
  night: [
    { cx: '85%', cy: '8%', rx: '80%', ry: '45%', color: field.amber, opacity: 0.32 },
    { cx: '0%', cy: '95%', rx: '95%', ry: '55%', color: field.indigo, opacity: 0.6 },
    { cx: '30%', cy: '40%', rx: '70%', ry: '45%', color: field.forest, opacity: 0.55 },
  ],
};

/** A state field filling its parent. `breathe` adds one slow, continuous swell. */
export function AmbientField({ mood, height, breathe = false, style }: { mood: Mood; height?: number; breathe?: boolean; style?: ViewStyle }) {
  const reduced = useReducedMotion();
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (!breathe || reduced) return;
    pulse.value = withRepeat(withSequence(withTiming(0.72, { duration: 2600, easing: Easing.inOut(Easing.sin) }), withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) })), -1);
  }, [breathe, reduced, pulse]);
  const animated = useAnimatedStyle(() => ({ opacity: pulse.value }));
  const glows = MOODS[mood];
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, top: 0, height: height ?? '100%' }, animated, style]}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          {glows.map((g, i) => (
            <RadialGradient key={i} id={`${mood}${i}`} cx={g.cx} cy={g.cy} rx={g.rx} ry={g.ry} fx={g.cx} fy={g.cy} gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={g.color} stopOpacity={g.opacity} />
              <Stop offset="1" stopColor={g.color} stopOpacity={0} />
            </RadialGradient>
          ))}
          {/* Fade the whole field out toward its bottom edge, so it never ends in a hard line. */}
          <LinearGradient id={`fade-${mood}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#fff" stopOpacity={1} />
            <Stop offset="0.55" stopColor="#fff" stopOpacity={1} />
            <Stop offset="1" stopColor="#fff" stopOpacity={0} />
          </LinearGradient>
          <Mask id={`mask-${mood}`}>
            <Rect x="0" y="0" width="100%" height="100%" fill={`url(#fade-${mood})`} />
          </Mask>
        </Defs>
        <G mask={height !== undefined ? `url(#mask-${mood})` : undefined}>
          {glows.map((_, i) => (
            <Rect key={i} x="0" y="0" width="100%" height="100%" fill={`url(#${mood}${i})`} />
          ))}
        </G>
      </Svg>
    </Animated.View>
  );
}

/** A halftone disc: dots fading out from the center, like a print screen. */
export function Halftone({ size, color, dot = 1.6, gap = 7, id }: { size: number; color: string; dot?: number; gap?: number; id: string }) {
  return (
    <Svg width={size} height={size}>
      <Defs>
        <Pattern id={`p-${id}`} width={gap} height={gap} patternUnits="userSpaceOnUse">
          <Circle cx={gap / 2} cy={gap / 2} r={dot} fill={color} />
        </Pattern>
        <RadialGradient id={`g-${id}`} cx="50%" cy="50%" r="50%">
          <Stop offset="0.55" stopColor="#fff" stopOpacity={1} />
          <Stop offset="1" stopColor="#fff" stopOpacity={0} />
        </RadialGradient>
        <Mask id={`m-${id}`}>
          <Rect width={size} height={size} fill={`url(#g-${id})`} />
        </Mask>
      </Defs>
      <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#p-${id})`} mask={`url(#m-${id})`} />
    </Svg>
  );
}

/**
 * The overlapping-circle mark: a solid forest disc and a halftone amber disc —
 * buyer and seller. `meet` animates the two together (a clearing); otherwise they
 * drift almost imperceptibly.
 */
export function CircleMark({ size, meet = false, onNight = false, style }: { size: number; meet?: boolean; onNight?: boolean; style?: ViewStyle }) {
  const reduced = useReducedMotion();
  const offset = useSharedValue(meet ? size * 0.42 : 0);
  const drift = useSharedValue(0);
  useEffect(() => {
    if (reduced) {
      offset.value = 0;
      return;
    }
    if (meet) offset.value = withDelay(250, withTiming(0, { duration: 1400, easing: Easing.out(Easing.cubic) }));
    drift.value = withRepeat(withSequence(withTiming(1, { duration: 7000, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 7000, easing: Easing.inOut(Easing.sin) })), -1);
  }, [meet, reduced, offset, drift]);
  const left = useAnimatedStyle(() => ({ transform: [{ translateX: -offset.value + drift.value * size * 0.03 }, { translateY: drift.value * size * 0.02 }] }));
  const right = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value - drift.value * size * 0.03 }, { translateY: -drift.value * size * 0.02 }] }));
  const r = size;
  return (
    <View pointerEvents="none" style={[{ width: r * 1.62, height: r }, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: r, height: r, borderRadius: r / 2, backgroundColor: onNight ? '#2E6A58' : field.forest }, left]} />
      <Animated.View style={[{ position: 'absolute', left: r * 0.62, top: 0 }, right]}>
        <Halftone id={`mark${size}`} size={r} color={onNight ? '#E0A55A' : field.rust} dot={r / 70} gap={r / 22} />
      </Animated.View>
    </View>
  );
}
