import { useRouter } from 'expo-router';
import { Fragment } from 'react';
import { togglePermission } from '@/services/account';
import { useAppState } from '@/state/hooks';
import { Page, Rule, Section, T, ToggleRow, TopBar } from '@/ui/core';
import { colors, space } from '@/theme';

/** What the agent may do on your behalf. Binding commitments always come back to you. */
export default function Permissions() {
  const router = useRouter();
  const { permissions } = useAppState();
  return (
    <Page>
      <TopBar onBack={() => router.back()} />
      <T v="display">Agent permissions</T>
      <T v="body" color={colors.inkDim} style={{ marginTop: space.sm }}>What your agent may do without asking. Anything binding still needs your approval.</T>
      <Section title="Allowed" ruled>
        {permissions.map((p, i) => (
          <Fragment key={p.key}>
            {i > 0 ? <Rule /> : null}
            <ToggleRow label={p.label} sub={p.sublabel} value={p.enabled} onChange={() => togglePermission(p.key)} />
          </Fragment>
        ))}
      </Section>
    </Page>
  );
}
