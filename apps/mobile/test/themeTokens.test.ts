import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BODY_FONT, DIRECTIONS, resolveTheme } from '@noot/theme';

function relativeLuminance(hex: string): number {
  const channels = hex.slice(1).match(/.{2}/g)?.map((value) => Number.parseInt(value, 16) / 255);
  assert.ok(channels && channels.length === 3, `${hex} is a six-digit hex color`);
  const linear = channels!.map((value) => (
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  ));
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

function contrast(foreground: string, background: string): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

test('header color tokens have readable contrast in every theme direction and mode', () => {
  for (const { id } of DIRECTIONS) {
    for (const dark of [false, true]) {
      const theme = resolveTheme(id, dark);
      assert.match(theme.band, /^#[\dA-Fa-f]{6}$/);
      assert.match(theme.onBand, /^#[\dA-Fa-f]{6}$/);
      assert.ok(contrast(theme.onBand, theme.band) >= 4.5, `${id} ${dark ? 'dark' : 'light'} header contrast`);
    }
  }
});

test('danger event colors are available in every theme direction and mode', () => {
  for (const { id } of DIRECTIONS) {
    for (const dark of [false, true]) {
      const theme = resolveTheme(id, dark);
      assert.equal(theme.danger, dark ? '#FF6B5E' : '#D23F31');
      assert.equal(theme.dangerWeak, dark ? 'rgba(255,107,94,0.16)' : 'rgba(210,63,49,0.12)');
    }
  }
});

test('only sage and crimson directions remain, with separate heading fonts and unchanged body font', () => {
  assert.deepEqual(DIRECTIONS.map(({ id }) => id), ['sage', 'crimson']);
  const sage = resolveTheme('sage');
  assert.equal(sage.headingFont, 'NootHeading-Bold');
  assert.equal(sage.headingFontSemi, 'NootHeading-SemiBold');
  assert.equal(sage.bodyFont, BODY_FONT);
});
