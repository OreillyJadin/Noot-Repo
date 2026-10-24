import type { PlatformPay } from '@stripe/stripe-react-native';

type ApplePaySummaryInput = {
  sessionLabel: string;
  amountCents: number;
  studentFeeCents: number;
  creditCents: number;
  chargeCents: number;
};

const dollars = (cents: number) => (cents / 100).toFixed(2);
const IMMEDIATE_PAYMENT_TYPE = 'Immediate' as PlatformPay.PaymentType.Immediate;

export function applePayCartItems({
  sessionLabel,
  amountCents,
  studentFeeCents,
  creditCents,
  chargeCents,
}: ApplePaySummaryInput): PlatformPay.CartSummaryItem[] {
  const items: PlatformPay.CartSummaryItem[] = [
    {
      paymentType: IMMEDIATE_PAYMENT_TYPE,
      label: sessionLabel,
      amount: dollars(amountCents - studentFeeCents),
    },
  ];

  if (studentFeeCents > 0) {
    items.push({
      paymentType: IMMEDIATE_PAYMENT_TYPE,
      label: 'Service fee',
      amount: dollars(studentFeeCents),
    });
  }

  if (creditCents > 0) {
    items.push({
      paymentType: IMMEDIATE_PAYMENT_TYPE,
      label: 'Noot credit',
      amount: dollars(-creditCents),
    });
  }

  items.push({
    paymentType: IMMEDIATE_PAYMENT_TYPE,
    label: 'Noot',
    amount: dollars(chargeCents),
  });

  return items;
}
