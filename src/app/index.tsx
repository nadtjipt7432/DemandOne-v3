import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppState } from '@/state/hooks';
import { AmbientField, CircleMark } from '@/ui/Ambient';
import { Button, Row, T } from '@/ui/core';
import { field, MAX_WIDTH, space } from '@/theme';

/**
 * Landing — the brand moment. A night field, the two circles of the mark (buyer
 * and seller) drifting toward each other, and one plain promise. Counts are the
 * real open positions in the market.
 */
export default function Landing() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { cards } = useAppState();
  const needs = cards.filter((c) => c.kind === 'need').length;
  const offers = cards.filter((c) => c.kind === 'offer').length;

  return (
    <View style={{ flex: 1, backgroundColor: field.night }}>
      <AmbientField mood="night" breathe />
      <View style={{ flex: 1, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', paddingHorizontal: space.xl, paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xl }}>
        <Row gap={space.sm}>
          <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#2E6A58' }} />
          <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: field.amber, marginLeft: -8, opacity: 0.9 }} />
          <T v="entry" color={field.nightInk} style={{ marginLeft: 4 }}>DemandOne</T>
        </Row>

        <View style={{ flex: 1, justifyContent: 'center', paddingVertical: space.xl }}>
          <CircleMark size={150} meet onNight style={{ marginBottom: space.xxl }} />
          <T v="hero" color={field.nightInk}>Say what you need. Say what you can do.</T>
          <T v="body" color={field.nightDim} style={{ marginTop: space.md, maxWidth: 360 }}>
            An agent turns it into terms, finds the other side of the market, negotiates, and waits for your yes.
          </T>
        </View>

        <View style={{ gap: space.md }}>
          <Row style={{ borderTopWidth: 1, borderColor: 'rgba(242,237,226,0.18)', paddingTop: space.md }} gap={space.xxl}>
            <View>
              <T v="price" color={field.nightInk}>{needs}</T>
              <T v="label" color={field.nightDim}>open needs</T>
            </View>
            <View>
              <T v="price" color={field.nightInk}>{offers}</T>
              <T v="label" color={field.nightDim}>open offers</T>
            </View>
          </Row>
          <Button kind="inverse" title="Enter with your email" onPress={() => router.push('/login')} />
          <T v="small" color={field.nightDim} align="center">New or returning. Nothing binds until you approve it.</T>
        </View>
      </View>
    </View>
  );
}
