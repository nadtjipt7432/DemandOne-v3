import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { CRITERION_META } from '@/domain/matching';
import { setStandardOfValue } from '@/services/account';
import { useAppState } from '@/state/hooks';
import { AmbientField } from '@/ui/Ambient';
import { Button, Page, Row, Rule, T, Tap, TopBar } from '@/ui/core';
import { colors, space } from '@/theme';
import type { Criterion } from '@/domain/types';

const ALL: Criterion[] = ['expertise', 'trust', 'budget', 'geography'];

/** Onboarding step 3 (or a redo from Profile): rank what matters, most important first. */
export default function Values() {
  const router = useRouter();
  const { account } = useAppState();
  const redoing = account?.onboarding === 'done';
  const [order, setOrder] = useState<Criterion[]>([]);
  const [busy, setBusy] = useState(false);
  const remaining = ALL.filter((c) => !order.includes(c));

  const finish = async () => {
    setBusy(true);
    await setStandardOfValue(order);
    setBusy(false);
    if (redoing) router.canGoBack() ? router.back() : router.replace('/you');
  };

  return (
    <Page backdrop={<AmbientField mood="listening" height={240} />}>
      {redoing ? <TopBar onBack={() => router.back()} /> : null}
      <View style={{ marginTop: redoing ? space.md : space.xxl }}>
        {!redoing ? <T v="label" color={colors.inkDim}>Step 2 of 2</T> : null}
        <T v="display" style={{ marginTop: space.xs }}>What matters most when you choose who to work with?</T>
        <T v="body" color={colors.inkDim} style={{ marginTop: space.sm }}>
          Tap in order, most important first. Every position in your exchange is ranked against this, and you can always see why. Timing isn’t here: a position either fits your dates or isn’t shown.
        </T>
      </View>

      <View style={{ marginTop: space.xl }}>
        {order.map((c, i) => (
          <Row key={c} align="flex-start" gap={space.md} style={{ paddingVertical: space.md, borderBottomWidth: 1, borderColor: colors.rule }}>
            <T v="heading" color={colors.forest} style={{ width: 28 }}>{String(i + 1)}</T>
            <View style={{ flex: 1 }}>
              <T v="heading">{CRITERION_META[c].title}</T>
              <T v="small" color={colors.inkDim}>{CRITERION_META[c].sub}</T>
            </View>
          </Row>
        ))}
      </View>

      {remaining.length > 0 ? (
        <View style={{ marginTop: order.length ? space.xl : 0 }}>
          {order.length ? <T v="label" color={colors.inkDim} style={{ marginBottom: space.xs }}>Then</T> : null}
          <Rule strong />
          {remaining.map((c) => (
            <Tap key={c} label={`Rank ${CRITERION_META[c].title} next`} onPress={() => setOrder((o) => [...o, c])}>
              <View style={{ paddingVertical: space.md, borderBottomWidth: 1, borderColor: colors.rule }}>
                <T v="bodyStrong">{CRITERION_META[c].title}</T>
                <T v="small" color={colors.inkDim}>{CRITERION_META[c].sub}</T>
              </View>
            </Tap>
          ))}
        </View>
      ) : (
        <View style={{ marginTop: space.xl, gap: space.sm }}>
          <Button title={redoing ? 'Save' : 'Enter the exchange'} onPress={finish} loading={busy} />
          <Button kind="quiet" title="Start over" onPress={() => setOrder([])} />
        </View>
      )}
    </Page>
  );
}
