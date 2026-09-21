# noot — Terms of Use

**Effective date: 17 September 2026**

> **This file is the source of truth for the published Terms of Use.** It exists in the repo so
> the terms can be reviewed in a diff and so `TERMS_VERSION` in `apps/mobile/lib/legal.ts` has
> something to be "in step with".
>
> **Publish this text at `https://trynoot.com/terms`.** That is already where the app points
> (`PATHS.terms` in `apps/mobile/lib/legal.ts`, set 2026-09-21), where the sign-up checkbox
> links, where every auth email footer links, and what the App Review notes tell Apple. The
> page does not need to exist for the build — but **it must be live before the app is
> submitted**, or a reviewer tapping "Terms of Use" gets a 404, which is a Guideline 1.2
> failure.
>
> **Every factual statement below was checked against the code** — cancellation tiers against
> `supabase/functions/cancel-booking/index.ts`, the platform fee against `FEE_RATE` in
> `supabase/functions/_shared/booking.ts`, the 24-hour commitment against
> `apps/mobile/app/admin_reports.tsx`. If you change the policy in one place, change it in both.
>
> **This is not legal advice.** Have a lawyer review it before publishing, particularly §17–§19
> and the age requirement in §2.

---

## 1. Acceptance of these terms

noot ("noot", "we", "us") operates a mobile application that connects university students who
want tutoring with other students at the same university who tutor. These Terms of Use ("Terms")
are a binding agreement between you and noot.

You accept these Terms when you tick the box during sign-up. You cannot create an account
without accepting them. If you do not agree, do not use noot.

Our [Privacy Policy](https://trynoot.com/privacy) explains what we collect and why, and forms
part of these Terms.

## 2. Who may use noot

To use noot you must:

- be at least 18 years old;
- be a currently enrolled student at a university we support, and verify a working university
  (`.edu`) email address — this check is enforced on our servers, not just in the app; and
- provide accurate information about yourself, and keep it accurate.

One person, one account. Do not create an account for anyone else, share your account, or use
someone else's.

## 3. What noot is, and what it is not

noot is a **marketplace**. We help students find each other, schedule sessions, and pay for them
safely. We are **not** a school, a tutoring company, or an employer.

- Tutors on noot are **independent** — they are not our employees, contractors, or agents. They
  set their own rates, subjects, and availability.
- We do not supervise, direct, or control how a session is taught.
- We **do not guarantee any academic outcome**. No grade, score, or result is promised by us or
  by any tutor.
- We verify tutors before they can accept bookings (see §9), but we are not responsible for a
  tutor's conduct, competence, or statements.

## 4. Your account

Keep your password confidential and tell us promptly at **admin@trynoot.com** if you believe
someone else has accessed your account. You are responsible for activity under your account.

## 5. Zero tolerance for objectionable content and abusive behavior

**noot has zero tolerance for objectionable content and abusive behavior.** This is not a
guideline; it is a condition of using the service.

You may not post, send, or upload content that is:

- harassing, bullying, threatening, or intimidating;
- hateful or discriminatory, or which demeans a person or group on the basis of race, ethnicity,
  national origin, religion, sex, gender, gender identity, sexual orientation, disability, age,
  or any other protected characteristic;
- sexually explicit, sexually suggestive toward a minor, or otherwise pornographic;
- violent, gory, or which glorifies or incites violence or self-harm;
- defamatory, deliberately false, or impersonating another person;
- an invasion of someone's privacy, including sharing another person's personal information,
  images, or messages without their consent; or
- illegal, or which promotes illegal activity.

Accounts that post such content are **suspended or permanently banned**, and we may do so
without prior notice and without refund of any amount you would otherwise be owed.

We enforce this in two ways, both of which run on our servers rather than in the app, so they
cannot be bypassed by a modified client:

- a **blocked-term filter** applied to messages, tutor bios, review comments, display names, and
  locations at the point they are written to our database; and
- **human review** of every report (see §7).

## 6. Other prohibited conduct

You also may not:

- arrange payment for a session outside noot in order to avoid our fees or protections;
- use noot to advertise, recruit, spam, or sell anything unrelated to tutoring;
- scrape, reverse-engineer, or attempt to gain unauthorised access to noot or another user's
  account;
- interfere with the operation of the service, including our payment or moderation systems;
- upload a transcript, grade record, or identity document that is not genuinely yours; or
- use noot for anything unlawful.

## 7. Reporting, blocking, and enforcement

If someone behaves badly, tell us. In the app you can:

- **report a message** by pressing and holding it;
- **report or block a person** from the ⋯ menu in the chat header; and
- manage or undo blocks under **Profile → Blocked users**.

Blocking is mutual and enforced on our servers in both directions: a blocked person cannot
message you and cannot book you.

**We commit to reviewing every report within 24 hours.** Depending on what we find, we may
remove content, warn the account, suspend it, permanently ban it, cancel affected bookings and
refund them, or report the matter to the relevant university or to law enforcement.

Reports are made in good faith. Knowingly filing false reports is itself a violation of §6.

## 8. Academic integrity

noot is for **learning**. You may not use noot to obtain or provide work that will be submitted
as someone else's own, including completing another student's assignment, exam, quiz, or
take-home test, or supplying answers during an assessment.

Doing so violates these Terms and, in nearly every case, your university's academic honesty
policy. We will act on credible reports of it, and we may share information with your university
where we are required or permitted to do so.

## 9. Tutors

If you tutor on noot:

- You must be **approved before you can accept bookings.** Approval involves verifying your
  university email and reviewing the course grades you claim against an official transcript you
  upload.
- Your grades are verified for our internal review. **They are not published on your public
  profile.**
- Claim only courses you actually completed, at the grade you actually earned. Misrepresenting
  this is grounds for immediate and permanent removal.
- You are responsible for your own taxes. We are not your employer, and nothing in these Terms
  creates an employment, partnership, or agency relationship.
- Show up on time, teach the session you agreed to, and behave professionally.

## 10. Bookings, payments, cancellations, and refunds

**Paying.** When you book a session, your payment method is authorised for the full price and
the funds are **held**. They are released to the tutor only after the session is marked complete.
Payments are processed by **Stripe**; we never receive or store your full card number.

**Prices.** The price of a session is calculated and fixed **on our servers** from the tutor's
published rate and the session length. The app cannot alter it.

**If you (the student) cancel:**

| When you cancel | Refund |
| --- | --- |
| More than 24 hours before the session | **100%** |
| Between 2 and 24 hours before | **50%** |
| Less than 2 hours before | **No refund** |

**If the tutor cancels**, you are refunded **100%**, whenever it happens.

**No-shows.** If a tutor does not attend, report it in the app; a confirmed tutor no-show is
refunded in full. If a student does not attend, the session is treated as a late cancellation
under the table above.

**Disputes.** If something goes wrong with a session, raise it in the app or email
**admin@trynoot.com**. We will look at both sides and may refund, partially refund, or release
payment to the tutor. Our decision on a disputed session is final as between you and us; nothing
here removes any right you have to a chargeback through your card issuer.

## 11. Tutor payouts and our fee

After a session is marked complete, the tutor's earnings are transferred to the Stripe account
they connected under **Profile → Payout account**. Transfers typically arrive within a few
business days; the timing is Stripe's, not ours.

noot retains a platform fee of **17.5%** of the session price. The tutor receives the remainder.
We will give notice in the app before changing this fee, and a change never applies to a session
already booked.

A tutor must have a working payout account connected before funds can be released. We will not
capture a student's payment for a session we cannot pay out.

## 12. Your content

You keep ownership of what you write and upload — messages, your bio, reviews, your profile
photo, your transcript.

You grant us a non-exclusive, worldwide, royalty-free licence to host, store, reproduce, and
display that content **for the purpose of operating noot** — showing your bio to students,
delivering your messages to the other person, reviewing your transcript to verify you. This
licence exists so we can run the service; it does not let us sell your content or use it to
advertise, and it ends when you delete the content or your account, except for copies we must
retain for the legal, accounting, and safety reasons described in the Privacy Policy.

You are responsible for having the right to upload what you upload.

## 13. Ratings and reviews

You may be asked to rate a session. Rate honestly, from your own experience. Do not offer or
accept anything in exchange for a rating.

Review comments pass through the filter described in §5, and we may remove a review that
violates these Terms. We collect ratings to monitor quality on our side; **ratings are not
currently displayed to other users.**

## 14. Privacy

What we collect, why, how long we keep it, and how to get it deleted are all described in the
[Privacy Policy](https://trynoot.com/privacy).

## 15. Ending your use of noot

**You** may delete your account at any time under **Profile → Delete account**. Deletion is
permanent. If you have a session that is still booked, cancel or complete it first — we will not
delete an account with money held for a live session.

**We** may suspend or terminate your account if you break these Terms, if we are required to by
law, or if we reasonably believe it is necessary to protect another user. Where the reason is not
a safety issue, we will tell you why.

Some records survive account deletion where we are obliged to keep them — payment and tax
records, and records of safety reports. The Privacy Policy sets out what and for how long.

## 16. Availability

We try to keep noot running, but we do not promise it will be uninterrupted or error-free. We may
change, suspend, or discontinue features. If we discontinue noot entirely, we will give you
reasonable notice and settle any funds properly owed to you.

## 17. Disclaimers

Except where the law does not allow it, noot is provided **"as is" and "as available"**, and we
disclaim all implied warranties, including merchantability, fitness for a particular purpose, and
non-infringement.

**We do not warrant** any academic result, the accuracy of anything a user tells you, or the
conduct of any user. We verify tutors' claimed grades against transcripts; we do not otherwise
run background checks, and verification is not a character reference.

## 18. Limitation of liability

To the fullest extent permitted by law, noot is not liable for indirect, incidental, special,
consequential, or punitive damages, or for lost profits, data, or goodwill, arising from your use
of noot.

Our total liability for any claim relating to noot is limited to the greater of (a) the total
amount you paid or were owed through noot in the 12 months before the claim, and (b) US$100.

Nothing in these Terms excludes liability that cannot lawfully be excluded, including for our own
fraud, or for death or personal injury caused by our negligence.

## 19. Indemnity

You agree to indemnify noot against claims, losses, and reasonable legal costs arising from your
breach of these Terms, from content you post, or from your conduct toward another user —
except to the extent the claim arises from our own acts or omissions.

## 20. Changes to these Terms

We may update these Terms. If a change is material, we will notify you in the app or by email
before it takes effect, and we will update the effective date at the top. Continuing to use noot
after a change takes effect means you accept the updated Terms. If you do not accept them, delete
your account.

Each version of these Terms has a version identifier, and we record which version you accepted
when you signed up.

## 21. Governing law

These Terms are governed by the laws of the **State of Alabama, USA**, without regard to its
conflict-of-laws rules. You and noot agree to the exclusive jurisdiction of the state and federal
courts located in Alabama, except that either of us may seek an injunction in any court with
jurisdiction to protect intellectual property or user safety.

## 22. No university affiliation

noot is an **independent** service. It is not affiliated with, sponsored by, endorsed by, or
otherwise connected to the University of Alabama or any other university, and no university
trademark, logo, or name is used to imply otherwise. Requiring a university email address is a
way of confirming that users are real students on the same campus; it does not indicate any
relationship with the university.

## 23. Miscellaneous

These Terms, together with the Privacy Policy, are the entire agreement between you and us about
noot. If a provision is held unenforceable, the rest stays in force. Our not enforcing a
provision immediately does not waive it. You may not assign these Terms; we may assign them in
connection with a merger, acquisition, or sale of assets.

## 24. Contact us

**admin@trynoot.com**

In the app: **Profile → Help & support**.
