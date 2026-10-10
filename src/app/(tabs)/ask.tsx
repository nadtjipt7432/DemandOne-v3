import Feather from '@expo/vector-icons/Feather';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Btn, Chip, Field, Row, Screen, Txt } from '@/components/base';
import { useAppState } from '@/state/hooks';
import { simulateTranscript, startListening } from '@/infra/voice';
import { colors, radius, space } from '@/theme';

const EXAMPLES = [
  'I need my taxes filed within the next two days',
  'We need a financial model for a fundraising round sometime next month',
  "I'm looking for a fractional CFO for the next six months",
  'I do M&A advisory and have capacity for two more clients this quarter',
  'I have two free hours Thursday and I\'m pretty good at Excel',
  'My daughter needs help with her college application essays',
];

export default function Ask() {
  const router = useRouter();
  const { autoListen } = useLocalSearchParams<{ autoListen?: string }>();
  const { people, viewerId } = useAppState();
  const viewer = people[viewerId];
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const stopRef = useRef<{ stop: () => void } | null>(null);
  const firedAutoListen = useRef(false);

  const submit = () => {
    if (!text.trim()) return;
    router.push({ pathname: '/intent-results', params: { text: text.trim() } });
  };

  // Speak → transcript → (the rest of this screen's existing flow). On web with native
  // speech recognition available, uses that; otherwise falls back to a deterministic
  // demo transcript — see data/voice.ts, the one place that knows the difference.
  const startVoice = () => {
    if (listening) {
      stopRef.current?.stop();
      stopRef.current = null;
      setListening(false);
      return;
    }
    setListening(true);
    const fallback = () => {
      setTimeout(() => {
        setText(simulateTranscript());
        setListening(false);
      }, 700);
    };
    const handle = startListening((transcript) => {
      setText(transcript);
      setListening(false);
    }, fallback);
    if (handle) stopRef.current = handle;
    else fallback();
  };

  // Tapping the mic tab (from anywhere in the app) lands here already listening — the
  // one-tap voice entry point the tab bar advertises.
  useEffect(() => {
    if (autoListen === 'true' && !firedAutoListen.current) {
      firedAutoListen.current = true;
      startVoice();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoListen]);

  return (
    <Screen scroll>
      <Txt variant="title" style={{ marginTop: space.sm }}>
        Talk to your agent
      </Txt>
      <Txt variant="small" color={colors.textDim} style={{ marginTop: space.xs }}>
        Describe your situation, not a category — say it or type it, whatever's true.
        DemandOne works out what's relevant, for what you need or what you can offer.
      </Txt>

      {/* Voice is the lead interaction here, not a buried icon — typing is the alternative. */}
      <View style={{ alignItems: 'center', marginTop: space.xl }}>
        <Pressable onPress={startVoice} style={({ pressed }) => pressed && { opacity: 0.8 }}>
          <View
            style={{
              width: 84,
              height: 84,
              borderRadius: radius.pill,
              backgroundColor: listening ? colors.accent2 : colors.accent,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: listening ? 3 : 0,
              borderColor: colors.accent2Soft,
            }}>
            <Feather name={listening ? 'square' : 'mic'} size={30} color={colors.accentText} />
          </View>
        </Pressable>
        <Txt variant="smallStrong" color={listening ? colors.accent2 : colors.textDim} style={{ marginTop: space.md }}>
          {listening ? 'Listening…' : 'Tap to speak'}
        </Txt>
        {!listening ? (
          <Txt variant="small" color={colors.textFaint} style={{ marginTop: 2 }}>
            or type below
          </Txt>
        ) : null}
      </View>

      <Field
        value={text}
        onChangeText={setText}
        placeholder="Tell DemandOne what's going on…"
        multiline
        style={{ marginTop: space.xl, minHeight: 96 }}
      />
      <Row gap={space.sm} style={{ marginTop: space.md, flexWrap: 'wrap' }}>
        {EXAMPLES.map((e) => (
          <Chip key={e} label={e} onPress={() => setText(e)} />
        ))}
      </Row>
      <Btn title="Tell your agent" icon="arrow-right" disabled={!text.trim()} style={{ marginTop: space.lg }} onPress={submit} />

      <Txt variant="small" color={colors.textFaint} style={{ marginTop: space.xl }}>
        Right now you have {viewer.needs.length} thing{viewer.needs.length === 1 ? '' : 's'} you need and{' '}
        {viewer.offers.length} thing{viewer.offers.length === 1 ? '' : 's'} you offer — see both under You.
      </Txt>
    </Screen>
  );
}
