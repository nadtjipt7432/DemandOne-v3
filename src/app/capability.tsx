import { View } from 'react-native';
import { Screen, Txt } from '@/components/base';
import { CapabilityEditor } from '@/components/CapabilityEditor';
import { setCapabilityProfile, skipCapability } from '@/services/account';
import { colors, fontDisplay, space } from '@/theme';
import type { CapabilityProfile } from '@/domain/types';

/**
 * Capability onboarding — asked once, right after login, before Standard of
 * Value. A capability profile is a standing description DemandOne can match
 * demand against (see myMarket.ts's getCapabilityOpportunities), not an active
 * Offer — nothing is posted to the Exchange from here. Skippable: a buyer who
 * has nothing to offer shouldn't be blocked from entering the market.
 */
export default function Capability() {
  // Both actions advance the onboarding step; the route guard moves on to the next screen.
  const onSave = (profile: CapabilityProfile) => setCapabilityProfile(profile);

  return (
    <Screen scroll>
      <Txt variant="title" style={{ marginTop: space.sm, fontFamily: fontDisplay }}>
        What are you good at?
      </Txt>
      <Txt variant="small" color={colors.textDim} style={{ marginTop: space.xs }}>
        What could you offer? Say it or type it — DemandOne works out where it's relevant.
      </Txt>

      <View style={{ marginTop: space.xl }}>
        <CapabilityEditor onSave={onSave} onSkip={skipCapability} />
      </View>
    </Screen>
  );
}
