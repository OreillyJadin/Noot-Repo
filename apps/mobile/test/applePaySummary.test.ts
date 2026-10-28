import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applePayCartItems } from '../lib/applePaySummary.ts';

test('Apple Pay summary uses the server total and displays the fee and credit separately', () => {
  const chargeCents = 2790;
  const items = applePayCartItems({
    sessionLabel: '1 hr session with Sara',
    amountCents: 3290,
    studentFeeCents: 490,
    creditCents: 500,
    chargeCents,
  });

  assert.deepEqual(items, [
    { paymentType: 'Immediate', label: '1 hr session with Sara', amount: '28.00' },
    { paymentType: 'Immediate', label: 'Service fee', amount: '4.90' },
    { paymentType: 'Immediate', label: 'Noot credit', amount: '-5.00' },
    { paymentType: 'Immediate', label: 'Noot', amount: '27.90' },
  ]);
  const subtotalCents = items.slice(0, -1).reduce((sum, item) => sum + Number(item.amount) * 100, 0);
  assert.equal(subtotalCents, chargeCents);
});

test('Apple Pay summary omits zero fee and credit entries', () => {
  assert.deepEqual(applePayCartItems({
    sessionLabel: '30 min session with Sara',
    amountCents: 1400,
    studentFeeCents: 0,
    creditCents: 0,
    chargeCents: 1400,
  }), [
    { paymentType: 'Immediate', label: '30 min session with Sara', amount: '14.00' },
    { paymentType: 'Immediate', label: 'Noot', amount: '14.00' },
  ]);
});
