/**
 * DemandOne V3 design tokens — "Living Paper" with Ledger's structure.
 *
 * Warm paper grounds, an editorial serif for narrative moments (Instrument Serif)
 * and one sans with tabular numerals for everything operational (Geist). Forest
 * marks the buy side and primary actions; amber marks the sell side. Rust and
 * indigo exist only in ambient state fields, never as UI chrome.
 *
 * `colors` is a plain mutable object: `applyThemeMode` reassigns its properties
 * in place so every inline read picks up the new palette on the next render.
 */

export type ThemeMode = 'light' | 'dark';

interface Palette {
  bg: string; // paper
  raised: string; // a lifted sheet on the paper (inputs, the rare panel)
  sunk: string; // pressed / track
  rule: string; // hairline
  ruleStrong: string; // ledger rule under headers
  ink: string;
  inkDim: string;
  inkFaint: string;
  forest: string; // buy side, primary action
  forestSoft: string;
  onForest: string;
  amber: string; // sell side, graphics
  amberText: string; // amber that passes contrast as text
  amberSoft: string;
  rust: string; // declines, stop
  indigo: string;
  focus: string;
}

const light: Palette = {
  bg: '#F3EFE6',
  raised: '#FAF7F0',
  sunk: '#E8E2D5',
  rule: '#DCD5C7',
  ruleStrong: '#1B1C19',
  ink: '#1B1C19',
  inkDim: '#46443D',
  inkFaint: '#6A675E',
  forest: '#1F4A3E',
  forestSoft: '#DCE5DD',
  onForest: '#F6F2E8',
  amber: '#C98A3A',
  amberText: '#8A5716',
  amberSoft: '#F1E2CA',
  rust: '#9C4A2A',
  indigo: '#2B3156',
  focus: '#1F4A3E',
};

const dark: Palette = {
  bg: '#151613',
  raised: '#1D1E1A',
  sunk: '#262722',
  rule: '#2F302A',
  ruleStrong: '#E9E4D8',
  ink: '#EDE8DD',
  inkDim: '#BDB7AA',
  inkFaint: '#8F8A7E',
  forest: '#86C2A7',
  forestSoft: '#1F3029',
  onForest: '#0F1B16',
  amber: '#E0A55A',
  amberText: '#E6B06C',
  amberSoft: '#3A2D1B',
  rust: '#D9825C',
  indigo: '#9BA4E2',
  focus: '#86C2A7',
};

export const colors: Palette = { ...light };

export function applyThemeMode(mode: ThemeMode): void {
  Object.assign(colors, mode === 'dark' ? dark : light);
}

/** Fixed brand fields for the dark landing and ambient states — independent of theme. */
export const field = {
  night: '#121513',
  nightInk: '#F2EDE2',
  nightDim: '#BDB6A6',
  forest: '#1F4A3E',
  amber: '#C98A3A',
  rust: '#9C4A2A',
  indigo: '#2B3156',
  charcoal: '#1F2022',
} as const;

export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

/** Controls round; sheets barely; pills only for genuine toggles and the mic. */
export const radius = { control: 10, sheet: 4, pill: 999 } as const;

/** The content column on wide screens — the product stays a composed page, not a dashboard. */
export const MAX_WIDTH = 600;

export const fonts = {
  serif: 'InstrumentSerif_400Regular',
  serifItalic: 'InstrumentSerif_400Regular_Italic',
  sans: 'Geist_400Regular',
  sansMedium: 'Geist_500Medium',
  sansBold: 'Geist_600SemiBold',
} as const;

const tab = { fontVariant: ['tabular-nums' as const, 'lining-nums' as const] };

/** Type scale: serif for narrative, sans for everything operational. Numbers always tabular. */
export const type = {
  hero: { fontFamily: fonts.serif, fontSize: 46, lineHeight: 48, letterSpacing: -0.6 },
  display: { fontFamily: fonts.serif, fontSize: 36, lineHeight: 40, letterSpacing: -0.4 },
  title: { fontFamily: fonts.serif, fontSize: 28, lineHeight: 32, letterSpacing: -0.2 },
  heading: { fontFamily: fonts.serif, fontSize: 22, lineHeight: 27 },
  entry: { fontFamily: fonts.serif, fontSize: 19, lineHeight: 23 },
  body: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 22, ...tab },
  bodyStrong: { fontFamily: fonts.sansBold, fontSize: 15, lineHeight: 22, ...tab },
  small: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 18, ...tab },
  smallStrong: { fontFamily: fonts.sansBold, fontSize: 13, lineHeight: 18, ...tab },
  label: { fontFamily: fonts.sansMedium, fontSize: 12, lineHeight: 16, ...tab },
  price: { fontFamily: fonts.sansBold, fontSize: 17, lineHeight: 21, ...tab },
  priceLarge: { fontFamily: fonts.sansBold, fontSize: 26, lineHeight: 30, letterSpacing: -0.3, ...tab },
} as const;

export type TypeVariant = keyof typeof type;
