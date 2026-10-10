import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Btn, Field, Row, Screen, Txt } from '@/components/base';
import { DotScatter, Logomark } from '@/components/domain';
import { LocationPicker } from '@/components/LocationPicker';
import { useAppState } from '@/state/hooks';
import { setIdentity, setLocation } from '@/services/market';
import { colors, fontDisplay, radius, space } from '@/theme';

/**
 * Quiet passwordless login — mocked exactly like every other "stubbed but
 * structurally real" interaction in this app (voice's simulateTranscript, the
 * Authorize toggle in confirmation/[id].tsx): no real send/verify, just the same
 * two-step shape a real one would have. Single-user prototype, so "Enter DemandOne"
 * and "Sign in" on the landing page both land here.
 */
export default function Login() {
  const router = useRouter();
  const { onboarded, people, viewerId } = useAppState();
  const [step, setStep] = useState<'details' | 'code'>('details');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  // Optional, like the rest of the minimum initial profile — pre-filled so a
  // returning demo user sees where they're already set, not a blank field.
  const [location, setLocationValue] = useState(people[viewerId].location);
  const [pickingLocation, setPickingLocation] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const continueToCode = () => {
    if (!name.trim() || !email.trim()) return;
    setStep('code');
  };

  const verify = async () => {
    setBusy(true);
    await setIdentity(name.trim(), email.trim());
    if (location.trim()) await setLocation(location.trim());
    await new Promise((r) => setTimeout(r, 400));
    setBusy(false);
    const hasCapability = !!people[viewerId].capability;
    router.replace(hasCapability ? (onboarded ? '/today' : '/onboarding') : '/capability');
  };

  return (
    <Screen scroll contentStyle={{ flexGrow: 1 }}>
      <View style={{ flex: 1 }}>
        <DotScatter size={110} style={{ position: 'absolute', top: space.xl, right: -12, opacity: 0.5 }} />
        {/* Expanding the location picker can make this taller than some phones'
            viewports — `scroll` above is the safety net, same fix as the landing
            page; `justifyContent: 'center'` still keeps it looking pinned when it fits. */}
        <View style={{ flex: 1, justifyContent: 'center', gap: space.xl }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Logomark size={20} />
            <Txt variant="bodyStrong" style={{ fontFamily: fontDisplay }}>
              DemandOne
            </Txt>
          </View>

          {step === 'details' ? (
            <>
              <Txt variant="title" style={{ fontFamily: fontDisplay }}>
                Enter the market.
              </Txt>
              <View style={{ gap: space.lg }}>
                <View>
                  <Txt variant="small" color={colors.textFaint} style={{ marginBottom: 6 }}>
                    Name
                  </Txt>
                  <Field value={name} onChangeText={setName} placeholder="Your name" />
                </View>
                <View>
                  <Txt variant="small" color={colors.textFaint} style={{ marginBottom: 6 }}>
                    Email
                  </Txt>
                  <Field value={email} onChangeText={setEmail} placeholder="you@email.com" />
                </View>
                <View>
                  <Txt variant="small" color={colors.textFaint} style={{ marginBottom: 6 }}>
                    Location (optional)
                  </Txt>
                  {pickingLocation ? (
                    <LocationPicker
                      onChange={(loc) => {
                        setLocationValue(loc);
                        setPickingLocation(false);
                      }}
                    />
                  ) : (
                    <Pressable onPress={() => setPickingLocation(true)} style={({ pressed }) => pressed && { opacity: 0.6 }}>
                      <Row
                        style={{
                          justifyContent: 'space-between',
                          paddingHorizontal: space.lg,
                          paddingVertical: space.md,
                          borderRadius: radius.control,
                          borderWidth: 1,
                          borderColor: colors.border,
                          backgroundColor: colors.surface,
                        }}>
                        <Txt variant="body" color={location ? colors.text : colors.textFaint}>
                          {location || 'Not set'}
                        </Txt>
                        <Txt variant="small" color={colors.accent}>
                          Change
                        </Txt>
                      </Row>
                    </Pressable>
                  )}
                </View>
              </View>
              <Btn
                title="Continue"
                icon="arrow-right"
                disabled={!name.trim() || !email.trim()}
                onPress={continueToCode}
              />
            </>
          ) : (
            <>
              <Txt variant="title" style={{ fontFamily: fontDisplay }}>
                Check your email.
              </Txt>
              <Txt variant="body" color={colors.textDim}>
                We sent a six-digit code to{'\n'}
                {email}.
              </Txt>
              <Field value={code} onChangeText={setCode} placeholder="— — — — — —" keyboardType="number-pad" />
              <Btn title="Verify" icon="arrow-right" loading={busy} disabled={!code.trim()} onPress={verify} />
              <Btn title="Edit details" variant="ghost" onPress={() => setStep('details')} />
            </>
          )}
        </View>
      </View>
    </Screen>
  );
}
