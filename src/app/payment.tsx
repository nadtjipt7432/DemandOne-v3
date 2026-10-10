import Feather from '@expo/vector-icons/Feather';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Btn, Divider, Field, Row, Screen, Txt } from '@/components/base';
import { Header } from '@/components/domain';
import { useAppState } from '@/state/hooks';
import { addPaymentMethod, setDefaultPayment } from '@/services/account';
import { colors, space } from '@/theme';

export default function Payment() {
  const router = useRouter();
  const { paymentMethods, defaultPaymentId } = useAppState();
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const choose = async (paymentId: string) => {
    setBusy(paymentId);
    await setDefaultPayment(paymentId);
    setBusy(null);
  };

  const add = async () => {
    if (!label.trim()) return;
    setBusy('add');
    await addPaymentMethod(label.trim());
    setBusy(null);
    setLabel('');
    setAdding(false);
  };

  return (
    <Screen scroll>
      <Header onBack={() => router.back()} title="Payment methods" />
      <Txt variant="small" color={colors.textDim} style={{ marginTop: space.xs }}>
        Charged only after work is complete, and only at the price you approved.
      </Txt>

      <View style={{ marginTop: space.lg }}>
        {paymentMethods.map((pm, i) => {
          const active = pm.id === defaultPaymentId;
          return (
            <View key={pm.id}>
              {i > 0 ? <Divider /> : null}
              <Pressable
                onPress={() => choose(pm.id)}
                disabled={busy !== null}
                style={({ pressed }) => [{ paddingVertical: space.md }, pressed && { opacity: 0.6 }]}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Row gap={space.md}>
                    <Feather name="credit-card" size={17} color={colors.textFaint} />
                    <Txt variant="body" color={active ? colors.accent : colors.text}>
                      {pm.label}
                    </Txt>
                  </Row>
                  {active ? <Txt variant="small" color={colors.accent}>Default</Txt> : null}
                </Row>
              </Pressable>
            </View>
          );
        })}
      </View>

      {adding ? (
        <View style={{ marginTop: space.lg, gap: space.sm }}>
          <Field value={label} onChangeText={setLabel} placeholder="e.g. Mastercard ending 4471" />
          <Row gap={space.sm}>
            <Btn title="Add card" loading={busy === 'add'} disabled={!label.trim()} style={{ flex: 1, height: 44 }} onPress={add} />
            <Btn title="Cancel" variant="ghost" style={{ height: 44 }} onPress={() => setAdding(false)} />
          </Row>
        </View>
      ) : (
        <Btn title="Add a payment method" variant="secondary" icon="plus" style={{ marginTop: space.lg }} onPress={() => setAdding(true)} />
      )}
    </Screen>
  );
}
