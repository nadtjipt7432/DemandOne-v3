import { useRouter } from 'expo-router';
import { useState } from 'react';
import type { ProfileErrors } from '@/domain/identity';
import { updateProfile } from '@/services/account';
import { useAppState, useViewer } from '@/state/hooks';
import { CapabilityForm } from '@/ui/CapabilityForm';
import { Button, Field, KeyValue, Page, Rule, Section, Stack, T, TopBar } from '@/ui/core';
import { colors, space } from '@/theme';

/** Edit profile — the same single record shown on Profile. Validated, with save feedback. */
export default function EditProfile() {
  const router = useRouter();
  const { account } = useAppState();
  const viewer = useViewer();
  const [name, setName] = useState(viewer.name);
  const [location, setLocation] = useState(viewer.location);
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setSaved(null);
    const res = await updateProfile({ name, location });
    setBusy(false);
    if (!res.ok) return setErrors(res.errors);
    setErrors({});
    setSaved('Saved.');
  };

  return (
    <Page>
      <TopBar onBack={() => router.back()} />
      <T v="display">Edit profile</T>

      <Section title="Identity" ruled>
        <Stack gap={space.lg} style={{ marginTop: space.md }}>
          <Field label="Name" value={name} onChangeText={(t) => { setName(t); setSaved(null); }} autoCapitalize="words" error={errors.name} />
          <Field label="Location" value={location} onChangeText={(t) => { setLocation(t); setSaved(null); }} placeholder="Not set" autoCapitalize="words" error={errors.location} hint="Leave blank to keep it private." />
          <Button title="Save" onPress={save} loading={busy} />
          {saved ? <T v="small" color={colors.forest} testID="profile-saved">{saved}</T> : null}
        </Stack>
        <Rule style={{ marginTop: space.lg }} />
        <KeyValue label="Email" value={account?.email ?? ''} />
        <T v="small" color={colors.inkFaint}>Your email identifies your account and can’t be changed here.</T>
      </Section>

      <Section title="Capabilities, background and links" ruled>
        <Stack style={{ marginTop: space.md }}>
          <CapabilityForm viewer={viewer} submitLabel="Save" onDone={() => setSaved('Saved.')} />
        </Stack>
      </Section>
    </Page>
  );
}
