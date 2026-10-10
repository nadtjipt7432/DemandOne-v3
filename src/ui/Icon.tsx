/**
 * The product's icons — Phosphor, imported one by one so only these ship. Used
 * only where an icon does a job (navigation, the mic, a deadline), never as
 * decoration. Regular weight, sized to the text they sit beside.
 */
import { ArrowLeftIcon } from 'phosphor-react-native/src/icons/ArrowLeft';
import { ArrowsLeftRightIcon } from 'phosphor-react-native/src/icons/ArrowsLeftRight';
import { CheckIcon } from 'phosphor-react-native/src/icons/Check';
import { ClockIcon } from 'phosphor-react-native/src/icons/Clock';
import { HouseIcon } from 'phosphor-react-native/src/icons/House';
import { MicrophoneIcon } from 'phosphor-react-native/src/icons/Microphone';
import { PaperPlaneRightIcon } from 'phosphor-react-native/src/icons/PaperPlaneRight';
import { SpeakerHighIcon } from 'phosphor-react-native/src/icons/SpeakerHigh';
import { SquaresFourIcon } from 'phosphor-react-native/src/icons/SquaresFour';
import { StopIcon } from 'phosphor-react-native/src/icons/Stop';
import { UserIcon } from 'phosphor-react-native/src/icons/User';
import { XIcon } from 'phosphor-react-native/src/icons/X';
import { CaretRightIcon } from 'phosphor-react-native/src/icons/CaretRight';
import { colors } from '@/theme';

const ICONS = {
  back: ArrowLeftIcon,
  deals: ArrowsLeftRightIcon,
  check: CheckIcon,
  clock: ClockIcon,
  home: HouseIcon,
  mic: MicrophoneIcon,
  send: PaperPlaneRightIcon,
  speaker: SpeakerHighIcon,
  exchange: SquaresFourIcon,
  stop: StopIcon,
  user: UserIcon,
  close: XIcon,
  next: CaretRightIcon,
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 20, color = colors.ink, weight = 'regular' }: { name: IconName; size?: number; color?: string; weight?: 'regular' | 'bold' | 'fill' }) {
  const C = ICONS[name];
  return <C size={size} color={color} weight={weight} />;
}
