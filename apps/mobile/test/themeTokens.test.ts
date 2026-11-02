import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIRECTIONS, resolveTheme } from '@noot/theme';

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

test('only sage and crimson directions remain, with shared body and heading fonts', () => {
  assert.deepEqual(DIRECTIONS.map(({ id }) => id), ['sage', 'crimson']);
  const sage = resolveTheme('sage');
  assert.equal(sage.headingFont, sage.bodyFont);
});
