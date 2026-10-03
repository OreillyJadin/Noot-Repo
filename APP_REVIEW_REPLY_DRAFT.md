# noot — Reply to App Review (Guideline 2.1 Information Needed) — DRAFT

> **This file lives in the repo.** Keep every `[BRACKET]` as a bracket here. Fill in credentials
> and the video link only when you paste into App Store Connect — never in this file.
> Claude: treat every factual statement below as a claim to verify against the code. Don't edit
> the reply's wording unless Jadin asks. Flag mismatches instead.

> **Don't send until every box is checked.** Apple compares what you write against what they see. A mismatch reads worse than a missing feature.
>
> **External (Jadin — from `HANDOFF_2026-08-11.md` §3 and `ASC_SUBMISSION_CHECKLIST.md`)**
>   - [x] `https://trynoot.com/privacy` loads publicly (verified 2026-09-17). Reviewers open it
>         directly. The domain is **trynoot.com**, not noot.app.
>   - [ ] **⚠ `https://trynoot.com/terms` must be live before submitting.** The app, the
>         sign-up checkbox, every auth email footer and these notes all point there as of
>         2026-09-21. The text is written (`legal/TERMS_OF_USE.md`) but not yet published — a
>         reviewer tapping "Terms of Use" and getting a 404 is a **Guideline 1.2** failure.
>         No rebuild is needed once the page goes up. See `APP_REVIEW_TICKETS.md` T23.
> - [x] SMTP is configured (Resend, sending as `support@trynoot.com`, verified sending 2026-09-17).
> - [ ] Stripe is on **live** keys, and test-mode Stripe IDs have been cleared (`APP_REVIEW_TICKETS.md` T10).
> - [ ] A fresh **SDK 57** production build is in TestFlight. The recording comes from that build, **not Expo Go** — Expo Go has no PaymentSheet.
> - [ ] Recorded on a physical iPhone on the latest public iOS release, starting from a cold launch.
>
> **Code (`APP_REVIEW_TICKETS.md`)** — **deployed to production 2026-09-17** (migrations
> 0029-0032 and the five changed Edge Functions); previously local-only
> - [ ] T1 — Deletion-test account exists with no upcoming sessions *(the 409 copy now reaches the user — T13 done)*
> - [ ] T3 — Report is discoverable (not long-press only); Blocked-users row on the tutor profile
> - [x] T4 — Server-side content filter is live *(migrations 0029 + 0032; `verify_filter` 16/16)*
> - [x] T5 — Server-side pricing *(`verify_pricing` 22/22 against Stripe test mode)*
> - [x] T17–T19 — Payout guards: no early capture, no capture-before-payout-check, reschedule
>       can't be used one-sidedly *(`verify_payout_guards` 13/13)*
> - [ ] T8 — Demo data reset; demo tutor onboarded to Stripe Connect in live mode
> - [x] T9 — Terms (zero tolerance) accepted at sign-up *(`verify_terms` 6/6)*
> - [x] T14 — Video sessions removed; this reply no longer claims them
> - [ ] **T16 — `pnpm check:preview` is failing** (5 remote-only migrations). Blocks pushing.
> - [x] **Edge Functions deployed** (2026-09-17) — create-payment-intent, confirm-booking,
>       complete-session, report-no-show, reschedule-booking. Migrations 0029-0032 applied by
>       the GitHub integration on push; the content filter was verified working on production.
>       **Note:** the new create-payment-intent no longer accepts a client amount, so build 4
>       (what Apple has) can no longer book. The recording must come from build 5 or later.
> - [ ] Every `[BRACKET]` is filled in, and the privacy nutrition label matches item 4

---

## Part A — Paste into the Resolution Center reply

Hello App Review team,

Thank you for reviewing noot. Our answers to each item follow. The same information is in the App Review Information → Notes field for future submissions.

### 1. Screen recording

[Attached / link: URL]. Recorded on [iPhone model] running iOS [version], starting from launch on the Home Screen.

| Time | What's shown |
|---|---|
| [0:00] | Cold launch → sign up with name and campus email → open the verification email → set password → **accept the Terms of Use (required)** → choose role |
| [0:00] | Student: search a course → tutor results → tutor profile |
| [0:00] | Book: pick an open time and campus location → pay with the Stripe payment sheet (payment held, not charged) → booking confirmed instantly |
| [0:00] | Chat with the tutor, including a photo attachment |
| [0:00] | Report a message, report a user, block a user |
| [0:00] | Send a message containing a blocked word → the server rejects it with a visible message |
| [0:00] | Switch to Tutor mode (Profile): see the booked session; Payout account (Stripe) |
| [0:00] | Tutor: "Mark session complete" on a past session → payment captured and tutor paid |
| [0:00] | Admin (Profile → noot Admin): tutor approvals, reports, user suspension |
| [0:00] | Cancel an upcoming session (shows the refund outcome) |
| [0:00] | Profile → Delete account → confirm → signed out; the login no longer works |

### 2. Purpose and target audience

noot is a peer-tutoring marketplace for university students. A student searches for the specific course they're taking — noot has the full University of Alabama catalog — and finds tutors who have already completed that course. They can book a one-on-one session in person at a campus location, and message the tutor before and after.

**Audience.** Undergraduate students at supported universities. We are launching at the University of Alabama and adding campuses. noot is a public consumer app, open to any student with an email address at a supported campus. It is not commissioned by, affiliated with, or distributed for any university or organization.

**Problem.** General tutoring rarely matches a specific course. Campus tutoring centers have limited hours. Informal peer tutoring through group chats has no vetting, no scheduling, and no payment protection.

**Value.**
- **Vetted tutors.** Tutors upload their academic transcript, and our team approves them manually before they can be booked.
- **Course-specific matching.**
- **Protected payment.** The student's payment is held and only released to the tutor after the session.
- **Safe messaging.** Chat includes reporting and blocking.

### 3. Setup and access

Sign-up requires an email address on a supported campus domain. For App Review, we have enabled the `watchmenventures.com` domain. Every account below is already verified, and the tutor is already approved.

| Account | Email | Password | Use it for |
|---|---|---|---|
| Student | `student.review@watchmenventures.com` | [ ] | Search, book, pay, chat, report, block. Has an upcoming session, a pending one, and a past session. |
| Tutor | `tutor.review@watchmenventures.com` | [ ] | Tutor mode, Mark session complete, Payout account. Already approved. |
| Admin | `admin.review@watchmenventures.com` | [ ] | Profile → noot Admin (reports queue, suspend/ban) |
| Ambassador | `ambassador.review@watchmenventures.com` | [ ] | Profile → Refer & earn |
| Deletion test | `deletion.review@watchmenventures.com` | [ ] | Profile → Delete account (no upcoming sessions) |

**Booking and payment**
- Search **MATH 125** and open **Taylor Reviewer**. Choose a time **more than 24 hours away**. Sessions can be booked up to six days ahead.
- All sessions are **in person on campus** — you pick a meeting spot when booking. The app has no video calling.
- Bookings confirm instantly. The card is authorized when you book and only charged after the tutor marks the session complete. The price is set by the tutor's rate for that course and is calculated on our server, never by the app.
- Cards, Apple Pay and Google Pay are all handled by Stripe's payment sheet; noot never sees card details.
- **Cancellation refunds are tiered:** more than 24 hours before the session, the hold is released and nothing is charged; between 2 and 24 hours, 50% is charged; under 2 hours, the session is charged in full. The app shows the outcome before you confirm.
- **Please note: this build uses our live payment account, so a booking places a real authorization on the card used.** A test session costs about $28. If you would rather not use a card, the complete payment flow is shown in the recording at [0:00]. If you do book, you can cancel from Sessions more than 24 hours ahead and the hold is released with nothing charged — and we will refund any charge on request at admin@trynoot.com.

**Roles.** One account can hold Student, Tutor, and Ambassador roles and switch between them from Profile. The admin panel is a separate, restricted entry at Profile → noot Admin.

**Account deletion.** Profile → Delete account. Deletion removes the sign-in identity and all personal data: name, email, photo, transcript, messages, and attachments. Anonymized payment records are kept for tax and chargeback purposes, as our privacy policy discloses. A user with an upcoming session is asked to cancel it first, so the other person isn't left with a session that can't happen. The Deletion test account has no upcoming sessions.

**User-generated content safeguards (Guideline 1.2)**
- **Report:** any chat message can be reported by long-pressing it, and any person can be reported from the ⋯ button in the chat header.
- **Block:** the same ⋯ menu blocks a person. A blocked person can no longer message you and cannot book a session with you; blocking is enforced on our server, in both directions. Blocked people are listed under Profile → Blocked users, where they can be unblocked. This is available on both the student and the tutor profile.
- **Server-side filter:** all user-supplied text is checked against a blocked-term list on the server before it is stored — chat messages, tutor bios, review comments, display names, and the meeting location. The check runs in the database itself, so it applies no matter which part of the app is writing.
- **Pre-moderation:** tutor profiles are approved by our team before anyone can find them. Session ratings are collected but are not shown to other users anywhere in the app.
- Our team reviews reports within 24 hours. We can remove content and suspend or ban accounts, from the in-app admin panel.
- **Terms of Use are accepted during sign-up** — the account cannot be created without it — and state zero tolerance for objectionable content and abusive behavior. They are published at https://trynoot.com/terms.
- Support is at admin@trynoot.com and in the app at Profile → Help & support.

**Payments (Guideline 3.1.3(d)).** noot sells real-time, one-on-one tutoring between two individuals, in person on campus. As Guideline 3.1.3(d) permits, these sessions are paid through Stripe rather than In-App Purchase. noot sells no digital content, subscriptions, or unlockable features, and there is nothing in the app to unlock by paying.

**Invites and Noot credit.** Every user has an invite code at Profile → Refer a friend. When someone signs up with that code and then completes a tutoring session, the person who invited them receives $5 of Noot credit. Credit is taken off the price of the inviter's next session automatically. It can't be bought and has no other use in the app: it unlocks nothing, and it is never digital content. Student ambassadors whom our team has approved (Profile → Refer & earn on the Ambassador account) also earn bonus credit at set numbers of completed invites, and can ask our team to pay out credit that is at least 7 days old in cash. Credit is earned only from completed tutoring sessions — never for app downloads, ratings, or reviews — and the app never asks a user to rate it in exchange for anything.

### 4. External services

| Service | Purpose |
|---|---|
| Supabase | Authentication (email and password with email verification), Postgres database, private file storage, serverless functions |
| Stripe | Card, Apple Pay and Google Pay payments (authorized and held, then captured) and Stripe Connect payouts to tutors. noot never stores card data. |
| [Email provider, e.g. Resend / Postmark] | Verification and password-reset email |

noot uses no AI services, no advertising SDKs, and no third-party analytics or tracking.

### 5. Regional differences

noot is available in the United States only. Content (course catalog, tutors, campus locations) is limited to supported universities. The app works the same way for all users.

### 6. Regulation and third-party material

noot does not operate in a highly regulated industry.
- Payments are processed by Stripe, a licensed payment processor.
- Course listings come from the publicly available university course catalog.
- noot uses no university logos or trademarks and is not affiliated with any university.
- Tutor transcripts are used only for verification. They are stored privately and deleted when the account is deleted.
- The app has an optional crimson accent colour under Profile → School colors. It is a colour preference only; it uses no university name, logo, or mark.

Thank you,
[Name], Watchmen Ventures LLC · [Phone] · [Email]

---

## Part B — App Review Information → Notes

Paste the block below verbatim. Fill the five `[ ]` passwords and the video timestamp;
everything else is already true in the shipped code — **provided `trynoot.com/terms` is live
before you submit** (T23).
Measured at **3,996 characters** — App Store Connect's Notes field caps at 4,000, so any
addition needs a matching cut.

```
noot is a peer-tutoring marketplace for university students: search the exact course you need help with, find students who already completed it, book a 1:1 IN-PERSON session on campus, pay, and message. Public consumer app launching at the University of Alabama. Not affiliated with or endorsed by any university; no university trademarks or logos are used, and the crimson accent is only a colour preference.

SIGN-UP
Requires a supported campus email; we enabled watchmenventures.com for review. Terms of Use must be accepted to finish sign-up. All accounts are verified and the tutor pre-approved.
Student  student.review@watchmenventures.com / [ ]  (upcoming, pending and past sessions)
Tutor    tutor.review@watchmenventures.com / [ ]  (tutor mode, Mark complete, Payout account)
Admin    admin.review@watchmenventures.com / [ ]  (Profile > noot Admin)
Ambassador ambassador.review@watchmenventures.com / [ ]  (Profile > Refer & earn)
Deletion test deletion.review@watchmenventures.com / [ ]  (no upcoming sessions, safe to delete)

BOOKING AND PAYMENT
Search MATH 125 > open Taylor Reviewer > pick a time more than 24h away (max 6 days out) > pay. Sessions are in person on campus; you choose a meeting spot. The app has no video calling. Price is computed on our server from the tutor's course rate, never sent by the app. The card is authorized at booking and captured only after the tutor marks the session complete. Refunds: >24h nothing charged, 2-24h 50%, <2h full. Card/Apple Pay/Google Pay via Stripe's sheet; we never see card details.
IMPORTANT: this build uses our live Stripe account, so booking places a REAL authorization (~$28). You need not pay to review - the full payment flow is in the recording at [0:00]. Cancelling >24h ahead releases the hold with nothing charged, and we refund any charge on request.

ACCOUNT DELETION
Profile > Delete account. Removes the sign-in identity and all personal data (name, email, photo, transcript, messages, attachments). Anonymized payment records are kept for tax and chargeback purposes, as the privacy policy discloses. An account with an upcoming session must cancel it first so the other person is not stranded - use the Deletion test account, which has none.

UGC SAFEGUARDS (Guideline 1.2)
- Report: long-press any chat message to report it; report a person from the ... button in the chat header.
- Block: the same ... menu blocks a person. They then cannot message or book you - enforced server-side in both directions. Profile > Blocked users to unblock, on both student and tutor profiles.
- Server-side filter: all user-supplied text is checked against a blocked-term list before storage - messages, bios, review comments, display names, meeting locations. It runs inside the database, so it applies no matter which part of the app writes.
- Pre-moderation: tutor profiles are approved by our team before they can be found. Ratings are collected but never shown to other users anywhere in the app.
- Every report is reviewed within 24 hours; we can remove content, suspend or ban from the in-app admin panel.
- Terms of Use are accepted at sign-up - the account cannot be created without it - and state zero tolerance for objectionable content and abusive behaviour. Published at https://trynoot.com/terms.
- Support: admin@trynoot.com, and in-app at Profile > Help & support.

PAYMENTS (Guideline 3.1.3(d))
noot sells real-time, 1:1, in-person tutoring between two individuals. As 3.1.3(d) permits, these are paid via Stripe rather than IAP. No digital content, no subscription, nothing to unlock by paying. Inviting a friend earns $5 of Noot credit once they complete a session; credit only reduces the price of a tutoring session, can't be bought, and team-approved ambassadors can have theirs paid out in cash. Never tied to downloads, ratings or reviews, and the app never asks for a rating in exchange for anything.

SERVICES
Supabase (auth, DB, storage, functions), Stripe (payments, Connect payouts), Resend (email). No AI, ads, third-party analytics/tracking, or push notifications. US only. Not a regulated industry; no protected third-party material.
```

### Before pasting — still outstanding

- [x] **Deletion test account created** (2026-09-21): `deletion.review@watchmenventures.com`,
      verified, student role, terms accepted, no bookings. The deletion flow was exercised
      against production end to end and all 8 checks passed — see T1. The account was then
      recreated clean for the reviewer. Its password is in App Store Connect only, never here.
- [ ] **`https://trynoot.com/terms` is live** — T23. The URL is already written into the
      notes; the page just has to exist before you submit.
- [ ] **Passwords** go straight into App Store Connect, never into this file.
- [ ] **`[0:00]`** — the payment timestamp in the recording.
