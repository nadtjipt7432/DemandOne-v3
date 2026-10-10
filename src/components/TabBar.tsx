import Feather from '@expo/vector-icons/Feather';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppState } from '@/state/hooks';
import { colors, radius, space, type as typeScale } from '@/theme';
import type { IconName } from './base';

interface TabRoute {
  key: string;
  name: string;
}
export interface TabBarProps {
  state: { index: number; routes: TabRoute[] };
  navigation: { navigate: (name: string, params?: Record<string, string>) => void };
}

const ICONS: Record<string, IconName> = {
  today: 'sun',
  discover: 'repeat',
  ask: 'mic',
  matches: 'inbox',
  you: 'user',
};

const LABELS: Record<string, string> = {
  today: 'Today',
  discover: 'Exchange',
  ask: 'Ask',
  matches: 'Requests',
  you: 'You',
};

export function TabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const { matches } = useAppState();
  // "New ideas, plans shifting in" — fresh matches plus ones actively moving on
  // price. Booked/passed are resolved, not pending on the user, so they don't count.
  const activeCount = Object.values(matches).filter(
    (m) => m.status === 'pending' || m.status === 'mutual' || m.status === 'negotiating'
  ).length;

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: colors.bg,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingTop: space.sm,
        paddingBottom: insets.bottom > 0 ? insets.bottom : space.md,
        paddingHorizontal: space.sm,
      }}>
      {state.routes.map((route, i) => {
        const focused = state.index === i;

        if (route.name === 'ask') {
          // The one tab styled as a raised, accent-colored pill — DemandOne's most
          // visually prominent nav element, so it doubles as voice's entry point from
          // anywhere in the app: one tap lands on Ask already listening.
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityLabel="Ask"
              accessibilityState={{ selected: focused }}
              onPress={() => navigation.navigate(route.name, { autoListen: 'true' })}
              style={({ pressed }) => [{ flex: 1, alignItems: 'center' }, pressed && { opacity: 0.7 }]}>
              <View
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: radius.pill,
                  backgroundColor: colors.accent,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: -14,
                }}>
                <Feather name="mic" size={24} color={colors.accentText} />
              </View>
            </Pressable>
          );
        }

        const tint = focused ? colors.accent : colors.textFaint;
        const badge = route.name === 'matches' ? activeCount : 0;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityLabel={LABELS[route.name]}
            accessibilityState={{ selected: focused }}
            onPress={() => navigation.navigate(route.name)}
            style={({ pressed }) => [
              { flex: 1, alignItems: 'center', gap: 5 },
              pressed && { opacity: 0.7 },
            ]}>
            <View>
              <Feather name={ICONS[route.name]} size={22} color={tint} />
              {badge > 0 ? (
                <View
                  style={{
                    position: 'absolute',
                    top: -4,
                    right: -10,
                    minWidth: 16,
                    height: 16,
                    borderRadius: 8,
                    paddingHorizontal: 3,
                    backgroundColor: colors.accent2,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: colors.accentText }}>{badge}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[typeScale.label, { color: tint, letterSpacing: 0.2 }]}>
              {LABELS[route.name]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
