/**
 * The voice surface, in two forms over one conversation:
 * - `full`: the Speak screen — a large mic, the interpretation card, the reply.
 * - `dock`: a bar docked into a screen's layout (negotiation, transaction),
 *   speaking in that screen's context. Never a floating bubble.
 *
 * Speech in uses the browser's recognizer where available; otherwise the text
 * field and example utterances do the same job. Everything goes through
 * services/voiceAgent.ts and therefore the same state as the buttons.
 */
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { formatMoney } from '@/domain/money';
import { missingFields, type MandateDraft } from '@/domain/semantic';
import { UNIT_SHORT } from '@/domain/terms';
import { isNativeSpeechAvailable, ListenFailure, startListening, stopSpeaking } from '@/infra/voice';
import { cancelPending, confirmPending, handleUtterance, type AgentReply, type ScreenContext } from '@/services/voiceAgent';
import { useVoiceSession } from '@/state/voiceSession';
import { colors, radius, space, type } from '@/theme';
import { Button, Row, T } from './core';
import { Icon } from './Icon';

const LISTEN_FAILURE: Record<ListenFailure, string> = {
  blocked: 'Microphone access is blocked. Allow it from the icon at the left of the address bar, then tap the mic again.',
  'no-speech': 'I didn’t hear anything. Tap the mic and start speaking, or type instead.',
  'no-microphone': 'No microphone found. Connect one, or type instead.',
  unsupported: 'This browser can’t turn speech into text. Use Chrome or Edge, or type instead.',
  other: 'Listening stopped unexpectedly. Tap the mic to try again, or type instead.',
};

function MicButton({ listening, onPress, size }: { listening: boolean; onPress: () => void; size: number }) {
  const reduced = useReducedMotion();
  const ring = useSharedValue(0);
  useEffect(() => {
    ring.value = listening && !reduced ? withRepeat(withSequence(withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 0 })), -1) : 0;
  }, [listening, reduced, ring]);
  const ringStyle = useAnimatedStyle(() => ({ opacity: listening ? 0.5 * (1 - ring.value) : 0, transform: [{ scale: 1 + ring.value * 0.5 }] }));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={listening ? 'Stop listening' : 'Speak to DemandOne'}
      accessibilityState={{ selected: listening }}
      onPress={onPress}
      style={({ pressed }) => [{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, pressed && { opacity: 0.8 }]}>
      <Animated.View style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: colors.amber }, ringStyle]} />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: listening ? colors.amber : colors.forest, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={listening ? 'stop' : 'mic'} size={size * 0.38} color={colors.onForest} weight={listening ? 'fill' : 'regular'} />
      </View>
    </Pressable>
  );
}

/** What DemandOne understood — structured, with gaps named rather than guessed. */
export function InterpretationCard({ draft }: { draft: MandateDraft }) {
  const missing = missingFields(draft);
  const rows: [string, string | undefined][] = [
    ['Objective', draft.objective],
    [draft.mode === 'offer' ? 'Offering' : 'Likely need', draft.likelyNeed],
    ['Related', draft.related.length ? draft.related.join(', ') : undefined],
    ['Timing', draft.timingLabel],
    [draft.mode === 'offer' ? 'Rate' : 'Budget', draft.budget !== undefined ? `${formatMoney(draft.budget)}${UNIT_SHORT[draft.unit ?? 'fixed']}${draft.mode === 'need' ? ' (private)' : ''}` : undefined],
  ];
  if (draft.hours) rows.splice(2, 0, ['Capacity', `${draft.hours} hours`]);
  return (
    <View accessibilityLabel="What DemandOne understood" style={{ borderTopWidth: 1, borderColor: colors.ruleStrong }}>
      <Row justify="space-between" style={{ paddingVertical: 8 }}>
        <T v="label" color={colors.inkDim}>What DemandOne understood</T>
        <T v="label" color={draft.mode === 'need' ? colors.forest : colors.amberText}>{draft.mode === 'need' ? 'Need' : 'Offer'}</T>
      </Row>
      {rows.map(([label, value]) => (
        <Row key={label} align="flex-start" style={{ paddingVertical: 7, borderTopWidth: 1, borderColor: colors.rule }}>
          <T v="small" color={colors.inkDim} style={{ width: 96 }}>{label}</T>
          <T v="body" color={value ? colors.ink : colors.inkFaint} style={{ flex: 1 }}>{value ?? 'Not specified'}</T>
        </Row>
      ))}
      {missing.length > 0 ? <T v="small" color={colors.inkFaint} style={{ marginTop: 6 }}>{`I'll ask about ${missing.join(' and ')} before anything goes to market.`}</T> : null}
    </View>
  );
}

export function VoicePanel({ context = { kind: 'none' }, variant = 'full', prompts = [], placeholder }: { context?: ScreenContext; variant?: 'full' | 'dock'; prompts?: string[]; placeholder?: string }) {
  const router = useRouter();
  const session = useVoiceSession();
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const stopRef = useRef<{ stop: () => void } | null>(null);

  const lastAgent = [...session.turns].reverse().find((t) => t.from === 'agent');
  const lastUser = [...session.turns].reverse().find((t) => t.from === 'user');

  const follow = (reply: AgentReply | undefined) => {
    if (reply?.navigate) router.push({ pathname: reply.navigate.pathname as never, params: reply.navigate.params });
  };

  const send = async (utterance: string) => {
    const body = utterance.trim();
    if (!body || busy) return;
    setText('');
    setNotice(null);
    setBusy(true);
    try {
      follow(await handleUtterance(body, context));
    } finally {
      setBusy(false);
    }
  };

  const toggleMic = () => {
    stopSpeaking();
    if (listening) {
      stopRef.current?.stop();
      stopRef.current = null;
      setListening(false);
      return;
    }
    if (!isNativeSpeechAvailable()) {
      setNotice('This browser can’t turn speech into text. Use Chrome or Edge, or type instead.');
      return;
    }
    setListening(true);
    setNotice(null);
    stopRef.current =
      startListening(
        (heard) => {
          setListening(false);
          stopRef.current = null;
          void send(heard);
        },
        (why) => {
          setListening(false);
          stopRef.current = null;
          setText('');
          setNotice(LISTEN_FAILURE[why]);
        },
        setText
      ) ?? null;
    if (!stopRef.current) setListening(false);
  };

  const confirm = async () => {
    setBusy(true);
    try {
      follow(await confirmPending());
    } finally {
      setBusy(false);
    }
  };

  const input = (
    <Row gap={space.sm} style={{ flex: 1, borderBottomWidth: 1, borderColor: colors.inkFaint }}>
      <TextInput
        accessibilityLabel="Type to DemandOne"
        value={text}
        onChangeText={setText}
        onSubmitEditing={() => send(text)}
        placeholder={placeholder ?? (variant === 'full' ? 'Or type what you need or can offer' : 'Speak or type to your agent')}
        placeholderTextColor={colors.inkFaint}
        style={[type.body, { flex: 1, color: colors.ink, paddingVertical: 10, outlineWidth: 0 } as object]}
      />
      <Pressable accessibilityRole="button" accessibilityLabel="Send" disabled={!text.trim() || busy} onPress={() => send(text)} style={{ padding: 8, opacity: text.trim() ? 1 : 0.35 }}>
        <Icon name="send" size={18} color={colors.forest} />
      </Pressable>
    </Row>
  );

  const pending = session.pending ? (
    <Row gap={space.sm} style={{ marginTop: space.sm }}>
      <Button title="Yes, go ahead" onPress={confirm} loading={busy} size={variant === 'dock' ? 'sm' : 'md'} style={{ flex: 1 }} />
      <Button title="Not now" kind="secondary" onPress={cancelPending} size={variant === 'dock' ? 'sm' : 'md'} />
    </Row>
  ) : null;

  const chips = prompts.map((p) => (
        <Pressable key={p} accessibilityRole="button" accessibilityLabel={`Say: ${p}`} onPress={() => send(p)} style={({ pressed }) => [{ paddingHorizontal: space.md, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.rule }, pressed && { opacity: 0.6 }]}>
          <T v="small" color={colors.inkDim} lines={1}>{`“${p}”`}</T>
        </Pressable>
  ));
  const examples = prompts.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm }}>{chips}</View> : null;
  // Docked, examples stay on one scrollable line and step aside once the conversation starts.
  const dockExamples = prompts.length && session.turns.length === 0 ? (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: space.sm }} contentContainerStyle={{ gap: space.sm }}>
      {chips}
    </ScrollView>
  ) : null;

  if (variant === 'dock') {
    return (
      <View style={{ paddingTop: space.md, paddingBottom: space.sm, borderTopWidth: 1, borderColor: colors.rule, backgroundColor: colors.bg }}>
        {lastAgent && session.turns.length > 0 ? <T v="small" color={colors.inkDim} lines={3} style={{ marginBottom: space.sm }} testID="agent-reply">{lastAgent.text}</T> : null}
        {notice ? <T v="small" color={colors.rust} style={{ marginBottom: space.sm }}>{notice}</T> : null}
        <Row gap={space.md}>
          <MicButton listening={listening} onPress={toggleMic} size={44} />
          {input}
        </Row>
        {pending}
        {dockExamples}
      </View>
    );
  }

  return (
    <View>
      <Row gap={space.lg} style={{ marginTop: space.lg }}>
        <MicButton listening={listening} onPress={toggleMic} size={72} />
        <View style={{ flex: 1 }}>
          <T v="bodyStrong">{listening ? 'Listening…' : busy ? 'Thinking…' : 'Tap to speak'}</T>
          <T v="small" color={colors.inkDim}>Say it the way you'd say it to a colleague.</T>
        </View>
      </Row>
      <View style={{ marginTop: space.lg }}>{input}</View>
      {notice ? <T v="small" color={colors.rust} style={{ marginTop: space.sm }}>{notice}</T> : null}

      {lastUser ? <T v="small" color={colors.inkFaint} style={{ marginTop: space.xl }}>{`You said: “${lastUser.text}”`}</T> : null}
      {lastAgent ? <T v="title" style={{ marginTop: space.sm }} testID="agent-reply">{lastAgent.text}</T> : null}
      {pending}
      {session.draft ? <View style={{ marginTop: space.xl }}><InterpretationCard draft={session.draft} /></View> : null}
      {examples ? <View style={{ marginTop: space.xl }}><T v="label" color={colors.inkDim}>Try saying</T>{examples}</View> : null}
    </View>
  );
}
