export function payoutRecap(input: {
  actualAmount?: number;
  estimatedAmount?: number;
  payoutFailedAt?: string | null;
  loading: boolean;
  error: boolean;
}) {
  const estimated = input.actualAmount == null && input.estimatedAmount != null;
  const amount = input.actualAmount ?? input.estimatedAmount;
  const label = estimated ? 'Estimated net payout' : 'Net payout';
  let message: string;
  if (input.loading) {
    message = 'Checking payout details…';
  } else if (input.error) {
    message = 'Could not refresh payout details. Payout status is unavailable.';
  } else if (input.payoutFailedAt) {
    message = "Payout delayed. We're retrying automatically.";
  } else if (estimated) {
    message = 'This is an estimate. The final payout will be shown once booking details are available.';
  } else if (amount != null) {
    message = 'Your net payout is recorded. Check your Stripe account for transfer timing.';
  } else {
    message = 'Payout details are not available yet.';
  }
  return { amount, label, message };
}
