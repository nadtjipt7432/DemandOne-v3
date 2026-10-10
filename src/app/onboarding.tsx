import Feather from '@expo/vector-icons/Feather';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Btn, Divider, Row, Screen, Txt } from '@/components/base';
import { CRITERION_META } from '@/domain/matching';
import { setStandardOfValue } from '@/services/account';
import { useAppState } from '@/state/hooks';
import { colors, fontDisplay, space } from '@/theme';
import type { Criterion } from '@/domain/types';

const CRITERIA: { key: Criterion; title: string; sub: string }[] = (
  ['expertise', 'trust', 'budget', 'geography'] as Criterion[]
).map((key) => ({ key, ...CRITERION_META[key] }));

export default function Onboarding() {
  const router = useRouter();
  const [order, setOrder] = useState<Criterion[]>([]);
  const [busy, setBusy] = useState(false);

  const remaining = CRITERIA.filter((c) => !order.includes(c.key));
  const pickCriterion = (key: Criterion) => setOrder((o) => [...o, key]);

  const { account } = useAppState();
  // Redoing it from You returns there; during onboarding the route guard moves on to Today.
  const redoing = account?.onboarding === 'done';

  const finish = async () => {
    setBusy(true);
    await setStandardOfValue(order);
    setBusy(false);
    if (redoing) router.canGoBack() ? router.back() : router.replace('/you');
  };

  return (
    <Screen scroll>
      <Txt variant="title" style={{ marginTop: space.sm, fontFamily: fontDisplay }}>
        What matters most to you?
      </Txt>
      <Txt variant="small" color={colors.textDim} style={{ marginTop: space.xs }}>
        Tap in order, most important first. This becomes your Standard of Value — every listing is
        scored against it, and you can always see why. (Timing isn't here because it's never
        negotiable — a card either fits your schedule or it isn't shown.)
      </Txt>

      {order.length > 0 && (
        <View style={{ marginTop: space.lg, gap: space.lg }}>
          {order.map((key, i) => {
            const c = CRITERIA.find((x) => x.key === key)!;
            return (
              <Row key={key} gap={space.md} style={{ alignItems: 'flex-start' }}>
                <Txt style={{ fontFamily: fontDisplay, fontSize: 20, lineHeight: 26, color: colors.accent }}>
                  {String(i + 1).padStart(2, '0')} —
                </Txt>
                <View style={{ flex: 1 }}>
                  <Txt style={{ fontFamily: fontDisplay, fontSize: 19, lineHeight: 26, color: colors.text }}>{c.title}</Txt>
                  <Txt variant="small" color={colors.textFaint} style={{ marginTop: 2 }}>
                    {c.sub}
                  </Txt>
                </View>
              </Row>
            );
          })}
        </View>
      )}

      {remaining.length > 0 ? (
        <View style={{ marginTop: space.xl }}>
          {remaining.map((c, i) => (
            <View key={c.key}>
              {i > 0 ? <Divider /> : null}
              <Pressable onPress={() => pickCriterion(c.key)} style={({ pressed }) => [{ paddingVertical: space.md }, pressed && { opacity: 0.6 }]}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <Txt variant="body">{c.title}</Txt>
                    <Txt variant="small" color={colors.textFaint}>
                      {c.sub}
                    </Txt>
                  </View>
                  <Feather name="chevron-right" size={18} color={colors.textFaint} />
                </Row>
              </Pressable>
            </View>
          ))}
        </View>
      ) : (
        <Btn title="Finish setup" icon="check" loading={busy} style={{ marginTop: space.xl }} onPress={finish} />
      )}
    </Screen>
  );
}

