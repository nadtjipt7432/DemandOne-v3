import { Fraunces_500Medium_Italic, Fraunces_600SemiBold, useFonts } from '@expo-google-fonts/fraunces';
import { Stack, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { guardRedirect } from '@/domain/identity';
import { asyncStorage } from '@/infra/asyncStorage';
import { bootstrap } from '@/services/bootstrap';
import { useAppState, useHydrated } from '@/state/hooks';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});
// Hydration never rejects (unreadable storage falls back to the seed), so the gate below always opens.
void bootstrap(asyncStorage);

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Fraunces_600SemiBold, Fraunces_500Medium_Italic });
  const hydrated = useHydrated();

  useEffect(() => {
    if (fontsLoaded && hydrated) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, hydrated]);

  if (!fontsLoaded || !hydrated) return null;
  return <Navigator />;
}

function Navigator() {
  const { themeMode, account, signedIn } = useAppState();
  const router = useRouter();
  const pathname = usePathname();

  // One rule for every route (domain/identity.ts): signed out → public screens,
  // mid-onboarding → the current step, onboarded → the app.
  useEffect(() => {
    const target = guardRedirect(pathname, account, signedIn);
    if (!target) return;
    if (router.canDismiss()) router.dismissAll();
    router.replace(target as never);
  }, [pathname, account, signedIn, router]);

  return (
    <>
      <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'slide_from_right',
        }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
  );
}
