import { useRouter } from 'expo-router';
import { useState } from 'react';
import { addPaymentMethod, setDefaultPayment } from '@/services/account';
import { useAppState } from '@/state/hooks';
import { Button, Field, Page, Row, Section, Stack, T, Tap, TopBar } from '@/ui/core';
import { Icon } from '@/ui/Icon';
import { colors, space } from '@/theme';

/** Payment methods — demo only: cards are labels, nothing is ever charged. */
export default function Payment() {
  const router = useRouter();
  const { paymentMethods, defaultPaymentId } = useAppState();
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    if (!/\d{4}\s*$/.test(label.trim())) return setError('End with the last four digits, for example "Visa ending 4242".');
    setError(null);
    await addPaymentMethod(label.trim());
    setLabel('');
  };

  return (
    <Page>
      <TopBar onBack={() => router.back()} />
      <T v="display">Payment</T>
      <T v="body" color={colors.inkDim} style={{ marginTop: space.sm }}>Demo payments: the agreed total is held when you authorize and released when you confirm the work. No money moves.</T>
      <Section title="Cards" ruled>
        {paymentMethods.length === 0 ? <T v="body" color={colors.inkDim} style={{ paddingVertical: space.md }}>None yet.</T> : null}
        {paymentMethods.map((p) => (
          <Tap key={p.id} label={`Use ${p.label}`} onPress={() => setDefaultPayment(p.id)}>
            <Row justify="space-between" style={{ paddingVertical: space.md, borderBottomWidth: 1, borderColor: colors.rule }}>
              <T v="body">{p.label}</T>
              {p.id === defaultPaymentId ? (
                <Row gap={4}>
                  <Icon name="check" size={16} color={colors.forest} />
                  <T v="small" color={colors.forest}>Default</T>
                </Row>
              ) : null}
            </Row>
          </Tap>
        ))}
        <Stack gap={space.md} style={{ marginTop: space.lg }}>
          <Field label="Add a demo card" value={label} onChangeText={setLabel} placeholder="Visa ending 4242" error={error ?? undefined} />
          <Button kind="secondary" title="Add card" onPress={add} disabled={!label.trim()} />
        </Stack>
      </Section>
    </Page>
  );
}
