import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const screen = (name: string) => readFileSync(new URL(`../app/${name}.tsx`, import.meta.url), 'utf8');

test('auth forms retain keyboard-aware scrolling and first-tap controls with drag dismissal', () => {
  for (const name of ['signin', 'signup', 'forgot_password', 'set_password']) {
    assert.match(screen(name), /<KeyboardAwareScrollView[^>]*keyboardShouldPersistTaps="handled"[^>]*keyboardDismissMode="on-drag"[^>]*bottomOffset=\{24\}/s, name);
  }
});

test('all chat threads dismiss on drag without swallowing send or attachment taps', () => {
  for (const name of ['chat', 'chat_tutor', 'admin_chat']) {
    assert.match(screen(name), /keyboardShouldPersistTaps="handled"\s+keyboardDismissMode="on-drag"/, name);
  }
});

test('booking sheet avoids the keyboard around both search header and scrollable results', () => {
  const source = screen('b3');
  assert.match(source, /<Modal[^>]*>\s*<KeyboardAvoidingView[^>]*behavior="padding">/s);
  assert.match(source, /keyboardShouldPersistTaps=\{keyboardShouldPersistTaps\}\s*keyboardDismissMode="on-drag"/);
  assert.match(source, /contentStyle=\{styles.spotSheetContent\}\s*keyboardShouldPersistTaps="handled"/);
});
