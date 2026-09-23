// Independent Contractor Agreement shown on onboarding step 7.
//
// ⚠️ PLACEHOLDER (tracker D6, decided 2026-09-23): plain-language terms that match how the
// app actually works, pending the real agreement from counsel. Signatures record
// AGREEMENT_VERSION (@noot/core), so each one points at this exact text. When the real
// agreement lands: replace AGREEMENT_SECTIONS, bump AGREEMENT_VERSION, and have tutors re-sign.
// Fee numbers must match supabase/functions/_shared/fees.ts.
export const AGREEMENT_TITLE = 'Independent Contractor Agreement';

export const AGREEMENT_SECTIONS: readonly { heading: string; body: string }[] = [
  {
    heading: '1. You are an independent contractor',
    body:
      'You tutor through noot as an independent contractor, not an employee of noot or Watchmen Ventures. ' +
      'You choose your courses, your rates, your hours and whether to accept any session.',
  },
  {
    heading: '2. Payments and fees',
    body:
      'Students pay through noot. After a session is completed, noot keeps a platform fee and sends the rest ' +
      'to your Stripe account: 17.5% of the session price if your grades are verified, 32.5% if they are not. ' +
      'The fee is fixed when the session is booked, and you always see your payout before you accept.',
  },
  {
    heading: '3. Taxes',
    body:
      'You are responsible for your own taxes. Stripe may issue you a tax form (such as a 1099-K) for the ' +
      'payouts you receive.',
  },
  {
    heading: '4. Honest profile',
    body:
      'The courses, grades and transcript you give us must be accurate. We may remove a course, your ' +
      'Verified badge or your account if they are not.',
  },
  {
    heading: '5. Conduct',
    body:
      'You will follow the noot Terms of Use, treat students respectfully, meet only in the agreed place and ' +
      'time, and never ask to be paid outside the app.',
  },
  {
    heading: '6. Ending the agreement',
    body:
      'Either of us can end this agreement at any time. Sessions already completed are still paid out.',
  },
];

export const AGREEMENT_CHECKS: readonly string[] = [
  'I have read and agree to the Agreement.',
  'I am responsible for my own taxes.',
  'I am 18 years or older.',
];
