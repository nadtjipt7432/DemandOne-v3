import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Btn, Field, Row, Screen, Txt } from '@/components/base';
import { DotScatter, Logomark } from '@/components/domain';
import { LocationPicker } from '@/components/LocationPicker';
import { isValidCode, isValidEmail } from '@/domain/identity';
import { createAccount, lookupAccount, resetDevice, signIn, storedAccountName } from '@/services/account';
import { colors, fontDisplay, radius, space } from '@/theme';

type Step = 'email' | 'details' | 'other-account' | 'code';

/**
 * Passwordless entry, mocked (any six-digit code verifies). Email first: an email
 * this device already knows signs back into that account with everything intact;
 * a new one goes on to name and location, which become the new profile. Where to
 * go afterwards is the route guard's job (domain/identity.ts), not this screen's.
 */
export default function Login() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [pickingLocation, setPickingLocation] = useState(false);
  const [code, setCode] = useState('');
  const [returning, setReturning] = useState(false);
  const [eraseArmed, setEraseArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  const submitEmail = () => {
    if (!isValidEmail(email)) return;
    const lookup = lookupAccount(email);
    setReturning(lookup === 'this-account');
    setStep(lookup === 'this-account' ? 'code' : lookup === 'other-account' ? 'other-account' : 'details');
  };

  const eraseAndContinue = async () => {
    if (!eraseArmed) {
      setEraseArmed(true);
      return;
    }
    setBusy(true);
    await resetDevice();
    setBusy(false);
    setEraseArmed(false);
    setStep('details');
  };

  const verify = async () => {
    if (!isValidCode(code)) return;
    setBusy(true);
    if (returning) await signIn(email);
    else await createAccount({ name, email, location: location || undefined });
    setBusy(false);
  };

  return (
    <Screen scroll contentStyle={{ flexGrow: 1 }}>
      <View style={{ flex: 1 }}>
        <DotScatter size={110} style={{ position: 'absolute', top: space.xl, right: -12, opacity: 0.5 }} />
        <View style={{ flex: 1, justifyContent: 'center', gap: space.xl }}>
          <Row gap={space.sm}>
            <Logomark size={20} />
            <Txt variant="bodyStrong" style={{ fontFamily: fontDisplay }}>
              DemandOne
            </Txt>
          </Row>

          {step === 'email' ? (
            <>
              <Txt variant="title" style={{ fontFamily: fontDisplay }}>
                Enter the market.
              </Txt>
              <Labeled label="Email">
                <Field
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@email.com"
                  accessibilityLabel="Email"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  onSubmitEditing={submitEmail}
                />
              </Labeled>
              <Btn title="Continue" icon="arrow-right" disabled={!isValidEmail(email)} onPress={submitEmail} />
            </>
          ) : null}

          {step === 'details' ? (
            <>
              <Txt variant="title" style={{ fontFamily: fontDisplay }}>
                Create your account.
              </Txt>
              <View style={{ gap: space.lg }}>
                <Labeled label="Name">
                  <Field value={name} onChangeText={setName} placeholder="Your name" accessibilityLabel="Name" autoCapitalize="words" />
                </Labeled>
                <Labeled label="Location (optional)">
                  {pickingLocation ? (
                    <LocationPicker
                      onChange={(loc) => {
                        setLocation(loc);
                        setPickingLocation(false);
                      }}
                    />
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Choose location"
                      onPress={() => setPickingLocation(true)}
                      style={({ pressed }) => pressed && { opacity: 0.6 }}>
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
                          {location ? 'Change' : 'Choose'}
                        </Txt>
                      </Row>
                    </Pressable>
                  )}
                </Labeled>
              </View>
              <Btn title="Continue" icon="arrow-right" disabled={!name.trim()} onPress={() => setStep('code')} />
              <Btn title="Use a different email" variant="ghost" onPress={() => setStep('email')} />
            </>
          ) : null}

          {step === 'other-account' ? (
            <>
              <Txt variant="title" style={{ fontFamily: fontDisplay }}>
                This device already has an account.
              </Txt>
              <Txt variant="body" color={colors.textDim}>
                It belongs to {storedAccountName() ?? 'someone else'}. Sign in with that account's email, or erase it to
                create a new one here.
              </Txt>
              <Btn title="Use a different email" onPress={() => setStep('email')} />
              <Btn
                title={eraseArmed ? 'Tap again to erase it' : 'Erase it and create a new account'}
                variant="ghost"
                loading={busy}
                onPress={eraseAndContinue}
              />
            </>
          ) : null}

          {step === 'code' ? (
            <>
              <Txt variant="title" style={{ fontFamily: fontDisplay }}>
                {returning ? `Welcome back${storedAccountName() ? `, ${storedAccountName()!.split(' ')[0]}` : ''}.` : 'Check your email.'}
              </Txt>
              <Txt variant="body" color={colors.textDim}>
                We sent a six-digit code to {email.trim()}.
              </Txt>
              <Field
                value={code}
                onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
                placeholder="— — — — — —"
                accessibilityLabel="Verification code"
                keyboardType="number-pad"
                onSubmitEditing={verify}
              />
              <Txt variant="small" color={colors.textFaint}>
                Demo: any six digits work.
              </Txt>
              <Btn title="Verify" icon="arrow-right" loading={busy} disabled={!isValidCode(code)} onPress={verify} />
              <Btn title="Back" variant="ghost" onPress={() => setStep(returning ? 'email' : 'details')} />
            </>
          ) : null}
        </View>
      </View>
    </Screen>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View>
      <Txt variant="small" color={colors.textFaint} style={{ marginBottom: 6 }}>
        {label}
      </Txt>
      {children}
    </View>
  );
}
