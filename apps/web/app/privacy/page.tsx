import type { Metadata } from 'next';
import { LegalPage, H2, P, UL } from '../legal/legal';

export const metadata: Metadata = {
  title: 'Privacy Policy — noot',
  description: 'What noot collects, why, and how to delete your account.',
};

// The URL submitted to App Store Connect. It must stay publicly reachable without a login —
// Apple's reviewers open it directly, and a 404 here stalls the review.
//
// Everything below describes what the app ACTUALLY does today; it is not boilerplate. If a
// data practice changes, this page changes with it, because the App Store privacy nutrition
// label is checked against it.
export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy" updated="11 August 2026">
      <P>
        noot is a peer tutoring marketplace for university students. This policy explains what we
        collect, why we collect it, and what control you have. It covers the noot mobile app and
        this website.
      </P>

      <H2>What we collect</H2>
      <UL>
        <li>
          <strong>Account details</strong> — your name and campus (<code>.edu</code>) email address.
          The campus email is required: it is how we verify you belong to the university.
        </li>
        <li>
          <strong>Profile information you choose to add</strong> — year, major, courses you are
          taking, a profile photo.
        </li>
        <li>
          <strong>Tutor application material</strong> — if you apply to tutor, the courses you claim,
          the grades you earned, and a transcript or grade screenshot you upload for verification.
        </li>
        <li>
          <strong>Messages and attachments</strong> you send to other users through the app.
        </li>
        <li>
          <strong>Booking and payment records</strong> — sessions booked, amounts, and payout status.
        </li>
      </UL>

      <H2>What we do not collect</H2>
      <P>
        We do not collect your location, contacts, browsing activity, or advertising identifiers. We
        do not use third-party advertising or analytics SDKs, and we do not sell personal data.
      </P>

      <H2>Card payments</H2>
      <P>
        Payments are processed by <strong>Stripe</strong>. Card numbers are entered directly into
        Stripe&apos;s payment sheet and are never sent to or stored on noot&apos;s servers. Tutors
        receiving payouts complete Stripe&apos;s own onboarding, and the identity information that
        requires is held by Stripe, not by us. See{' '}
        <a href="https://stripe.com/privacy" style={{ color: '#78A070' }}>Stripe&apos;s privacy policy</a>.
      </P>

      <H2>Who can see what</H2>
      <UL>
        <li>
          <strong>Your messages</strong> are visible only to you and the person you are talking to.
        </li>
        <li>
          <strong>Your transcript</strong> is private. It is stored in a private bucket, is never
          given a public link, and is visible only to you and the noot staff who review tutor
          applications.
        </li>
        <li>
          <strong>Tutor profiles</strong> — name, year, major, courses, rating and profile photo —
          are visible to signed-in students once the tutor is approved. Pending tutors are not shown.
        </li>
        <li>
          <strong>Your email address</strong> is never shown to other users.
        </li>
      </UL>

      <H2>Deleting your account</H2>
      <P>
        You can delete your account at any time from the app: <strong>Profile → Delete account</strong>.
        Deletion is immediate and permanent — you will be signed out and will not be able to sign in
        again with that account.
      </P>
      <P>
        When you delete your account we remove your name, email address, profile photo, courses,
        messages and attachments. We keep a <em>de-identified</em> record of completed bookings and
        their payment amounts, no longer linked to your name or email, because we are required to
        retain financial records for tax and accounting purposes and to resolve payment disputes and
        chargebacks. These records cannot be used to identify you.
      </P>

      <H2>Data retention</H2>
      <P>
        We keep your information for as long as your account exists. After deletion, only the
        de-identified financial records described above are retained.
      </P>

      <H2>Children</H2>
      <P>
        noot is for university students and is not directed at children under 13. We do not knowingly
        collect information from children under 13.
      </P>

      <H2>Your rights</H2>
      <P>
        You can view and correct your information in the app, and delete your account as described
        above. To request a copy of your data, email{' '}
        <a href="mailto:support@noot.app" style={{ color: '#78A070' }}>support@noot.app</a>.
      </P>

      <H2>Changes</H2>
      <P>
        If we change this policy we will update the date at the top of this page and, for
        significant changes, notify you in the app.
      </P>
    </LegalPage>
  );
}
