// Web: Stripe's embedded onboarding component is native-only, so no host registers and
// openPayoutSetup() (lib/payoutSetup) goes straight to Stripe's hosted onboarding page.
export function PayoutSetupHost() {
  return null;
}
