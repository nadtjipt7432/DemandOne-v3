import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { CRITERION_META } from '@/domain/matching';
import { isSpeechOutputAvailable } from '@/infra/voice';
import { resetDemoMarket, resetDevice, setSpeakReplies, setThemeMode, signOut } from '@/services/account';
import { useAppState, useViewer } from '@/state/hooks';
import { Button, KeyValue, Page, Row, Rule, Section, Stack, T, ToggleRow } from '@/ui/core';
import { evidenceLine } from '@/ui/market';
import { ReputationRecord } from '@/ui/reputation';
import { summarizeAspects } from '@/domain/feedback';
import { colors, space } from '@/theme';

/** Profile and settings — the signed-in person's own record, exactly as entered. */
export default function You() {
  const router = useRouter();
  const s = useAppState();
  const viewer = useViewer();
  const [armed, setArmed] = useState<'demo' | 'erase' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const card = s.paymentMethods.find((p) => p.id === s.defaultPaymentId);
  const completed = s.bookings.filter((b) => b.status === 'complete' && (b.buyerId === viewer.id || b.sellerId === viewer.id)).length;

  const resetDemo = async () => {
    if (armed !== 'demo') return setArmed('demo');
    await resetDemoMarket();
    setArmed(null);
    setNotice('Demo market reset. Your profile is unchanged.');
  };

  const erase = async () => {
    if (armed !== 'erase') return setArmed('erase');
    await resetDevice();
  };

  return (
    <Page>
      <T v="display" style={{ marginTop: space.lg }} testID="profile-name">{viewer.name}</T>
      <T v="body" color={colors.inkDim}>{s.account?.email}</T>

      <Section title="Profile" ruled right={<Button size="sm" kind="secondary" title="Edit profile" onPress={() => router.push('/account')} />}>
        <KeyValue label="Name" value={viewer.name} />
        <Rule />
        <KeyValue label="Email" value={s.account?.email ?? ''} />
        <Rule />
        <KeyValue label="Location" value={viewer.location || 'Not set'} valueColor={viewer.location ? undefined : colors.inkFaint} />
        <Rule />
        <KeyValue label="Background" value={viewer.background || 'Not set'} valueColor={viewer.background ? undefined : colors.inkFaint} />
        <Rule />
        <KeyValue label="Capabilities" value={viewer.capability?.summary || 'Not set'} valueColor={viewer.capability ? undefined : colors.inkFaint} />
        <Rule />
        <KeyValue label="Links" value={viewer.links?.length ? viewer.links.map((l) => l.replace(/^https?:\/\//, '')).join('\n') : 'Not set'} valueColor={viewer.links?.length ? undefined : colors.inkFaint} />
        <Rule />
        <KeyValue label="Track record" value={evidenceLine(viewer)} />
      </Section>

      {summarizeAspects(viewer.reputation).length ? (
        <Section title="How counterparties rated you" note="Against the terms each transaction agreed." ruled>
          <ReputationRecord person={viewer} counts={false} notes={3} testID="own-reputation" />
        </Section>
      ) : null}

      <Section title="Standard of value" ruled right={<Button size="sm" kind="quiet" title="Change" onPress={() => router.push('/onboarding')} />}>
        {viewer.standardOfValue.order.map((c, i) => (
          <Row key={c} gap={space.md} style={{ paddingVertical: space.sm, borderBottomWidth: 1, borderColor: colors.rule }}>
            <T v="entry" color={colors.forest} style={{ width: 20 }}>{String(i + 1)}</T>
            <T v="body" style={{ flex: 1 }}>{CRITERION_META[c].title}</T>
            <T v="small" color={colors.inkFaint}>{CRITERION_META[c].sub}</T>
          </Row>
        ))}
      </Section>

      <Section title="Settings" ruled>
        <KeyValue label="Payment" value={card?.label ?? 'None yet'} onPress={() => router.push('/payment')} />
        <Rule />
        <KeyValue label="History" value={`${completed} completed`} onPress={() => router.push('/history')} />
        <Rule />
        <KeyValue label="Notifications" value={s.notificationPref === 'live' ? 'As it happens' : s.notificationPref === 'off' ? 'Off' : `${s.notificationPref[0].toUpperCase()}${s.notificationPref.slice(1)} digest`} onPress={() => router.push('/notifications')} />
        <Rule />
        <KeyValue label="Agent permissions" value={`${s.permissions.filter((p) => p.enabled).length} of ${s.permissions.length} on`} onPress={() => router.push('/permissions')} />
        <Rule />
        <ToggleRow label="Spoken replies" sub={isSpeechOutputAvailable() ? 'Your agent answers out loud as well as on screen.' : 'Not supported in this browser — replies stay on screen.'} value={s.speakReplies} onChange={setSpeakReplies} />
        <Rule />
        <ToggleRow label="Dark mode" value={s.themeMode === 'dark'} onChange={(on) => setThemeMode(on ? 'dark' : 'light')} />
      </Section>

      <Section title="Account and demo data" ruled>
        <Stack gap={space.sm} style={{ marginTop: space.md }}>
          <View>
            <Button kind="secondary" title={armed === 'demo' ? 'Tap again to reset the demo market' : 'Reset demo market'} onPress={resetDemo} />
            <T v="small" color={colors.inkFaint} style={{ marginTop: 4 }}>Restores the demo counterparties and listings and clears deals. Keeps your profile.</T>
          </View>
          {notice ? <T v="small" color={colors.forest}>{notice}</T> : null}
          <Button kind="quiet" title="Sign out" onPress={signOut} />
          <Button kind="danger" title={armed === 'erase' ? 'Tap again to erase everything' : 'Erase this device'} onPress={erase} />
        </Stack>
      </Section>
    </Page>
  );
}
