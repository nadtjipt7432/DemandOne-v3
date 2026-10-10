import Feather from '@expo/vector-icons/Feather';
import { useRouter } from 'expo-router';
import { Switch, View } from 'react-native';
import { Btn, Divider, Row, Screen, Txt } from '@/components/base';
import { Header } from '@/components/domain';
import { useAppState } from '@/state/hooks';
import { togglePermission } from '@/services/market';
import { colors, space } from '@/theme';
import type { IconName } from '@/components/base';

const ICONS: Record<string, IconName> = {
  location: 'map-pin',
  calendar: 'calendar',
  negotiate: 'git-branch',
  autobook: 'check-circle',
  curate: 'compass',
};

export default function Permissions() {
  const router = useRouter();
  const { permissions } = useAppState();

  return (
    <Screen scroll>
      <Header onBack={() => router.back()} title="You" />
      <Txt variant="title" style={{ marginTop: space.sm }}>
        Rules, not unlimited access.
      </Txt>
      <Txt variant="small" color={colors.textDim} style={{ marginTop: 4 }}>
        Everything can be changed, paused, or deleted. Booking stays approval-based by default.
      </Txt>

      <View style={{ marginTop: space.lg }}>
        {permissions.map((perm, i) => (
          <View key={perm.key}>
            {i > 0 && <Divider />}
            <Row style={{ justifyContent: 'space-between', paddingVertical: space.md }}>
              <Row gap={space.md} style={{ flex: 1 }}>
                <Feather name={ICONS[perm.key] ?? 'circle'} size={17} color={colors.textFaint} />
                <View style={{ flex: 1 }}>
                  <Txt variant="body">{perm.label}</Txt>
                  <Txt variant="small" color={colors.textFaint}>
                    {perm.sublabel}
                  </Txt>
                </View>
              </Row>
              <Switch
                value={perm.enabled}
                onValueChange={() => togglePermission(perm.key)}
                trackColor={{ true: colors.accent, false: colors.surface2 }}
                thumbColor={colors.surface}
                ios_backgroundColor={colors.surface2}
              />
            </Row>
          </View>
        ))}
      </View>

      <Txt variant="small" color={colors.textDim} style={{ marginTop: space.xl }}>
        Your data is not inventory. Never sold, never used for advertising — only to complete your
        requests and improve your exchange.
      </Txt>

      <Btn title="Save my rules" style={{ marginTop: space.xl }} onPress={() => router.back()} />
    </Screen>
  );
}
