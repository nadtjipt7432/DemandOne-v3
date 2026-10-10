import Feather from '@expo/vector-icons/Feather';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chip, Field, IconButton, Row, Txt } from '@/components/base';
import { simulateTranscript, startListening } from '@/infra/voice';
import { colors, radius, space } from '@/theme';

interface Msg {
  from: 'agent' | 'you';
  text: string;
}

const OPENING: Msg[] = [
  { from: 'agent', text: "I'm watching your exchange and a couple of open requests. What should I handle?" },
];

const SUGGESTIONS = ['Accept the admissions match', 'Find something cheaper', 'What needs my approval?'];

export default function Agent() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Msg[]>(OPENING);
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const stopRef = useRef<{ stop: () => void } | null>(null);

  const send = (raw?: string) => {
    const body = (raw ?? text).trim();
    if (!body) return;
    setText('');
    setMessages((m) => [
      ...m,
      { from: 'you', text: body },
      {
        from: 'agent',
        text: "Got it — I'll work this within your rules and bring anything binding back for your approval.",
      },
    ]);
  };

  // Same voice module as the Ask tab — mic here fills the message field with the
  // transcript so you can glance at it before sending, same as typing would.
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <Row style={{ justifyContent: 'space-between', paddingHorizontal: space.lg, paddingVertical: space.sm }}>
        <Row gap={space.sm}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success }} />
          <Txt variant="bodyStrong">Your agent</Txt>
        </Row>
        <IconButton icon="x" onPress={() => router.back()} />
      </Row>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 8}>
        <ScrollView
          contentContainerStyle={{ padding: space.lg, gap: space.md }}
          showsVerticalScrollIndicator={false}>
          {messages.map((m, i) => (
            <View
              key={i}
              style={[
                bubble,
                m.from === 'you'
                  ? { alignSelf: 'flex-end', backgroundColor: colors.accent }
                  : { alignSelf: 'flex-start', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
              ]}>
              <Txt variant="body" color={m.from === 'you' ? colors.accentText : colors.text}>
                {m.text}
              </Txt>
            </View>
          ))}
        </ScrollView>

        <View style={{ paddingHorizontal: space.lg }}>
          {listening ? (
            <Row gap={6} style={{ marginBottom: space.sm }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent }} />
              <Txt variant="small" color={colors.textFaint}>
                Listening…
              </Txt>
            </Row>
          ) : null}
          <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
            {SUGGESTIONS.map((s) => (
              <Chip key={s} label={s} onPress={() => send(s)} />
            ))}
          </Row>
        </View>

        <Row gap={space.sm} style={{ padding: space.lg, paddingBottom: insets.bottom + space.md }}>
          <View style={{ flex: 1 }}>
            <Field value={text} onChangeText={setText} placeholder="Type or speak to your agent…" />
          </View>
          <Pressable
            onPress={() => (text.trim() ? send() : onMicPress())}
            style={({ pressed }) => [
              {
                width: 48,
                height: 48,
                borderRadius: radius.pill,
                backgroundColor: listening ? colors.accent2 : colors.accent,
                alignItems: 'center' as const,
                justifyContent: 'center' as const,
              },
              pressed && { opacity: 0.7 },
            ]}>
            <Feather name={text.trim() ? 'arrow-up' : listening ? 'square' : 'mic'} size={20} color={colors.accentText} />
          </Pressable>
        </Row>
      </KeyboardAvoidingView>
    </View>
  );
}

const bubble = {
  maxWidth: '86%' as const,
  paddingHorizontal: space.lg,
  paddingVertical: space.md,
  borderRadius: 14,
};
