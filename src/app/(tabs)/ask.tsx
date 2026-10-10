import { View } from 'react-native';
import { DEMO_UTTERANCES } from '@/infra/voice';
import { useVoiceSession } from '@/state/voiceSession';
import { AmbientField } from '@/ui/Ambient';
import { Page, T } from '@/ui/core';
import { VoicePanel } from '@/ui/VoicePanel';
import { colors, space } from '@/theme';

/**
 * Speak — the voice-first entry to the exchange. Say a need or an offer in your
 * own words; DemandOne shows what it understood, asks about what's missing, and
 * acts only on your yes.
 */
export default function Speak() {
  const session = useVoiceSession();
  const started = session.turns.length > 0;
  const prompts = session.draft
    ? [DEMO_UTTERANCES.timing, DEMO_UTTERANCES.budget, 'Yes, go ahead']
    : [DEMO_UTTERANCES.acquisition, DEMO_UTTERANCES.capacity, 'How big is the UK market for clinic software?'];
  return (
    <Page backdrop={<AmbientField mood="listening" height={520} breathe />}>
      <View style={{ marginTop: space.xl }}>
        {!started ? (
          <>
            <T v="display">What’s going on?</T>
            <T v="body" color={colors.inkDim} style={{ marginTop: space.sm }}>
              Tell DemandOne what you need, or what you could offer. It turns it into terms, finds the other side, and checks with you before anything happens.
            </T>
          </>
        ) : null}
        <VoicePanel variant="full" prompts={prompts} />
      </View>
    </Page>
  );
}
