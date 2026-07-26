// @noot/theme — noot design tokens, ported verbatim from the design handoff
// (design_handoff_noot_app/app/theme.jsx). Three visual directions × light/dark.
//
// The handoff emits CSS custom properties (web prototype). Here we export the raw
// typed token objects plus `resolveTheme(direction, dark)` which returns a flat
// token map — consumable by React Native (StyleSheet), RN Web, and Next.js alike.
//
// Brand: sage #78A070 · cream/sand #D0C0A0 · deep charcoal-green #283028.

export type Direction = 'sage' | 'sand' | 'forest' | 'crimson';

export interface DirectionMeta {
  id: Direction;
  name: string;
  blurb: string;
}

export const DIRECTIONS: DirectionMeta[] = [
  { id: 'sage', name: 'Sage', blurb: 'Calm · natural · the noot default' },
  { id: 'sand', name: 'Sand', blurb: 'Warm · cream-forward · friendly' },
  { id: 'forest', name: 'Forest', blurb: 'Deep green · confident · high-contrast' },
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

const HEADING_FONT =
  '"Poppins", -apple-system, system-ui, sans-serif';

export const THEMES: Record<Direction, ThemeDirection> = {
  // ── 1 · SAGE (default) ────────────────────────────────────────────────
  sage: {
    headingFont: HEADING_FONT,
    headingWeight: 700,
    headingTracking: '-0.01em',
    btnRadius: '14px',
    chipRadius: '999px',
    cardRadius: '20px',
    fieldRadius: '13px',
    light: {
      bg: '#F4F2EC', surface: '#FFFFFF', surface2: '#ECEAE1', surfaceAlt: '#FAF8F2',
      text: '#283028', text2: '#5A6157', text3: '#9AA093',
      border: 'rgba(40,48,40,0.12)', borderStrong: 'rgba(40,48,40,0.24)',
      accent: '#78A070', accentPress: '#5F8758', accentWeak: '#E8EFE3', accentBorder: 'rgba(120,160,112,0.4)',
      onAccent: '#FFFFFF', good: '#4F8A4A', goodWeak: '#E5F0E2',
      shadow: '0 1px 2px rgba(40,48,40,0.05), 0 10px 28px rgba(40,48,40,0.07)',
      shadowSm: '0 1px 2px rgba(40,48,40,0.06)',
      statusDark: false,
    },
    dark: {
      bg: '#161C16', surface: '#1F271F', surface2: '#2B332A', surfaceAlt: '#1A201A',
      text: '#F1F0E8', text2: 'rgba(241,240,232,0.64)', text3: 'rgba(241,240,232,0.4)',
      border: 'rgba(160,180,150,0.18)', borderStrong: 'rgba(160,180,150,0.34)',
      accent: '#8FB585', accentPress: '#79A06F', accentWeak: 'rgba(143,181,133,0.16)', accentBorder: 'rgba(143,181,133,0.4)',
      onAccent: '#16201A', good: '#7FC079', goodWeak: 'rgba(127,192,121,0.16)',
      shadow: '0 1px 2px rgba(0,0,0,0.4), 0 12px 32px rgba(0,0,0,0.5)',
      shadowSm: '0 1px 3px rgba(0,0,0,0.45)',
      statusDark: true,
    },
  },

  // ── 2 · SAND (warm, cream-forward) ────────────────────────────────────
  sand: {
    headingFont: HEADING_FONT,
    headingWeight: 700,
    headingTracking: '-0.01em',
    btnRadius: '999px',
    chipRadius: '999px',
    cardRadius: '24px',
    fieldRadius: '16px',
    light: {
      bg: '#F3EBDC', surface: '#FFFDF8', surface2: '#EDE3D0', surfaceAlt: '#FBF5EA',
      text: '#2C2A22', text2: '#6B6354', text3: '#A89C86',
      border: 'rgba(120,100,60,0.16)', borderStrong: 'rgba(120,100,60,0.3)',
      accent: '#78A070', accentPress: '#5F8758', accentWeak: '#E9EFE1', accentBorder: 'rgba(120,160,112,0.36)',
      onAccent: '#FFFFFF', good: '#4F8A4A', goodWeak: '#E7F0E1',
      shadow: '0 1px 2px rgba(110,80,40,0.05), 0 14px 30px rgba(120,90,50,0.1)',
      shadowSm: '0 1px 3px rgba(120,90,50,0.08)',
      statusDark: false,
    },
    dark: {
      bg: '#1A150D', surface: '#241E14', surface2: '#30281B', surfaceAlt: '#1E1810',
      text: '#F5EEDF', text2: 'rgba(245,238,223,0.64)', text3: 'rgba(245,238,223,0.4)',
      border: 'rgba(190,160,110,0.22)', borderStrong: 'rgba(190,160,110,0.4)',
      accent: '#9FBE92', accentPress: '#86A87A', accentWeak: 'rgba(159,190,146,0.16)', accentBorder: 'rgba(159,190,146,0.4)',
      onAccent: '#17200F', good: '#86C57D', goodWeak: 'rgba(134,197,125,0.16)',
      shadow: '0 1px 2px rgba(0,0,0,0.45), 0 14px 34px rgba(0,0,0,0.55)',
      shadowSm: '0 1px 3px rgba(0,0,0,0.5)',
      statusDark: true,
    },
  },

  // ── 3 · FOREST (deep charcoal-green forward) ──────────────────────────
  forest: {
    headingFont: HEADING_FONT,
    headingWeight: 700,
    headingTracking: '-0.015em',
    btnRadius: '12px',
    chipRadius: '10px',
    cardRadius: '16px',
    fieldRadius: '11px',
    light: {
      bg: '#EEF0EA', surface: '#FFFFFF', surface2: '#E5E8E0', surfaceAlt: '#F6F8F3',
      text: '#1E261E', text2: '#4A5247', text3: '#8C9488',
      border: 'rgba(30,38,30,0.12)', borderStrong: 'rgba(30,38,30,0.34)',
      accent: '#3A4A38', accentPress: '#283626', accentWeak: '#E4EAE0', accentBorder: 'rgba(58,74,56,0.34)',
      onAccent: '#FFFFFF', good: '#4F8A4A', goodWeak: '#E5F0E2',
      shadow: '0 2px 0 rgba(20,28,20,0.05), 0 12px 30px rgba(20,28,20,0.08)',
      shadowSm: '0 2px 0 rgba(20,28,20,0.05)',
      statusDark: false,
    },
    dark: {
      bg: '#0E120E', surface: '#171D16', surface2: '#222A21', surfaceAlt: '#121712',
      text: '#EFF1EA', text2: 'rgba(239,241,234,0.66)', text3: 'rgba(239,241,234,0.4)',
      border: 'rgba(150,170,145,0.18)', borderStrong: 'rgba(150,170,145,0.36)',
      accent: '#8FB585', accentPress: '#79A06F', accentWeak: 'rgba(143,181,133,0.16)', accentBorder: 'rgba(143,181,133,0.42)',
      onAccent: '#10180F', good: '#7FC079', goodWeak: 'rgba(127,192,121,0.16)',
      shadow: '0 2px 0 rgba(0,0,0,0.5), 0 14px 34px rgba(0,0,0,0.6)',
      shadowSm: '0 2px 0 rgba(0,0,0,0.5)',
      statusDark: true,
    },
  },

  // ── 4 · CRIMSON (school colors — University of Alabama) ────────────────
  // A genuinely separate direction, not sage-with-a-red-button. It previously reused
  // sage's surfaces/text/borders verbatim and swapped only the four accent* tokens, which
  // is exactly why it read as "the same app with a different button colour".
  //
  // Identity: CRIMSON + GRAY. The neutrals are cool, slightly crimson-tinted grays — no
  // warm cream, no green in the text — so the whole surface reads as steel/graphite and the
  // UA crimson (#9E1B32) lands as the single loud colour against it. Shape is squarer than
  // sage's soft rounding (cards 14 vs 20, buttons 10 vs 14) with tighter, heavier headings,
  // so the mode is recognisable in a glance even in a greyscale screenshot.
  // `good` stays green: semantic colours must not follow the brand.
  crimson: {
    headingFont: HEADING_FONT,
    headingWeight: 800,
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
      onAccent: '#FFFFFF', good: '#4F8A4A', goodWeak: '#E5F0E2',
      shadow: '0 1px 2px rgba(27,29,33,0.06), 0 10px 26px rgba(27,29,33,0.09)',
      shadowSm: '0 1px 2px rgba(27,29,33,0.08)',
      statusDark: false,
    },
    dark: {
      bg: '#131417', surface: '#1C1E22', surface2: '#282B31', surfaceAlt: '#17191C',
      text: '#F2F3F5', text2: 'rgba(242,243,245,0.66)', text3: 'rgba(242,243,245,0.42)',
      border: 'rgba(214,220,228,0.14)', borderStrong: 'rgba(214,220,228,0.3)',
      accent: '#CF3B52', accentPress: '#B23146', accentWeak: 'rgba(207,59,82,0.18)', accentBorder: 'rgba(207,59,82,0.45)',
      onAccent: '#FFFFFF', good: '#7FC079', goodWeak: 'rgba(127,192,121,0.16)',
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
