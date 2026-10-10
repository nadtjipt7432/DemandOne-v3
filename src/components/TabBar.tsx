import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppState, useViewer } from '@/state/hooks';
import { getDecisions } from '@/state/myMarket';
import { T } from '@/ui/core';
import { Icon, IconName } from '@/ui/Icon';
import { colors, MAX_WIDTH, space } from '@/theme';

const META: Record<string, { label: string; icon: IconName }> = {
  today: { label: 'Home', icon: 'home' },
  discover: { label: 'Exchange', icon: 'exchange' },
  ask: { label: 'Speak', icon: 'mic' },
  matches: { label: 'Deals', icon: 'deals' },
  you: { label: 'You', icon: 'user' },
};

export interface TabBarProps {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: { navigate: (name: string) => void };
}

/** Paper tab bar on a fine rule. Speak — the voice entry point — sits at the center. */
export function TabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const app = useAppState();
  const viewer = useViewer();
  const waiting = getDecisions(app, viewer.id).length;

  return (
    <View style={{ backgroundColor: colors.bg, borderTopWidth: 1, borderColor: colors.rule, paddingBottom: Math.max(insets.bottom, space.sm) }}>
      <View accessibilityRole="tablist" style={{ flexDirection: 'row', width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', paddingTop: space.sm }}>
        {state.routes.map((route, i) => {
          const meta = META[route.name];
          if (!meta) return null;
          const focused = state.index === i;
          if (route.name === 'ask') {
            return (
              <Pressable key={route.key} accessibilityRole="tab" accessibilityLabel="Speak" accessibilityState={{ selected: focused }} onPress={() => navigation.navigate(route.name)} style={{ flex: 1, alignItems: 'center' }}>
                <View style={{ width: 52, height: 52, borderRadius: 26, marginTop: -18, backgroundColor: colors.forest, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: colors.bg }}>
                  <Icon name="mic" size={22} color={colors.onForest} />
                </View>
                <T v="label" color={focused ? colors.ink : colors.inkFaint} style={{ marginTop: 2 }}>Speak</T>
              </Pressable>
            );
          }
          const tint = focused ? colors.ink : colors.inkFaint;
          const badge = route.name === 'matches' ? waiting : 0;
          return (
            <Pressable key={route.key} accessibilityRole="tab" accessibilityLabel={badge ? `${meta.label}, ${badge} waiting` : meta.label} accessibilityState={{ selected: focused }} onPress={() => navigation.navigate(route.name)} style={({ pressed }) => [{ flex: 1, alignItems: 'center', gap: 3, paddingVertical: 2 }, pressed && { opacity: 0.6 }]}>
              <View>
                <Icon name={meta.icon} size={22} color={tint} weight={focused ? 'fill' : 'regular'} />
                {badge > 0 ? <View style={{ position: 'absolute', top: -2, right: -7, minWidth: 15, height: 15, borderRadius: 8, paddingHorizontal: 3, backgroundColor: colors.amber, alignItems: 'center', justifyContent: 'center' }}><T v="label" color={colors.onForest} style={{ fontSize: 10, lineHeight: 12 }}>{String(badge)}</T></View> : null}
              </View>
              <T v="label" color={tint}>{meta.label}</T>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
