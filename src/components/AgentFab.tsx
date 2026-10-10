import Feather from '@expo/vector-icons/Feather';
import { usePathname, useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppState } from '@/state/hooks';
import { colors, radius } from '@/theme';

/**
 * "Talk to your agent" should be reachable from every screen, not just buried in
 * You → Settings — most screens in this app are Stack pushes outside the (tabs)
 * group, so they don't have the tab bar's mic button at all. This is the universal
 * fallback: rendered once at the root, floating above whatever's on screen.
 * Hidden pre-login/onboarding (nothing to manage yet) and on /agent itself.
 */
const HIDDEN_ON = ['/', '/login', '/onboarding', '/agent'];

export function AgentFab() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { onboarded } = useAppState();

  if (!onboarded || HIDDEN_ON.includes(pathname)) return null;

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', right: 16, bottom: insets.bottom + 68 }}>
      <Pressable
        onPress={() => router.push('/agent')}
        style={({ pressed }) => [
          {
            width: 52,
            height: 52,
            borderRadius: radius.pill,
            backgroundColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#000',
            shadowOpacity: 0.22,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 3 },
            elevation: 4,
          },
          pressed && { opacity: 0.85 },
        ]}>
        <Feather name="message-circle" size={22} color={colors.accentText} />
      </Pressable>
    </View>
  );
}
