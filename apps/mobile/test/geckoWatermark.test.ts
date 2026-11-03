import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const createElement = (type: unknown, props: unknown, ...children: unknown[]) => ({ type, props, children });
const native = {
  View: 'View', Text: 'Text', StatusBar: 'StatusBar',
  StyleSheet: { create: (styles: unknown) => styles, absoluteFill: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 } },
};

function load(file: string): Record<string, any> {
  const source = readFileSync(new URL(`../../../packages/ui/src/${file}.tsx`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  const exports = {};
  runInNewContext(compiled, {
    exports,
    require: (name: string) => {
      if (name === 'react') return { createElement, forwardRef: (component: unknown) => component };
      if (name === 'react-native') return native;
      if (name === 'react-native-keyboard-controller') return {};
      if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 24 }) };
      if (name === './ThemeProvider') return { useTheme: () => ({}) };
      if (name === './textScale') return { useLargeText: () => false, TEXT_CAPS: {} };
      if (name === './GeckoWatermark') return { GeckoWatermark: 'GeckoWatermark' };
      if (name === './Gecko') return { GeckoMark: 'GeckoMark' };
      if (name === './Icon') return { Ic: 'Ic' };
      if (name === './Button') return { Button: 'Button' };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return exports;
}

const { GeckoWatermark } = load('GeckoWatermark');
const { BandHeader } = load('Layout');
const { EmptyState } = load('EmptyState');

test('watermark is an isolated, clipped, decorative 6% layer with no layout or touch participation', () => {
  for (const centered of [false, true]) {
    const layer = GeckoWatermark({ centered });
    assert.equal(layer.props.pointerEvents, 'none');
    assert.equal(layer.props.accessible, false);
    assert.equal(layer.props.accessibilityElementsHidden, true);
    assert.equal(layer.props.importantForAccessibility, 'no-hide-descendants');
    const style = Object.assign({}, ...layer.props.style.filter(Boolean));
    assert.equal(style.position, 'absolute');
    assert.equal(style.overflow, 'hidden');
    assert.equal(style.top, 0);
    assert.equal(style.bottom, 0);
    assert.equal(style.alignItems, centered ? 'center' : 'flex-end');
    assert.equal(layer.children[0].type, 'GeckoMark');
    assert.equal(layer.children[0].props.style.opacity, 0.06);
  }
});

test('band watermark is controlled only by its opt-in prop, preserving content and layout', () => {
    for (const watermark of [undefined, false, true]) {
      const band = BandHeader({ title: 'Home', children: 'Search', watermark });
      const marks = band.children.filter((child: any) => child?.type === 'GeckoWatermark');
      assert.equal(marks.length, watermark ? 1 : 0);
      assert.equal(band.children.at(-1).children[0], 'Search');
      assert.equal(Object.assign({}, ...band.props.style).overflow, undefined);
    }
});

test('empty-state watermark preserves minimal content and optional actions', () => {
  const empty = EmptyState({ title: 'Nothing here' });
  assert.equal(empty.children[0].type, 'GeckoWatermark');
  assert.equal(empty.children[0].props.centered, true);
  assert.equal(empty.children[2].children[0], 'Nothing here');
  assert.equal(empty.children[3], null);
  assert.equal(empty.children[4], null);
  const onAction = () => {};
  const actionable = EmptyState({ title: 'No sessions', subtitle: 'Try search', actionLabel: 'Search', onAction });
  assert.equal(actionable.children[3].children[0], 'Try search');
  assert.equal(actionable.children[4].children[0].props.onPress, onAction);
});
