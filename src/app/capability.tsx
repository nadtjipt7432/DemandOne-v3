import { View } from 'react-native';
import { skipCapability } from '@/services/account';
import { useViewer } from '@/state/hooks';
import { AmbientField } from '@/ui/Ambient';
import { CapabilityForm } from '@/ui/CapabilityForm';
import { Page, T } from '@/ui/core';
import { colors, space } from '@/theme';

/** Onboarding step 2. Saving or skipping advances onboarding; the route guard moves on. */
export default function Capability() {
  const viewer = useViewer();
  return (
    <Page backdrop={<AmbientField mood="listening" height={260} />}>
      <View style={{ marginTop: space.xxl, marginBottom: space.xl }}>
        <T v="label" color={colors.inkDim}>Step 1 of 2</T>
        <T v="display" style={{ marginTop: space.xs }}>What can you do?</T>
        <T v="body" color={colors.inkDim} style={{ marginTop: space.sm }}>Say it or type it. DemandOne works out where it’s relevant and shows you demand for it.</T>
      </View>
      <CapabilityForm viewer={viewer} submitLabel="Save and continue" onDone={() => {}} onSkip={skipCapability} />
    </Page>
  );
}
