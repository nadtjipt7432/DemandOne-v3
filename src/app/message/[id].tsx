import Feather from '@expo/vector-icons/Feather';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Field, IconButton, Row, Txt } from '@/components/base';
import { Avatar, Header } from '@/components/domain';
import { useAppState } from '@/state/hooks';
import { sendBookingMessage } from '@/services/market';
import { simulateTranscript, startListening } from '@/infra/voice';
import { colors, radius, space } from '@/theme';

/**
 * A direct thread with this booking's counterpart — deliberately separate from
 * "Talk to your agent" (`/agent`). The agent mediates matching/negotiation; this is
 * just two people coordinating on an already-agreed engagement (e.g. "when will
 * the deliverable be ready"), so the two shouldn't be the same conversation.
 */
export default function BookingMessage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { bookings, people } = useAppState();
  const booking = bookings.find((b) => b.id === id);
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const stopRef = useRef<{ stop: () => void } | null>(null);

  if (!booking) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
        <Header onBack={() => router.back()} title="Message" />
        <Txt variant="body" color={colors.textDim} style={{ paddingHorizontal: space.lg }}>
          This booking is no longer available.
        </Txt>
      </View>
    );
  }

  const person = people[booking.personId];
  const messages = booking.messages ?? [];
  const firstName = person?.name.split(' ')[0] ?? 'them';

  const send = async (raw?: string) => {
    const body = (raw ?? text).trim();
    if (!body) return;
    setText('');
    await sendBookingMessage(booking.id, body);
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
        <Pressable onPress={() => router.back()} hitSlop={12} style={({ pressed }) => pressed && { opacity: 0.6 }}>
          <Row gap={space.sm}>
            <Feather name="chevron-left" size={22} color={colors.text} />
            <Avatar initials={person?.initials ?? '··'} size={28} />
            <Txt variant="bodyStrong">{person?.name ?? 'Message'}</Txt>
          </Row>
        </Pressable>
        <IconButton icon="x" onPress={() => router.back()} />
      </Row>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 8}>
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }} showsVerticalScrollIndicator={false}>
          {messages.length === 0 ? (
            <Txt variant="small" color={colors.textFaint}>
              Start the conversation with {firstName} about {booking.service.toLowerCase()}.
            </Txt>
          ) : null}
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

        {listening ? (
          <Row gap={6} style={{ paddingHorizontal: space.lg, marginBottom: space.sm }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent }} />
            <Txt variant="small" color={colors.textFaint}>
              Listening…
            </Txt>
          </Row>
        ) : null}

        <Row gap={space.sm} style={{ padding: space.lg, paddingBottom: insets.bottom + space.md }}>
          <View style={{ flex: 1 }}>
            <Field value={text} onChangeText={setText} placeholder={`Message ${firstName}…`} />
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
