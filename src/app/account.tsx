import Feather from '@expo/vector-icons/Feather';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Btn, Divider, InfoRow, Screen, Txt } from '@/components/base';
import { CapabilityEditor } from '@/components/CapabilityEditor';
import { Header } from '@/components/domain';
import { LocationPicker } from '@/components/LocationPicker';
import { useAppState } from '@/state/hooks';
import { setCapabilityProfile, setLocation } from '@/services/market';
import { colors, space } from '@/theme';
import type { CapabilityProfile } from '@/domain/types';

export default function Account() {
  const router = useRouter();
  const { people, viewerId } = useAppState();
  const viewer = people[viewerId];
  const [editingLocation, setEditingLocation] = useState(false);
  const [editingCapability, setEditingCapability] = useState(false);
  const [busy, setBusy] = useState(false);

  const saveLocation = async (loc: string) => {
    setBusy(true);
    await setLocation(loc);
    setBusy(false);
    setEditingLocation(false);
  };

  const saveCapability = async (profile: CapabilityProfile) => {
    await setCapabilityProfile(profile);
    setEditingCapability(false);
  };

  return (
    <Screen scroll>
      <Header onBack={() => router.back()} title="Account & login" />

      <View style={{ marginTop: space.lg }}>
        <InfoRow icon="user" label={viewer.name} value="Name" />
        <Divider />
        <InfoRow icon="mail" label={viewer.email ?? 'Not set'} value="Email" />
        <Divider />
        {editingLocation ? (
          <View style={{ paddingVertical: space.md, gap: space.sm }}>
            <Txt variant="small" color={colors.textFaint}>
              Location
            </Txt>
            {busy ? (
              <Txt variant="small" color={colors.textFaint}>
                Saving…
              </Txt>
            ) : (
              <LocationPicker onChange={saveLocation} />
            )}
            <Btn title="Cancel" variant="ghost" onPress={() => setEditingLocation(false)} />
          </View>
        ) : (
          <InfoRow
            icon="map-pin"
            label={viewer.location}
            value="Location"
            right={<Feather name="chevron-right" size={16} color={colors.textFaint} />}
            onPress={() => setEditingLocation(true)}
          />
        )}
        <Divider />
        {editingCapability ? (
          <View style={{ paddingVertical: space.md, gap: space.sm }}>
            <Txt variant="small" color={colors.textFaint}>
              Capability
            </Txt>
            <CapabilityEditor initial={viewer.capability} onSave={saveCapability} />
            <Btn title="Cancel" variant="ghost" onPress={() => setEditingCapability(false)} />
          </View>
        ) : (
          <InfoRow
            icon="compass"
            label={viewer.capability?.summary || 'Not set'}
            value="Capability"
            right={<Feather name="chevron-right" size={16} color={colors.textFaint} />}
            onPress={() => setEditingCapability(true)}
          />
        )}
      </View>

      <Txt variant="small" color={colors.textFaint} style={{ marginTop: space.xl }}>
        Your data is not inventory. Never sold, never used for advertising.
      </Txt>

      <Btn title="Sign out" variant="ghost" style={{ marginTop: space.xl }} onPress={() => router.replace('/')} />
    </Screen>
  );
}
