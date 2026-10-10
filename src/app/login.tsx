import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { isValidCode, isValidEmail, validateProfile } from '@/domain/identity';
import { createAccount, lookupAccount, resetDevice, signIn, storedAccountName } from '@/services/account';
import { AmbientField } from '@/ui/Ambient';
import { Button, Field, Page, Stack, T, TopBar } from '@/ui/core';
import { colors, space } from '@/theme';

type Step = 'email' | 'details' | 'other-account' | 'code';

/**
 * Passwordless entry (mocked: any six digits verify). Email first — a known
 * email restores its account; a new one creates a profile from exactly what's
 * entered here. Where to go next is the route guard's job.
 */
export default function Login() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [code, setCode] = useState('');
  const [returning, setReturning] = useState(false);
  const [eraseArmed, setEraseArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; name?: string; location?: string; code?: string }>({});

  const submitEmail = () => {
    if (!isValidEmail(email)) return setErrors({ email: 'Enter a valid email address.' });
    setErrors({});
    const lookup = lookupAccount(email);
    setReturning(lookup === 'this-account');
    setStep(lookup === 'this-account' ? 'code' : lookup === 'other-account' ? 'other-account' : 'details');
  };

  const submitDetails = () => {
    const check = validateProfile({ name, location });
    if (!check.ok) return setErrors(check.errors);
    setErrors({});
    setStep('code');
  };

  const erase = async () => {
    if (!eraseArmed) return setEraseArmed(true);
    setBusy(true);
    await resetDevice();
    setBusy(false);
    setEraseArmed(false);
    setStep('details');
  };

  const verify = async () => {
    if (!isValidCode(code)) return setErrors({ code: 'Enter the six-digit code.' });
    setBusy(true);
    try {
      if (returning) await signIn(email);
      else await createAccount({ name, email, location });
    } catch (e) {
      setErrors({ code: e instanceof Error ? e.message : 'Something went wrong. Try again.' });
    } finally {
      setBusy(false);
    }
  };

  const welcome = storedAccountName()?.split(' ')[0];

  return (
    <Page backdrop={<AmbientField mood="listening" height={300} />}>
      <TopBar onBack={() => (step === 'email' ? router.back() : setStep(step === 'code' && !returning ? 'details' : 'email'))} />
      <View style={{ marginTop: space.xxl }}>
        {step === 'email' ? (
          <Stack gap={space.xl}>
            <T v="display">Enter the market.</T>
            <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@company.com" keyboardType="email-address" autoCapitalize="none" onSubmitEditing={submitEmail} error={errors.email} />
            <Button title="Continue" onPress={submitEmail} disabled={!email.trim()} />
          </Stack>
        ) : null}

        {step === 'details' ? (
          <Stack gap={space.xl}>
            <T v="display">Create your account.</T>
            <T v="body" color={colors.inkDim}>This becomes your profile. You can change any of it later.</T>
            <Field label="Name" value={name} onChangeText={setName} placeholder="Your full name" autoCapitalize="words" error={errors.name} />
            <Field label="Location (optional)" value={location} onChangeText={setLocation} placeholder="City, e.g. London" autoCapitalize="words" error={errors.location} hint="Leave blank if you'd rather not say." />
            <Button title="Continue" onPress={submitDetails} disabled={!name.trim()} />
          </Stack>
        ) : null}

        {step === 'other-account' ? (
          <Stack gap={space.lg}>
            <T v="display">This device already has an account.</T>
            <T v="body" color={colors.inkDim}>{`It belongs to ${storedAccountName() ?? 'someone else'}. Sign in with that email, or erase it to create a new account here.`}</T>
            <Button title="Use a different email" onPress={() => setStep('email')} />
            <Button kind="danger" title={eraseArmed ? 'Tap again to erase it' : 'Erase it and create a new account'} onPress={erase} loading={busy} />
          </Stack>
        ) : null}

        {step === 'code' ? (
          <Stack gap={space.xl}>
            <T v="display">{returning ? `Welcome back${welcome ? `, ${welcome}` : ''}.` : 'Check your email.'}</T>
            <T v="body" color={colors.inkDim}>{`We sent a six-digit code to ${email.trim()}. Demo: any six digits work.`}</T>
            <Field label="Verification code" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))} placeholder="000000" keyboardType="number-pad" onSubmitEditing={verify} error={errors.code} />
            <Button title="Verify" onPress={verify} loading={busy} disabled={code.length !== 6} />
          </Stack>
        ) : null}
      </View>
    </Page>
  );
}
