/**
 * DemandOne v2 design tokens — calm, legible, light by default, with a manual dark
 * toggle (see You → Settings). One restrained accent (plus one warm second accent),
 * warm neutrals in both palettes, function-based radius (controls vs. surfaces vs.
 * genuine toggles — not one border-radius applied everywhere). No gradients/glows.
 * The product's intelligence shows up in what it does, not in how the screen looks.
 *
 * `colors` is deliberately a plain mutable object, not a value picked by a hook —
 * nearly every screen does `import { colors } from '@/theme'` and reads `colors.bg`
 * etc. inline at render time. `applyThemeMode` reassigns its properties in place
 * (same object reference) so every one of those inline reads picks up the new
 * palette on the next render, with no per-screen changes needed. The one thing this
 * can't fix is a color baked into a module-level `StyleSheet.create` (evaluated once
 * at import) — those few spots (`base.tsx`, `domain.tsx`) compute their styles in a
 * function called per-render instead, for exactly this reason.
 */

export type ThemeMode = 'light' | 'dark';

interface ColorPalette {
  bg: string;
  surface: string;
  surface2: string;
  border: string;
  borderStrong: string;
  text: string;
  textDim: string;
  textFaint: string;
  accent: string;
  accentText: string;
  accentSoft: string;
  accent2: string;
  accent2Soft: string;
  success: string;
  successSoft: string;
}

const lightColors: ColorPalette = {
  bg: '#F7F6F2', // warm paper, not clinical white
  surface: '#FFFFFF',
  surface2: '#EFEEE9', // nested / pressed
  border: '#E3E1DA', // hairline
  borderStrong: '#C9C6BC',

  text: '#201F1B',
  textDim: '#6B6860',
  textFaint: '#9B978C',

  accent: '#2F5D4E', // deep pine — reads trust + value, not playful, not SaaS-blue
  accentText: '#FFFFFF',
  accentSoft: '#E4EBE7', // faint accent surface, used sparingly for state

  // Second accent — golden hour amber. Doubles as the brand's warmth/personality
  // color (the logomark's second circle, headline flourishes) AND urgency/attention
  // text, so there's one warm color in the system, not two similar ambers.
  accent2: '#D98F3F',
  accent2Soft: '#F6E9D8',

  success: '#2F5D4E', // same family as accent — one meaning, not a second color
  successSoft: '#E4EBE7',
};

const darkColors: ColorPalette = {
  bg: '#17181A', // warm near-black, not pure black
  surface: '#1F2123',
  surface2: '#26282B',
  border: '#33353A',
  borderStrong: '#46484D',

  text: '#F2F1ED',
  textDim: '#B5B2A8',
  textFaint: '#7C7A73',

  accent: '#6FB79A', // pine lightened for contrast on a dark ground
  accentText: '#0D1F18',
  accentSoft: '#1C2D27',

  accent2: '#E3A05E',
  accent2Soft: '#3A2C1A',

  success: '#6FB79A',
  successSoft: '#1C2D27',
};

/** The live palette — see the module comment for why this is mutated in place, not replaced. */
export const colors: ColorPalette = { ...lightColors };

export function applyThemeMode(mode: ThemeMode): void {
  Object.assign(colors, mode === 'dark' ? darkColors : lightColors);
}

/**
 * Fixed ambient-gradient stops for the "Market Field" halftone device (see
 * MarketField.tsx) and the charcoal "near-clearance" editorial panel (see
 * MarketMoment in domain.tsx). Deliberately NOT part of the mutable `colors`
 * object above — this is a fixed brand device (like the logomark's two colors),
 * not something that should flip with the light/dark toggle.
 */
export const marketField = {
  forest: '#2F5D4E',
  amber: '#D98F3F',
  rust: '#A6542E',
  charcoal: '#1C1512',
  charcoalSurface: '#241B16',
  charcoalText: '#F3EFE9',
  charcoalTextDim: '#C9BFB3',
} as const;

/** 4pt spacing scale */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 40,
} as const;

/** Function-based, not uniform: controls round more than surfaces do. */
export const radius = {
  control: 8, // buttons, inputs, filter/segmented tabs
  surface: 4, // the rare row/card that's a genuinely discrete object
  pill: 999, // genuine status/toggle pills only
} as const;

// The one bit of typographic personality: a characterful serif for headline
// moments only (landing, "Handled.", the Standard of Value title) — everything
// else stays on the plain system sans so the product still reads calm and fast.
export const fontDisplay = 'Fraunces_600SemiBold';
export const fontDisplayItalic = 'Fraunces_500Medium_Italic';

export const type = {
  display: { fontSize: 34, lineHeight: 40, fontWeight: '600' as const, letterSpacing: -0.4 },
  title: { fontSize: 26, lineHeight: 32, fontWeight: '600' as const, letterSpacing: -0.2 },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: '600' as const },
  body: { fontSize: 16, lineHeight: 23, fontWeight: '400' as const },
  bodyStrong: { fontSize: 16, lineHeight: 23, fontWeight: '600' as const },
  small: { fontSize: 14, lineHeight: 20, fontWeight: '400' as const },
  smallStrong: { fontSize: 14, lineHeight: 20, fontWeight: '600' as const },
  // Genuine micro-metadata (a count, a timestamp) — never a section-header pattern.
  label: { fontSize: 12, lineHeight: 16, fontWeight: '500' as const },
} as const;

export type TypeVariant = keyof typeof type;
