import type { Metadata } from 'next';
import { LegalPage, H2, P, UL } from '../legal/legal';

export const metadata: Metadata = {
  title: 'Terms of Service — noot',
  description: 'The agreement between you and noot.',
};

// Apple requires an EULA link for apps with user-generated content, alongside the moderation
// commitments in Guideline 1.2 (filter, report, block, and act on reports within 24 hours).
// noot has user-generated content in two places — chat messages and tutor reviews — so those
// commitments are stated here rather than assumed.
export default function Terms() {
  return (
    <LegalPage title="Terms of Service" updated="11 August 2026">
      <P>
        These terms govern your use of noot. By creating an account you agree to them. If you do not
        agree, do not use noot.
      </P>

      <H2>Who can use noot</H2>
      <P>
        You need a valid campus (<code>.edu</code>) email address at a supported university and must
        be at least 13 years old. One account per person. You are responsible for what happens under
        your account.
      </P>

      <H2>What noot is</H2>
      <P>
        noot connects students who want tutoring with student tutors at the same university. noot is
        a <strong>marketplace</strong>. Tutors are independent — they are not employees, contractors
        or agents of noot. We do not supervise sessions and we do not guarantee any particular
        academic result.
      </P>

      <H2>Tutor verification</H2>
      <P>
        Tutors submit a transcript or grade screenshot, which our team reviews before approving them
        to take bookings. Verification confirms that a tutor earned the grades they claim. It is not
        a guarantee of teaching quality, and it is not a background check.
      </P>

      <H2>Payments</H2>
      <UL>
        <li>Students pay through the app. Card processing is handled by Stripe.</li>
        <li>noot takes a service fee from each completed session; the fee is shown before you pay.</li>
        <li>Tutors are paid out through Stripe after a session is completed.</li>
        <li>Cancellation and no-show handling is described in the app at the time of booking.</li>
      </UL>

      <H2>Academic integrity</H2>
      <P>
        Tutoring means helping someone learn. You may not use noot to have work completed for you, to
        obtain or share exam material, or to do anything that breaks your university&apos;s academic
        integrity policy. Accounts used this way are removed.
      </P>

      <H2>Content and conduct</H2>
      <P>
        You are responsible for what you post — messages, attachments, reviews, and profile content.
        You may not post content that is unlawful, harassing, hateful, sexually explicit, or that
        infringes someone else&apos;s rights, and you may not impersonate anyone.
      </P>
      <P>
        There is no tolerance for abusive content or abusive users. You can report a message or a
        user from within the app, and you can block a user, which stops them contacting you. We
        review reports and act on them — including removing content and terminating accounts —
        within 24 hours of the report.
      </P>

      <H2>Suspension and termination</H2>
      <P>
        We may suspend or terminate an account that breaks these terms. You can delete your account
        at any time from <strong>Profile → Delete account</strong>.
      </P>

      <H2>Disclaimer and liability</H2>
      <P>
        noot is provided &quot;as is&quot;. To the maximum extent permitted by law we disclaim
        warranties of every kind, and our total liability to you for any claim relating to noot is
        limited to the greater of the amount you paid us in the three months before the claim, or
        $50.
      </P>

      <H2>Changes</H2>
      <P>
        We may update these terms. We will update the date at the top of this page and, for
        significant changes, notify you in the app. Continuing to use noot after a change means you
        accept the updated terms.
      </P>
    </LegalPage>
  );
}
