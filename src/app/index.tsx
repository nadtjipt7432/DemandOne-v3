import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Dimensions, View } from 'react-native';
import { Btn, Screen, Txt } from '@/components/base';
import { Logomark } from '@/components/domain';
import { IntroAnimation } from '@/components/IntroAnimation';
import { MarketField } from '@/components/MarketField';
import { useAppState } from '@/state/hooks';
import { colors, fontDisplay, fontDisplayItalic, space } from '@/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
// Capped, not just a fraction of screen height — on a small phone a pure
// percentage still left the page taller than the viewport. Scroll is still the
// safety net below, but this keeps the hero from being the reason it's needed.
const HERO_HEIGHT = Math.min(140, Math.round(SCREEN_HEIGHT * 0.18));

export default function Welcome() {
  const router = useRouter();
  const { cards } = useAppState();
  const [showIntro, setShowIntro] = useState(true);

  // One restrained live-market line, counted from the actual open listings.
  const openNeeds = cards.filter((c) => c.kind === 'need').length;
  const openOffers = cards.filter((c) => c.kind === 'offer').length;

  return (
    <View style={{ flex: 1 }}>
      <Screen scroll contentStyle={{ paddingBottom: space.xl, flexGrow: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Logomark size={22} />
          <Txt variant="bodyStrong" style={{ fontFamily: fontDisplay }}>
            DemandOne
          </Txt>
        </View>

        <View style={{ marginTop: space.xl }}>
          <MarketField width={SCREEN_WIDTH} height={HERO_HEIGHT} dotCount={280} style={{ borderRadius: 4, marginHorizontal: -space.lg }} />
          <View style={{ gap: space.md, marginTop: space.lg }}>
            <Txt variant="small" color={colors.textFaint}>
              Everyone here is both
            </Txt>
            <Txt variant="display" style={{ fontFamily: fontDisplay, fontSize: 28, lineHeight: 34 }}>
              Tell us what you need.{'\n'}Tell us what you offer.{'\n'}
              <Txt variant="display" color={colors.accent2} style={{ fontFamily: fontDisplayItalic, fontSize: 28, lineHeight: 34 }}>
                We'll close the gap.
              </Txt>
            </Txt>
            <Txt variant="body" color={colors.textDim}>
              Say what's going on, in your own words — out loud or typed. Your agent finds who's
              actually worth your time and handles the price behind the scenes.
            </Txt>
          </View>
        </View>

        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <View style={{ gap: space.md, marginTop: space.xl }}>
            <Txt variant="small" color={colors.textFaint} style={{ textAlign: 'center' }}>
              {openNeeds} open needs · {openOffers} open offers
            </Txt>
            <Btn title="Enter DemandOne" icon="arrow-right" onPress={() => router.push('/login')} />
            <Txt variant="small" color={colors.textFaint} style={{ textAlign: 'center' }}>
              New or returning — all it takes is your email.{'\n'}You approve every commitment.
            </Txt>
          </View>
        </View>
      </Screen>

      {/* The real page is already mounted above, for the skip path — tap anywhere
          to reveal it instead of waiting. Letting the animation finish on its own
          carries straight into /login instead (see IntroAnimation). */}
      {showIntro ? <IntroAnimation onSkip={() => setShowIntro(false)} /> : null}
    </View>
  );
}
