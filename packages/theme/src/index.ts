// @noot/theme — noot design tokens, ported verbatim from the design handoff
// (design_handoff_noot_app/app/theme.jsx). Two visual directions × light/dark.
//
// The handoff emits CSS custom properties (web prototype). Here we export the raw
// typed token objects plus `resolveTheme(direction, dark)` which returns a flat
// token map — consumable by React Native (StyleSheet), RN Web, and Next.js alike.
//
// Brand: sage #78A070 · cream/sand #D0C0A0 · deep charcoal-green #283028.

export type Direction = 'sage' | 'crimson';

export interface DirectionMeta {
  id: Direction;
  name: string;
  blurb: string;
}

export const DIRECTIONS: DirectionMeta[] = [
  { id: 'sage', name: 'Sage', blurb: 'Calm · natural · the noot default' },
  { id: 'crimson', name: 'Crimson', blurb: 'Crimson & graphite · University of Alabama' },
];

export const BODY_FONT =
  '-apple-system, "SF Pro Text", system-ui, "Segoe UI", Roboto, sans-serif';

/** Color + surface tokens for one direction at one light/dark mode. */
export interface ColorTokens {
  bg: string;
  surface: string;
  surface2: string;
  surfaceAlt: string;
  text: string;
  text2: string;
  text3: string;
  border: string;
  borderStrong: string;
  accent: string;
  accentPress: string;
  accentWeak: string;
  accentBorder: string;
  onAccent: string;
  good: string;
  goodWeak: string;
  /** Destructive text (Sign out, Delete account). Semantic, so it doesn't follow the brand. */
  danger: string;
  band: string;
  onBand: string;
  shadow: string;
  shadowSm: string;
  statusDark: boolean;
}

/** Shape/typography tokens shared across a direction's light + dark ramps. */
export interface ShapeTokens {
  headingFont: string;
  headingWeight: number;
  headingTracking: string;
  btnRadius: string;
  chipRadius: string;
  cardRadius: string;
  fieldRadius: string;
}

export interface ThemeDirection extends ShapeTokens {
  light: ColorTokens;
  dark: ColorTokens;
}

const HEADING_FONT = BODY_FONT;

export const THEMES: Record<Direction, ThemeDirection> = {
  // ── 1 · SAGE (default) ────────────────────────────────────────────────
  sage: {
    headingFont: HEADING_FONT,
    headingWeight: 700,
    headingTracking: '-0.01em',
    btnRadius: '12px',
    chipRadius: '999px',
    cardRadius: '14px',
    fieldRadius: '10px',
    light: {
      bg: '#F4F2EC', surface: '#FFFFFF', surface2: '#ECEAE1', surfaceAlt: '#FAF8F2',
      text: '#283028', text2: '#5A6157', text3: '#9AA093',
      border: 'rgba(40,48,40,0.12)', borderStrong: 'rgba(40,48,40,0.24)',
      accent: '#78A070', accentPress: '#5F8758', accentWeak: '#E8EFE3', accentBorder: 'rgba(120,160,112,0.4)',
      onAccent: '#FFFFFF', good: '#4F8A4A', goodWeak: '#E5F0E2', danger: '#D23F31',
      band: '#557A4E', onBand: '#FFFFFF',
      shadow: '0 1px 2px rgba(40,48,40,0.05), 0 10px 28px rgba(40,48,40,0.07)',
      shadowSm: '0 1px 2px rgba(40,48,40,0.06)',
      statusDark: false,
    },
    dark: {
      bg: '#161C16', surface: '#1F271F', surface2: '#2B332A', surfaceAlt: '#1A201A',
      text: '#F1F0E8', text2: 'rgba(241,240,232,0.64)', text3: 'rgba(241,240,232,0.4)',
      border: 'rgba(160,180,150,0.18)', borderStrong: 'rgba(160,180,150,0.34)',
      accent: '#8FB585', accentPress: '#79A06F', accentWeak: 'rgba(143,181,133,0.16)', accentBorder: 'rgba(143,181,133,0.4)',
      onAccent: '#16201A', good: '#7FC079', goodWeak: 'rgba(127,192,121,0.16)', danger: '#FF6B5E',
      band: '#2E4A2B', onBand: '#F1F0E8',
      shadow: '0 1px 2px rgba(0,0,0,0.4), 0 12px 32px rgba(0,0,0,0.5)',
      shadowSm: '0 1px 3px rgba(0,0,0,0.45)',
      statusDark: true,
    },
  },

  // ── 2 · CRIMSON (school colors — University of Alabama) ────────────────
  // A genuinely separate direction, not sage-with-a-red-button. It previously reused
  // sage's surfaces/text/borders verbatim and swapped only the four accent* tokens, which
  // is exactly why it read as "the same app with a different button colour".
  //
  // Identity: CRIMSON + GRAY. The neutrals are cool, slightly crimson-tinted grays — no
  // warm cream, no green in the text — so the whole surface reads as steel/graphite and the
  // UA crimson (#9E1B32) lands as the single loud colour against it. The buttons are more
  // compactly rounded than sage's (10 vs 12), and the headings are tighter, so the mode is
  // recognisable in a glance even in a greyscale screenshot.
  // `good` stays green: semantic colours must not follow the brand.
  crimson: {
    headingFont: HEADING_FONT,
    headingWeight: 700,
    headingTracking: '-0.022em',
    btnRadius: '10px',
    chipRadius: '999px',
    cardRadius: '14px',
    fieldRadius: '10px',
    light: {
      bg: '#F1F2F4', surface: '#FFFFFF', surface2: '#E4E6EA', surfaceAlt: '#F8F9FA',
      text: '#1B1D21', text2: '#545A62', text3: '#8A9199',
      border: 'rgba(27,29,33,0.13)', borderStrong: 'rgba(27,29,33,0.28)',
      accent: '#9E1B32', accentPress: '#7B1426', accentWeak: '#F7E6E9', accentBorder: 'rgba(158,27,50,0.42)',
      onAccent: '#FFFFFF', good: '#4F8A4A', goodWeak: '#E5F0E2', danger: '#D23F31',
      band: '#9E1B32', onBand: '#FFFFFF',
      shadow: '0 1px 2px rgba(27,29,33,0.06), 0 10px 26px rgba(27,29,33,0.09)',
      shadowSm: '0 1px 2px rgba(27,29,33,0.08)',
      statusDark: false,
    },
    dark: {
      bg: '#131417', surface: '#1C1E22', surface2: '#282B31', surfaceAlt: '#17191C',
      text: '#F2F3F5', text2: 'rgba(242,243,245,0.66)', text3: 'rgba(242,243,245,0.42)',
      border: 'rgba(214,220,228,0.14)', borderStrong: 'rgba(214,220,228,0.3)',
      accent: '#CF3B52', accentPress: '#B23146', accentWeak: 'rgba(207,59,82,0.18)', accentBorder: 'rgba(207,59,82,0.45)',
      onAccent: '#FFFFFF', good: '#7FC079', goodWeak: 'rgba(127,192,121,0.16)', danger: '#FF6B5E',
      band: '#6E1526', onBand: '#F2F3F5',
      shadow: '0 1px 2px rgba(0,0,0,0.45), 0 12px 32px rgba(0,0,0,0.55)',
      shadowSm: '0 1px 3px rgba(0,0,0,0.5)',
      statusDark: true,
    },
  },
};

/** Flat, resolved token map for one direction + mode. */
export type Theme = ColorTokens & ShapeTokens & {
  bodyFont: string;
};

/**
 * Resolve a direction + light/dark into a single flat token object.
 * Mirrors `themeStyle()` in the handoff, minus the CSS-variable wrapping.
 */
export function resolveTheme(direction: Direction = 'sage', dark = false): Theme {
  const t = THEMES[direction] ?? THEMES.sage;
  const c = dark ? t.dark : t.light;
  return {
    ...c,
    headingFont: t.headingFont,
    headingWeight: t.headingWeight,
    headingTracking: t.headingTracking,
    btnRadius: t.btnRadius,
    chipRadius: t.chipRadius,
    cardRadius: t.cardRadius,
    fieldRadius: t.fieldRadius,
    bodyFont: BODY_FONT,
  };
}

export function statusIsDark(direction: Direction = 'sage', dark = false): boolean {
  const t = THEMES[direction] ?? THEMES.sage;
  return (dark ? t.dark : t.light).statusDark;
}
