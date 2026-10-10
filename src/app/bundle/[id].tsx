import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Btn, Row, Screen, Txt } from '@/components/base';
import { Header, StatusDot } from '@/components/domain';
import { useAppState } from '@/state/hooks';
import { joinBundle } from '@/services/market';
import { colors, radius, space } from '@/theme';

export default function BundleScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { bundles } = useAppState();
  const bundle = bundles[id];
  const [busy, setBusy] = useState(false);

  if (!bundle) {
    return (
      <Screen>
        <Header onBack={() => router.back()} title="Bundled engagement" />
        <Txt variant="body" color={colors.textDim}>
          This is no longer open.
        </Txt>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Header onBack={() => router.back()} title="Bundled engagement" />
      <Txt variant="title" style={{ marginTop: space.sm }}>
        Three companies unlock a better clearing price.
      </Txt>
      <Txt variant="small" color={colors.textDim} style={{ marginTop: 4 }}>
        Your agent found companies running similar work and combined the ask.
      </Txt>

      <Txt variant="small" color={colors.textFaint} style={{ marginTop: space.xl }}>
        {bundle.personName}
      </Txt>
      <Row gap={space.sm} style={{ marginTop: space.sm }}>
        {bundle.slots.map((s) => (
          <View
            key={s.label}
            style={{
              flex: 1,
              backgroundColor: colors.surface2,
              borderRadius: radius.surface,
              padding: space.md,
              alignItems: 'center',
            }}>
            <Txt variant="small" color={colors.textFaint}>
              {s.label}
            </Txt>
            <Txt variant="heading" style={{ marginTop: 4 }}>
              {s.value}
            </Txt>
            <Txt variant="small" color={colors.textFaint} style={{ marginTop: 2 }}>
              {s.sub}
            </Txt>
          </View>
        ))}
      </Row>
      <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.surface2, marginTop: space.lg, overflow: 'hidden' }}>
        <View
          style={{
            height: 4,
            borderRadius: 2,
            backgroundColor: colors.accent,
            width: `${Math.round((bundle.confirmedCount / bundle.totalCount) * 100)}%`,
          }}
        />
      </View>
      <Row style={{ justifyContent: 'space-between', marginTop: space.sm }}>
        <Txt variant="small" color={colors.textFaint}>
          {bundle.confirmedCount} of {bundle.totalCount} confirmed
        </Txt>
        <Txt variant="small" color={colors.accent}>
          ${bundle.savedEach} lower each
        </Txt>
      </Row>

      <Txt variant="small" color={colors.textFaint} style={{ marginTop: space.xl }}>
        What your agent is doing
      </Txt>
      <View style={{ marginTop: space.sm, gap: space.sm }}>
        {bundle.steps.map((s, i) => (
          <Row key={i} gap={space.sm} style={{ alignItems: 'flex-start' }}>
            <View style={{ marginTop: 6 }}>
              <StatusDot color={i === 0 ? colors.accent : colors.borderStrong} />
            </View>
            <Txt variant="small" color={i === 0 ? colors.text : colors.textDim} style={{ flex: 1 }}>
              {s}
            </Txt>
          </Row>
        ))}
      </View>

      <View style={{ marginTop: space.xl, gap: space.md }}>
        <Btn
          title={`Join · $${bundle.yourPrice}`}
          loading={busy}
          onPress={async () => {
            setBusy(true);
            const bookingId = await joinBundle(bundle.id);
            router.replace({ pathname: '/confirmation/[id]', params: { id: bookingId } });
          }}
        />
        <Btn title={`Keep my original $${bundle.originalPrice} engagement`} variant="secondary" onPress={() => router.back()} />
        <Txt variant="small" color={colors.textFaint} style={{ textAlign: 'center' }}>
          Every company's deal terms stay private until approval.
        </Txt>
      </View>
    </Screen>
  );
}
