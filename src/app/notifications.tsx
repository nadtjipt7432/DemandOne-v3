import Feather from '@expo/vector-icons/Feather';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Divider, Row, Screen, Txt } from '@/components/base';
import { Header } from '@/components/domain';
import { useAppState } from '@/state/hooks';
import { setNotificationPref } from '@/services/account';
import { colors, space } from '@/theme';
import type { NotificationPref } from '@/domain/types';

const OPTIONS: { key: NotificationPref; title: string; sub: string }[] = [
  { key: 'live', title: 'As it happens', sub: "The agent still batches routine news, but breaks through for what's expiring." },
  { key: 'daily', title: 'Daily digest', sub: 'One summary a day.' },
  { key: 'weekly', title: 'Weekly digest', sub: 'One summary a week.' },
  { key: 'off', title: 'Off', sub: "You'll only see updates when you open the app." },
];

export default function Notifications() {
  const router = useRouter();
  const { notificationPref } = useAppState();
  const [busy, setBusy] = useState<NotificationPref | null>(null);

  const pick = async (pref: NotificationPref) => {
    setBusy(pref);
    await setNotificationPref(pref);
    setBusy(null);
  };

  return (
    <Screen scroll>
      <Header onBack={() => router.back()} title="Notifications" />
      <Txt variant="small" color={colors.textDim} style={{ marginTop: space.xs }}>
        How the agent reaches you when something needs your attention.
      </Txt>

      <View style={{ marginTop: space.lg }}>
        {OPTIONS.map((o, i) => {
          const active = notificationPref === o.key;
          return (
            <View key={o.key}>
              {i > 0 ? <Divider /> : null}
              <Pressable
                onPress={() => pick(o.key)}
                disabled={busy !== null}
                style={({ pressed }) => [{ paddingVertical: space.md }, pressed && { opacity: 0.6 }]}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <Txt variant="body" color={active ? colors.accent : colors.text}>
                      {o.title}
                    </Txt>
                    <Txt variant="small" color={colors.textFaint} style={{ marginTop: 2 }}>
                      {o.sub}
                    </Txt>
                  </View>
                  {active ? <Feather name="check" size={18} color={colors.accent} /> : null}
                </Row>
              </Pressable>
            </View>
          );
        })}
      </View>
    </Screen>
  );
}
