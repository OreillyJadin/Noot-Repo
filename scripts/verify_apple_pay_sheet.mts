import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const b4 = readFileSync(new URL('../apps/mobile/app/b4.tsx', import.meta.url), 'utf8');

assert.match(b4, /applePay:\s*\{[\s\S]*?cartItems:\s*applePayCartItems/);
assert.match(b4, /\bisPlatformPaySupported\b/);
assert.match(
  b4,
  /if \(Constants\.appOwnership === 'expo' \|\| Platform\.OS !== 'android'\) return;[\s\S]*?isPlatformPaySupported\(\)/,
);
assert.match(
  b4,
  /const paymentMethodLabel = Platform\.OS === 'ios'\s*\?\s*'Card or Apple Pay'/,
);
assert.match(
  b4,
  /Platform\.OS === 'android' && walletSupported\s*\?\s*'Card or Google Pay'/,
);
assert.doesNotMatch(b4, /Card,\s*Apple Pay or Google Pay/);

console.log('verify_apple_pay_sheet: Apple Pay summary and wallet support checks passed');
