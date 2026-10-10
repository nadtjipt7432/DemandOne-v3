/**
 * Capability, background and proof links — one form for onboarding and for
 * editing later. Capabilities are interpreted into exchange categories the user
 * can correct; they inform matching and never create an Offer.
 */
import { useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { interpretCapability } from '@/domain/intents';
import { validateProfile } from '@/domain/identity';
import { isNativeSpeechAvailable, startListening } from '@/infra/voice';
import { setCapabilityProfile, updateProfile } from '@/services/account';
import { useAppState } from '@/state/hooks';
import { colors, radius, space } from '@/theme';
import type { Person } from '@/domain/types';
import { Button, Field, Row, Stack, T } from './core';
import { Icon } from './Icon';

export function CapabilityForm({ viewer, submitLabel, onDone, onSkip }: { viewer: Person; submitLabel: string; onDone: () => void; onSkip?: () => void }) {
  const { categories } = useAppState();
  const [summary, setSummary] = useState(viewer.capability?.summary ?? '');
  const [picked, setPicked] = useState<string[] | null>(viewer.capability?.categories ?? null);
  const [background, setBackground] = useState(viewer.background ?? '');
  const [links, setLinks] = useState((viewer.links ?? []).join('\n'));
  const [errors, setErrors] = useState<{ background?: string; links?: string; summary?: string }>({});
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const stopRef = useRef<{ stop: () => void } | null>(null);

  const inferred = useMemo(() => interpretCapability(summary), [summary]);
  const selected = picked ?? inferred.categories;

  const toggle = (id: string) => setPicked((p) => {
    const base = p ?? inferred.categories;
    return base.includes(id) ? base.filter((c) => c !== id) : [...base, id];
  });

  const listen = () => {
    if (listening) {
      stopRef.current?.stop();
      setListening(false);
      return;
    }
    if (!isNativeSpeechAvailable()) return setErrors({ summary: 'Speech input isn’t available in this browser — type instead.' });
    setListening(true);
    stopRef.current = startListening(
      (heard) => {
        setListening(false);
        setSummary((s) => (s ? `${s} ${heard}` : heard));
      },
      () => setListening(false)
    ) ?? null;
  };

  const save = async () => {
    const check = validateProfile({ background, links });
    if (!check.ok) return setErrors(check.errors);
    if (summary.trim() && selected.length === 0) return setErrors({ summary: 'Pick at least one area this applies to.' });
    setErrors({});
    setBusy(true);
    await updateProfile({ background, links });
    if (summary.trim()) {
      await setCapabilityProfile({ summary: summary.trim(), categories: selected, workTypes: inferred.workTypes });
      onDone();
    } else {
      (onSkip ?? onDone)();
    }
    setBusy(false);
  };

  return (
    <Stack gap={space.xl}>
      <View style={{ gap: 6 }}>
        <Row justify="space-between">
          <T v="label" color={colors.inkDim}>What you can offer</T>
          <Pressable accessibilityRole="button" accessibilityLabel={listening ? 'Stop listening' : 'Speak your capabilities'} onPress={listen} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 6 }}>
            <Icon name={listening ? 'stop' : 'mic'} size={16} color={colors.forest} />
            <T v="label" color={colors.forest}>{listening ? 'Listening…' : 'Speak'}</T>
          </Pressable>
        </Row>
        <Field label="Capabilities" value={summary} onChangeText={(t) => { setSummary(t); setPicked(null); }} placeholder="e.g. Financial modeling, market research, valuation" multiline error={errors.summary} />
      </View>

      {summary.trim() ? (
        <View style={{ gap: 6 }}>
          <T v="label" color={colors.inkDim}>Where this is relevant</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {categories.map((c) => {
              const on = selected.includes(c.id);
              return (
                <Pressable key={c.id} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={c.label} onPress={() => toggle(c.id)} style={{ minHeight: 34, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1, borderColor: on ? colors.forest : colors.rule, backgroundColor: on ? colors.forestSoft : 'transparent', justifyContent: 'center' }}>
                  <T v="small" color={on ? colors.forest : colors.inkDim}>{c.label}</T>
                </Pressable>
              );
            })}
          </View>
          <T v="small" color={colors.inkFaint}>This tunes your exchange and surfaces demand. It doesn’t post an offer.</T>
        </View>
      ) : null}

      <Field label="Professional background (optional)" value={background} onChangeText={setBackground} placeholder="e.g. Six years in transaction services at a Big Four firm" multiline error={errors.background} />
      <Field label="LinkedIn or proof links (optional)" value={links} onChangeText={setLinks} placeholder="linkedin.com/in/you" autoCapitalize="none" keyboardType="url" multiline error={errors.links} hint="One per line." />

      <Stack gap={space.sm}>
        <Button title={submitLabel} onPress={save} loading={busy} />
        {onSkip ? <Button kind="quiet" title="Skip for now" onPress={onSkip} /> : null}
      </Stack>
    </Stack>
  );
}
