import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function load(path: string, mocks: Record<string, unknown>): Record<string, any> {
  const compiled = ts.transpileModule(readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  const exports = {};
  runInNewContext(compiled, { exports, require: (name: string) => {
    assert.ok(name in mocks, `Unexpected import: ${name}`);
    return mocks[name];
  } });
  return exports;
}

const react = { createElement: (type: unknown, props: unknown, ...children: unknown[]) => ({ type, props, children }), Fragment: 'Fragment' };
const native = { View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView', StyleSheet: { create: (styles: unknown) => styles } };
const theme = { useTheme: () => ({ accent: 'green', text3: 'gray' }) };

test('tab icon feedback uses native 100ms scale and cancels interrupted/unmounted animations', () => {
  let effect: (() => () => void) | undefined;
  let value: unknown;
  let starts = 0;
  let stops = 0;
  const configs: any[] = [];
  const { TabPressScale } = load('packages/ui/src/TabPressScale.tsx', {
    react: { ...react, useRef: (initial: unknown) => ({ current: value ??= initial }), useEffect: (fn: typeof effect) => { effect = fn; } },
    'react-native': { Animated: {
      Value: class { constructor(public initial: number) {} }, View: 'Animated.View',
      timing: (scale: unknown, config: unknown) => {
        assert.equal(scale, value);
        configs.push(config);
        return { start: () => starts++, stop: () => stops++ };
      },
    } },
  });
  for (const pressed of [false, true, false, true]) {
    const icon = TabPressScale({ pressed, children: 'icon' });
    assert.equal(icon.children[0], 'icon');
    assert.equal(icon.props.style[1].transform[0].scale, value);
    const cleanup = effect!();
    const config = configs.at(-1);
    assert.equal(config.toValue, pressed ? 0.92 : 1);
    assert.equal(config.duration, 100);
    assert.equal(config.useNativeDriver, true);
    cleanup();
  }
  assert.equal(starts, 4);
  assert.equal(stops, 4);
});

test('all role tab buttons scale only the icon and dispatch immediately, including active reselects', () => {
  const { TabBar } = load('packages/ui/src/TabBar.tsx', {
    react, 'react-native': native, './ThemeProvider': theme,
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    './textScale': { TEXT_CAPS: {} }, './Icon': { Ic: 'Ic' }, './Gecko': { GeckoMark: 'GeckoMark' }, './TabPressScale': { TabPressScale: 'TabPressScale' },
  });
  for (const [role, count] of [['student', 5], ['tutor', 5], ['ambassador', 3], ['admin', 3], [undefined, 5], ['unexpected', 5]] as const) {
    const pressedKeys: string[] = [];
    const tabs = TabBar({ role, active: 'home', onTab: (key: string) => pressedKeys.push(key) }).children[0];
    assert.equal(tabs.length, count);
    for (const tab of tabs) {
      assert.equal(tab.props.accessibilityRole, 'button');
      assert.equal(tab.props.accessibilityState.selected, tab.props.key === 'home');
      for (const pressed of [true, false]) {
        const content = tab.children[0]({ pressed });
        assert.equal(content.children[0].type, 'TabPressScale');
        assert.equal(content.children[0].props.pressed, pressed);
        assert.ok(['Ic', 'GeckoMark'].includes(content.children[0].children[0].type));
        assert.equal(content.children[1].type, 'Text');
      }
      tab.props.onPress();
      assert.equal(pressedKeys.at(-1), tab.props.key);
    }
  }
});

test('admin sub-tabs preserve empty state, labels, counts and same-route/cross-route dispatch', () => {
  const calls: unknown[] = [];
  const { AdminTabs } = load('apps/mobile/lib/AdminTabs.tsx', {
    react, 'react-native': native, '@noot/core': {},
    '@noot/ui': { ...theme, useLargeText: () => false, TabPressScale: 'TabPressScale' },
    'expo-router': { usePathname: () => '/admin_tutors', useRouter: () => ({ setParams: (params: unknown) => calls.push(params), replace: (href: string) => calls.push(href) }) },
  });
  assert.equal(AdminTabs({ tabs: [], active: '' }).children[0].length, 0);
  const tabs = AdminTabs({ tabs: [
    { key: 'applications', label: 'Applications', count: 2, href: '/admin_tutors?tab=applications' },
    { key: 'reviews', label: 'Reviews', href: '/admin_reviews' },
  ], active: 'applications' }).children[0];
  assert.equal(tabs[0].props.accessibilityLabel, 'Applications, 2');
  assert.equal(tabs[1].props.accessibilityLabel, 'Reviews');
  assert.equal(tabs[0].props.accessibilityState.selected, true);
  assert.equal(tabs[0].children[0]({ pressed: true }).children[0].props.pressed, true);
  tabs[0].props.onPress();
  assert.equal((calls[0] as { tab: string }).tab, 'applications');
  tabs[1].props.onPress();
  assert.equal(calls[1], '/admin_reviews');
});
