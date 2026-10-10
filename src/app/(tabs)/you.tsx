import Feather from '@expo/vector-icons/Feather';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { Divider, Row, Screen, Txt } from '@/components/base';
import { Avatar } from '@/components/domain';
import { useAppState, useViewer } from '@/state/hooks';
import { CRITERION_META } from '@/domain/matching';
import { resetDevice, setThemeMode } from '@/services/account';
import { colors, fontDisplay, space } from '@/theme';
import type { IconName } from '@/components/base';
import type { NotificationPref } from '@/domain/types';

const NOTIF_LABEL: Record<NotificationPref, string> = {
  live: 'As it happens',
  daily: 'Daily digest',
  weekly: 'Weekly digest',
  off: 'Off',
};

export default function You() {
  const router = useRouter();
  const {
    account,
    permissions,
    categories,
    paymentMethods,
    defaultPaymentId,
    notificationPref,
    themeMode,
    bookings,
  } = useAppState();
  const completedCount = bookings.filter((b) => b.status === 'complete').length;
  const viewer = useViewer();
  const enabled = permissions.filter((p) => p.enabled).length;
  const [resetArmed, setResetArmed] = useState(false);
  const [resetting, setResetting] = useState(false);

  const onErase = async () => {
    if (!resetArmed) {
      setResetArmed(true);
      return;
    }
    setResetting(true);
    await resetDevice();
    setResetting(false);
  };

  const myCategories = categories.filter((c) => viewer.categories.includes(c.id)).map((c) => c.label);
  const defaultPayment = paymentMethods.find((p) => p.id === defaultPaymentId);

  return (
    <Screen scroll>
      <Row gap={space.md} style={{ marginTop: space.sm }}>
        <Avatar initials={viewer.initials} size={52} />
        <View>
          <Txt variant="title">{viewer.name}</Txt>
          <Txt variant="small" color={colors.textFaint} style={{ marginTop: 2 }}>
            {viewer.location || 'Location not set'}
          </Txt>
        </View>
      </Row>

      {/* Standard of Value */}
      <Row style={{ justifyContent: 'space-between', marginTop: space.xl }}>
        <Txt variant="heading">Your standard of value</Txt>
        <Pressable onPress={() => router.push('/onboarding')}>
          <Txt variant="small" color={colors.accent}>
            Redo
          </Txt>
        </Pressable>
      </Row>
      <View style={{ marginTop: space.md, gap: space.md }}>
        {viewer.standardOfValue.order.map((c, i) => {
          const meta = CRITERION_META[c];
          return (
            <Row key={c} gap={space.md} style={{ alignItems: 'flex-start' }}>
              <Txt style={{ fontFamily: fontDisplay, fontSize: 18, lineHeight: 24, color: colors.accent }}>
                {String(i + 1).padStart(2, '0')} —
              </Txt>
              <View style={{ flex: 1 }}>
                <Txt style={{ fontFamily: fontDisplay, fontSize: 17, lineHeight: 24, color: colors.text }}>{meta.title}</Txt>
                <Txt variant="small" color={colors.textFaint} style={{ marginTop: 1 }}>
                  {meta.sub}
                </Txt>
              </View>
            </Row>
          );
        })}
      </View>

      {/* What I'm looking for */}
      <Txt variant="heading" style={{ marginTop: space.xl }}>
        What I'm looking for
      </Txt>
      <View style={{ marginTop: space.sm }}>
        {viewer.needs.length === 0 ? (
          <Txt variant="small" color={colors.textFaint} style={{ paddingVertical: space.sm }}>
            Nothing yet — add one from Ask.
          </Txt>
        ) : (
          viewer.needs.map((n, i) => (
            <View key={n.id}>
              {i > 0 ? <Divider /> : null}
              <View style={{ paddingVertical: space.sm }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Txt variant="body" style={{ flex: 1 }} numberOfLines={1}>
                    {n.title}
                  </Txt>
                  <Txt variant="bodyStrong">${n.budgetMax}</Txt>
                </Row>
                <Txt variant="small" color={colors.textFaint} style={{ marginTop: 2 }}>
                  {n.window.label}
                  {n.howLong === 'watching' ? ' · standing' : ''}
                </Txt>
              </View>
            </View>
          ))
        )}
      </View>

      {/* What I can offer */}
      <Txt variant="heading" style={{ marginTop: space.xl }}>
        What I can offer
      </Txt>
      <View style={{ marginTop: space.sm }}>
        {viewer.offers.length === 0 ? (
          <Txt variant="small" color={colors.textFaint} style={{ paddingVertical: space.sm }}>
            Nothing yet — add one from Ask.
          </Txt>
        ) : (
          viewer.offers.map((o, i) => (
            <View key={o.id}>
              {i > 0 ? <Divider /> : null}
              <View style={{ paddingVertical: space.sm }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Txt variant="body" style={{ flex: 1 }} numberOfLines={1}>
                    {o.title}
                  </Txt>
                  <Txt variant="bodyStrong">${o.price}</Txt>
                </Row>
                <Txt variant="small" color={colors.textFaint} style={{ marginTop: 2 }}>
                  {o.window.label}
                  {o.howLong === 'watching' ? ' · standing' : ''}
                </Txt>
              </View>
            </View>
          ))
        )}
      </View>

      {myCategories.length > 0 ? (
        <Txt variant="small" color={colors.textFaint} style={{ marginTop: space.md }}>
          Your exchange is tuned to {myCategories.join(', ')}.
        </Txt>
      ) : null}

      {/* Settings */}
      <Txt variant="heading" style={{ marginTop: space.xl }}>
        Settings
      </Txt>
      <View style={{ marginTop: space.sm }}>
        <SettingRow
          icon="sliders"
          label="Permission controls"
          value={`${enabled} of ${permissions.length} enabled`}
          onPress={() => router.push('/permissions')}
        />
        <Divider />
        <SettingRow icon="credit-card" label="Payment methods" value={defaultPayment?.label ?? 'Add a card'} onPress={() => router.push('/payment')} />
        <Divider />
        <SettingRow
          icon="clock"
          label="Transaction history"
          value={`${completedCount} completed`}
          onPress={() => router.push('/history')}
        />
        <Divider />
        <SettingRow icon="calendar" label="Calendar" value="Free/busy connected" onPress={() => router.push('/permissions')} />
        <Divider />
        <SettingRow icon="bell" label="Notifications" value={NOTIF_LABEL[notificationPref]} onPress={() => router.push('/notifications')} />
        <Divider />
        <Row style={{ justifyContent: 'space-between', padding: space.lg }}>
          <Row gap={space.md} style={{ flex: 1 }}>
            <Feather name="moon" size={17} color={colors.textFaint} />
            <View style={{ flex: 1 }}>
              <Txt variant="body">Dark mode</Txt>
              <Txt variant="small" color={colors.textFaint}>
                {themeMode === 'dark' ? 'On' : 'Off'}
              </Txt>
            </View>
          </Row>
          <Switch
            value={themeMode === 'dark'}
            onValueChange={(on) => setThemeMode(on ? 'dark' : 'light')}
            trackColor={{ true: colors.accent, false: colors.surface2 }}
            thumbColor={colors.surface}
            ios_backgroundColor={colors.surface2}
          />
        </Row>
        <Divider />
        <SettingRow icon="log-in" label="Account & login" value={account?.email ?? ''} onPress={() => router.push('/account')} />
        <Divider />
        <Pressable onPress={onErase} style={({ pressed }) => [{ paddingVertical: space.md }, pressed && { opacity: 0.6 }]}>
          <Row gap={space.md}>
            <Feather name="rotate-ccw" size={17} color={colors.accent2} />
            <View style={{ flex: 1 }}>
              <Txt variant="body" color={colors.accent2}>
                {resetting ? 'Erasing…' : resetArmed ? 'Tap again to erase' : 'Erase this device'}
              </Txt>
              <Txt variant="small" color={colors.textFaint}>
                Deletes your account and activity from this device
              </Txt>
            </View>
          </Row>
        </Pressable>
      </View>

      <Txt variant="small" color={colors.textFaint} style={{ textAlign: 'center', marginTop: space.xl }}>
        Your data is not inventory. Never sold, never used for advertising.
      </Txt>
    </Screen>
  );
}

function SettingRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: IconName;
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ paddingVertical: space.md }, pressed && { opacity: 0.6 }]}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row gap={space.md} style={{ flex: 1 }}>
          <Feather name={icon} size={17} color={colors.textFaint} />
          <View style={{ flex: 1 }}>
            <Txt variant="body">{label}</Txt>
            <Txt variant="small" color={colors.textFaint}>
              {value}
            </Txt>
          </View>
        </Row>
        <Feather name="chevron-right" size={18} color={colors.textFaint} />
      </Row>
    </Pressable>
  );
}

