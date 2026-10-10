import { useRef, useState } from 'react';
import { View } from 'react-native';
import { Btn, Chip, Field, IconButton, Row, Segmented, Txt } from './base';
import { interpretCapability, WORK_LABEL } from '@/domain/intents';
import { useAppState } from '@/state/hooks';
import { simulateTranscript, startListening } from '@/infra/voice';
import { colors, space } from '@/theme';
import type { CapabilityProfile, LocationMode, WorkCategory } from '@/domain/types';

const EXAMPLES = [
  "I'm a finance student with experience in financial modeling, valuation, and market research. I can help startups build models or prepare investor materials.",
  "I'm an independent strategy consultant and have capacity for one commercial diligence project this month.",
];

const WORK_OPTIONS = Object.keys(WORK_LABEL) as WorkCategory[];

/**
 * Natural language → capability interpretation → user confirmation → persistent
 * profile. Used both at capability onboarding (fresh, starts on the text step) and
 * from Account (editing an existing profile, starts straight on the confirm step
 * since there's already something to adjust rather than re-describe).
 */
export function CapabilityEditor({
  initial,
  onSave,
  onSkip,
}: {
  initial?: CapabilityProfile;
  onSave: (profile: CapabilityProfile) => void;
  onSkip?: () => void;
}) {
  const { categories } = useAppState();
  const [step, setStep] = useState<'input' | 'confirm'>(initial ? 'confirm' : 'input');
  const [summary, setSummary] = useState(initial?.summary ?? '');
  const [lastInterpretedText, setLastInterpretedText] = useState(initial?.summary ?? '');
  const [selectedCategories, setSelectedCategories] = useState<string[]>(initial?.categories ?? []);
  const [selectedWork, setSelectedWork] = useState<WorkCategory[]>(initial?.workTypes ?? []);
  const [locationMode, setLocationMode] = useState<LocationMode>(initial?.locationMode ?? 'remote');
  const [availabilityNote, setAvailabilityNote] = useState(initial?.availabilityNote ?? '');
  const [listening, setListening] = useState(false);
  const stopRef = useRef<{ stop: () => void } | null>(null);

  const toggleCategory = (id: string) =>
    setSelectedCategories((cur) => (cur.includes(id) ? cur.filter((c) => c !== id) : [...cur, id]));
  const toggleWork = (w: WorkCategory) =>
    setSelectedWork((cur) => (cur.includes(w) ? cur.filter((x) => x !== w) : [...cur, w]));

  const interpret = () => {
    if (!summary.trim()) return;
    const result = interpretCapability(summary);
    setSelectedCategories(result.categories);
    setSelectedWork(result.workTypes);
    setLastInterpretedText(summary);
    setStep('confirm');
  };

  const reinterpret = () => {
    const result = interpretCapability(summary);
    setSelectedCategories(result.categories);
    setSelectedWork(result.workTypes);
    setLastInterpretedText(summary);
  };

  const save = () => {
    onSave({
      summary: summary.trim(),
      categories: selectedCategories,
      workTypes: selectedWork,
      locationMode,
      availabilityNote: availabilityNote.trim() || undefined,
    });
  };

  const onMicPress = () => {
    if (listening) {
      stopRef.current?.stop();
      stopRef.current = null;
      setListening(false);
      return;
    }
    setListening(true);
    const fallback = () => {
      setTimeout(() => {
        setSummary(simulateTranscript());
        setListening(false);
      }, 700);
    };
    const handle = startListening((transcript) => {
      setSummary(transcript);
      setListening(false);
    }, fallback);
    if (handle) stopRef.current = handle;
    else fallback();
  };

  if (step === 'input') {
    return (
      <View style={{ gap: space.md }}>
        <Row gap={space.sm} style={{ alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Field value={summary} onChangeText={setSummary} placeholder="Tell DemandOne what you're good at…" multiline style={{ minHeight: 96 }} />
          </View>
          <IconButton icon="mic" onPress={onMicPress} color={listening ? colors.accent : colors.textFaint} />
        </Row>
        {listening ? (
          <Row gap={6}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent }} />
            <Txt variant="small" color={colors.textFaint}>
              Listening…
            </Txt>
          </Row>
        ) : null}
        <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
          {EXAMPLES.map((e) => (
            <Chip key={e} label={e.length > 46 ? `${e.slice(0, 46)}…` : e} onPress={() => setSummary(e)} />
          ))}
        </Row>
        <Btn title="Continue" icon="arrow-right" disabled={!summary.trim()} onPress={interpret} />
        {onSkip ? <Btn title="Skip for now" variant="ghost" onPress={onSkip} /> : null}
      </View>
    );
  }

  return (
    <View style={{ gap: space.lg }}>
      <View>
        <Txt variant="small" color={colors.textFaint} style={{ marginBottom: 6 }}>
          What you told us
        </Txt>
        <Field value={summary} onChangeText={setSummary} multiline style={{ minHeight: 72 }} />
        {summary.trim() !== lastInterpretedText.trim() ? (
          <Btn title="Re-interpret" variant="ghost" style={{ marginTop: space.xs }} onPress={reinterpret} />
        ) : null}
      </View>

      <View>
        <Txt variant="small" color={colors.textFaint} style={{ marginBottom: space.sm }}>
          Relevant to — tap to adjust
        </Txt>
        <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
          {categories.map((c) => (
            <Chip key={c.id} label={c.label} active={selectedCategories.includes(c.id)} onPress={() => toggleCategory(c.id)} />
          ))}
        </Row>
      </View>

      <View>
        <Txt variant="small" color={colors.textFaint} style={{ marginBottom: space.sm }}>
          Kind of work
        </Txt>
        <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
          {WORK_OPTIONS.map((w) => (
            <Chip key={w} label={WORK_LABEL[w]} active={selectedWork.includes(w)} onPress={() => toggleWork(w)} />
          ))}
        </Row>
      </View>

      <View>
        <Txt variant="small" color={colors.textFaint} style={{ marginBottom: space.sm }}>
          Where
        </Txt>
        <Segmented
          items={[
            { key: 'remote', label: 'Remote' },
            { key: 'in-person', label: 'In person' },
            { key: 'hybrid', label: 'Hybrid' },
          ]}
          value={locationMode}
          onChange={(k) => setLocationMode(k as LocationMode)}
        />
      </View>

      <View>
        <Txt variant="small" color={colors.textFaint} style={{ marginBottom: 6 }}>
          Availability (optional)
        </Txt>
        <Field value={availabilityNote} onChangeText={setAvailabilityNote} placeholder="e.g. a few hours most weeks" />
      </View>

      <Txt variant="small" color={colors.textFaint}>
        This is a profile, not an active offer — nothing is posted to the Exchange until you choose to turn a suggestion into one.
      </Txt>

      <Btn title="Save" icon="check" onPress={save} />
      {onSkip ? <Btn title="Skip for now" variant="ghost" onPress={onSkip} /> : null}
    </View>
  );
}
