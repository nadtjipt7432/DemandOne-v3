import { useRouter } from 'expo-router';
import { setNotificationPref } from '@/services/account';
import { useAppState } from '@/state/hooks';
import { Choice, Page, Section, T, TopBar } from '@/ui/core';
import { colors, space } from '@/theme';
import type { NotificationPref } from '@/domain/types';

const OPTIONS: { key: NotificationPref; label: string }[] = [
  { key: 'live', label: 'As it happens' },
  { key: 'daily', label: 'Daily digest' },
  { key: 'weekly', label: 'Weekly digest' },
  { key: 'off', label: 'Off' },
];

export default function Notifications() {
  const router = useRouter();
  const { notificationPref } = useAppState();
  return (
    <Page>
      <TopBar onBack={() => router.back()} />
      <T v="display">Notifications</T>
      <T v="body" color={colors.inkDim} style={{ marginTop: space.sm }}>Counteroffers, bids and anything waiting on your approval.</T>
      <Section title="How often">
        <Choice label="Notify me" options={OPTIONS} value={notificationPref} onChange={setNotificationPref} />
      </Section>
    </Page>
  );
}
