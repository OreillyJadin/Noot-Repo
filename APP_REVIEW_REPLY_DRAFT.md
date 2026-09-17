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
>   - [ ] **⚠ No Terms of Use document is published.** `trynoot.com/terms` 404s, and the live
>         `/privacy` page is a Privacy Policy only — it contains no Terms of Use, and the words
>         "zero tolerance" and "objectionable" do not appear on it (checked 2026-09-17). The app's
>         sign-up checkbox says "I agree to noot's **Terms of Use** and Privacy Policy" and states
>         zero tolerance on-screen, but the Terms of Use link currently opens the privacy policy.
>         **Apple checks this under Guideline 1.2.** See `APP_REVIEW_TICKETS.md` T23.
> - [x] SMTP is configured (Resend, sending as `support@trynoot.com`, verified sending 2026-09-17).
> - [ ] Stripe is on **live** keys, and test-mode Stripe IDs have been cleared (`APP_REVIEW_TICKETS.md` T10).
> - [ ] A fresh **SDK 57** production build is in TestFlight. The recording comes from that build, **not Expo Go** — Expo Go has no PaymentSheet.
> - [ ] Recorded on a physical iPhone on the latest public iOS release, starting from a cold launch.
>
> **Code (`APP_REVIEW_TICKETS.md`)** — status as of 2026-09-10, all local-verified, none deployed
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
> - [ ] **Edge Functions deployed** — every function changed above is still local only
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
| Student | [ ] | [ ] | Search, book, pay, chat, report, block. Has an upcoming session, a past session, and a chat thread. |
| Tutor | [ ] | [ ] | Tutor mode, Mark session complete, Payout account |
| Admin | [ ] | [ ] | Profile → noot Admin |
| Deletion test | [ ] | [ ] | Profile → Delete account (no upcoming sessions) |

**Booking and payment**
- Search **[COURSE CODE]** and open **[Demo Tutor Name]**. Choose a time **more than 24 hours away**. Sessions can be booked up to six days ahead.
- Bookings confirm instantly. The card is authorized when you book and only charged after the tutor marks the session complete. The price is set by the tutor's rate for that course and is calculated on our server, never by the app.
- Cards, Apple Pay and Google Pay are all handled by Stripe's payment sheet; noot never sees card details.
- **Cancellation refunds are tiered:** more than 24 hours before the session, the hold is released and nothing is charged; between 2 and 24 hours, 50% is charged; under 2 hours, the session is charged in full. The app shows the outcome before you confirm.
- If you'd rather not enter a card, the full payment flow is shown in the recording at [0:00].

**Roles.** One account can hold Student, Tutor, and Ambassador roles and switch between them from Profile. The admin panel is a separate, restricted entry at Profile → noot Admin.

**Account deletion.** Profile → Delete account. Deletion removes the sign-in identity and all personal data: name, email, photo, transcript, messages, and attachments. Anonymized payment records are kept for tax and chargeback purposes, as our privacy policy discloses. A user with an upcoming session is asked to cancel it first, so the other person isn't left with a session that can't happen. The Deletion test account has no upcoming sessions.

**User-generated content safeguards (Guideline 1.2)**
- **Report:** any chat message can be reported by long-pressing it, and any person can be reported from the ⋯ button in the chat header.
- **Block:** the same ⋯ menu blocks a person. A blocked person can no longer message you and cannot book a session with you; blocking is enforced on our server, in both directions. Blocked people are listed under Profile → Blocked users, where they can be unblocked.
- **Server-side filter:** all user-supplied text is checked against a blocked-term list on the server before it is stored — chat messages, tutor bios, review comments, display names, and the meeting location. The check runs in the database itself, so it applies no matter which part of the app is writing.
- **Pre-moderation:** tutor profiles are approved by our team before anyone can find them. Session ratings are collected but are not shown to other users anywhere in the app.
- Our team reviews reports within 24 hours. We can remove content and suspend or ban accounts, from the in-app admin panel.
- **Terms of Use are accepted during sign-up** — the account cannot be created without it — and state zero tolerance for objectionable content and abusive behavior. They are published at [TERMS URL — no terms document is live yet; see T23].
- Support is at admin@trynoot.com and in the app at Profile → Help & support.

**Payments (Guideline 3.1.3(d)).** noot sells real-time, one-on-one tutoring between two individuals, in person on campus. As Guideline 3.1.3(d) permits, these sessions are paid through Stripe rather than In-App Purchase. noot sells no digital content, subscriptions, or unlockable features, and there is nothing in the app to unlock by paying.

**Ambassadors.** Student ambassadors share a referral code. When someone they referred completes their first paid session, a flat $5 bonus is recorded to their account and is paid out by our team. Bonuses are earned only from a completed, paid tutoring session — never for app downloads, ratings, or reviews, and the app never asks a user to rate it in exchange for anything.

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

## Part B — Condensed version for App Review Information → Notes

```
noot: peer-tutoring marketplace for university students. Students search their exact course, find tutors who already completed it, book 1:1 in-person sessions on campus, pay, and chat. Public consumer app launching at Univ. of Alabama, adding campuses; not affiliated with any university.

SIGN-UP needs a supported campus email; review domain watchmenventures.com is enabled. Terms of Use must be accepted to finish sign-up. All accounts verified; tutor pre-approved.
Student (has upcoming + past session, chat): [email] / [pw]
Tutor: [email] / [pw]
Admin: [email] / [pw]  (Profile > noot Admin)
Deletion test (no upcoming sessions): [email] / [pw]

BOOK: search [COURSE] > [Tutor] > pick a time 24h+ away (max 6 days out) > pay. Price is computed server-side from the tutor's course rate. Card is authorized and captured only after the tutor marks the session complete. Refunds are tiered: >24h full, 2-24h 50%, <2h none. Card/Apple Pay/Google Pay via Stripe's sheet. Payment shown in video at [0:00].
DELETE: Profile > Delete account. Users with upcoming sessions are asked to cancel them first.

UGC (1.2): report a message by long-pressing it, report or block a person from the chat header ⋯ menu; blocked people can't message or book you (enforced server-side, both directions); Profile > Blocked users to unblock. Server-side blocked-term filter on messages, bios, review comments, display names and locations, enforced in the database. Tutors pre-approved; ratings are collected but never shown to users. Reports handled within 24h; suspend/ban from the in-app admin panel. Zero-tolerance Terms accepted at sign-up ([TERMS URL — see T23]). admin@trynoot.com and Profile > Help & support.

PAYMENTS (3.1.3(d)): real-time 1:1 in-person tutoring between individuals, paid via Stripe. No digital goods, subscriptions, or unlockable features. Ambassadors get a flat $5 recorded when a referral completes a first paid session, paid out by our team; never tied to downloads or ratings.

SERVICES: Supabase (auth, DB, storage, functions); Stripe (payments, Connect payouts); [email provider]. No AI, ads, or third-party tracking. No push notifications.
REGION: US only; content limited to supported campuses. REGULATED: no. No university trademarks or logos; the crimson accent is a colour preference only.
```
