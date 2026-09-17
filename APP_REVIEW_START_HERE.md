# App Review round 2 — START HERE

**Claude: read this whole file before doing any App Review work.** It sits alongside `CLAUDE.md`, and
the rules here are added on top of it. Everything in `CLAUDE.md` still applies, including the golden
rule, the `@noot/core` boundary, `check:preview`, and committing only when asked.

## The App Review files (all at the repo root)

| File | What it is |
|---|---|
| `APP_REVIEW_START_HERE.md` | This file: context, rules, Apple's message, and how to verify work |
| `APP_REVIEW_TICKETS.md` | The work list, with acceptance criteria and the device test script |
| `APP_REVIEW_REPLY_DRAFT.md` | Jadin's draft reply to Apple. Every claim in it must be true in code before it's sent. |
| `APP_REVIEW_AUDITOR.md` | Instructions for the adversarial review subagent |

Related existing docs: `ASC_SUBMISSION_CHECKLIST.md`, `HANDOFF_2026-08-11.md`, `PICKUP_HERE.md`,
`TEAM_UPDATE_2026-08-23.md`.

## Current priority

Apple returned **Guideline 2.1 Information Needed** on the first submission (new-developer
review). Only work on tickets from `APP_REVIEW_TICKETS.md`. Don't pick up unrelated `TODO(api)`s
during this push.

## Before touching any data: which database?

The docs disagree. `CLAUDE.md` says `apps/mobile/.env` points at the local stack, while
`HANDOFF_2026-08-11.md` §1/§6 says it points at **production**. Don't trust either one. Read
`EXPO_PUBLIC_SUPABASE_URL` in `apps/mobile/.env` yourself and state which stack it targets before
running anything that writes. (`nepnxbvseuzuayhxaigo` is production.)

## Stale-doc warning

`ARCHITECTURE.md` is labelled authoritative, but two of its rows were superseded later:
- **Platform fee:** ARCHITECTURE §8 says "Free ($0.00) at launch". The shipped decision is **17.5%**
  (`confirm-booking`, verified $28 → $4.90 / $23.10).
- **Refunds:** ARCHITECTURE §4/§8 say "binary 24h". The shipped code is **tiered**
  (`bookings.refund_percent`, `cancel-booking`).

Never change code to match those two rows. If a doc and deployed behaviour disagree, stop and ask
Jadin.

## Invariants

**Money**
- The server computes every price, from `tutor_courses.hourly_rate × duration`. Never trust a
  client amount. Today `create-payment-intent` does — that's ticket T5.
- Manual-capture holds are only valid for a limited window (typically about 7 days for cards).
  Nothing may depend on capturing beyond that window (T6).
- Stripe IDs are mode-specific. Test-mode `cus_…` and `acct_…` IDs are invalid under live keys (T10).

**Trust & safety (Guideline 1.2)**
- Every chat message and every user can be reported (`content_reports`).
- `is_blocked_between()` is enforced on the server wherever two users meet. Messaging already does
  this. Search (`api.tutors.search`) and booking are the remaining gaps (T3).
- Message text passes a server-side filter before insert (T4).

**Accounts (Guideline 5.1.1(v))**
- Profile → Delete account completes in-app. It revokes the identity, de-identifies the user row,
  and keeps financial rows (migration 0026).
- A user with `deleted_at` set never appears to anyone and can't be booked, even by direct id.

## Verification loop (on top of the golden rule)

1. Every server-side ticket gets a `scripts/verify_<ticket>.mts` in the style of the existing suites,
   with both an allow case and a deny case. Run it against the **local** stack
   (`supabase start` + `node supabase/seed_demo.mjs`) and paste the output.
2. Run `pnpm -r typecheck`, `pnpm check:release`, and `pnpm check:preview`.
3. **Deploy any Edge Function you touched** and confirm the deployed version bumped.
   `check:preview` says nothing about functions (lesson from 2026-08-20).
4. Run the audit in `APP_REVIEW_AUDITOR.md` on the ticket before calling it done.
5. If something can't be verified without a device, say so, and add it to the device test script
   in `APP_REVIEW_TICKETS.md`. Never claim device behaviour you didn't see.
6. Update the ticket's checkboxes in `APP_REVIEW_TICKETS.md`.

## Hard rules for this push

- No migrations or data writes to production from a Claude session. Push migrations only when
  Jadin asks.
- Never run `seed_demo.mjs` or `seed_cloud.mjs` with a cloud `SUPABASE_URL` unless Jadin asks in
  that same message.
- **Never write real reviewer credentials into any file in the repo.** Passwords go only into
  App Store Connect. The brackets in `APP_REVIEW_REPLY_DRAFT.md` stay brackets.
- Commit only when asked (unchanged).

---

## Apple's message (verbatim)

> Guideline 2.1 - Information Needed - New App Submission
>
> This app has been submitted by a developer account that has a limited App Review history. We need additional information to better understand the app and complete the review.
>
> Note: Before submitting, run the submitted build through your own testing and quality assurance process on supported physical devices. App Review is intended for apps and metadata that are complete and ready for App Store customers.
>
> If the app is ready for review, follow the directions below.
>
> Next Steps
>
> Reply in App Store Connect with all of the following information and also add this information to the Notes field of the App Review Information section in App Store Connect, for reference on future submissions:
>
> 1. A screen recording captured on a physical device, running the latest operating system, demonstrating the app's functionality. The recording must begin with launching the app and show the typical user flow. If the app has any of the following, include them in the recording:
>    - Account registration, login, and account deletion flows. Account deletion is required in apps that support account creation.
>    - Any user-generated content, including the required content reporting and blocking mechanisms.
>    - Accessing paid content or features within the app.
> 2. A description of the app's purpose and target audience, including the problem it solves and the value it provides
> 3. Instructions for setting up and accessing the app's main features, including any required login credentials or sample files
> 4. A list of the external services, tools, or platforms the app uses to deliver its core functionality (for example, data providers, authentication services, payment processors, or AI services)
> 5. Describe any regional differences in the app's features or content, or confirm that the app functions consistently across all regions
> 6. If the app operates in a highly regulated industry or includes protected third-party material, provide any relevant documentation or credentials to demonstrate you are authorized to provide these services or protected material
>
> Prevent Common Issues
> - Guideline 2.1 - Bugs and crashes: Apps are reviewed on physical devices to mirror real-world conditions. Test the app on each supported device platform before submitting. Use TestFlight to distribute builds for beta testing on real devices.
> - Guideline 2.1 - Accessing the app: If the app includes account-based features, provide up-to-date login credentials for a demo account in App Store Connect. If the app has multiple account types, provide credentials for each type in the Notes field.
> - Guideline 2.3.3 - Screenshots: App screenshots on the App Store must show the actual app in use, and not merely the title art, login page, or splash screen.
> - Guideline 3.1.1 - In-App Purchase: In-App Purchase products should be configured and submitted alongside the app.
> - Guideline 3.2 - Other Business Models: If your app is intended to be used by specific businesses, organizations or employees then use one of the other distribution options available to you through the Apple Developer Program Account.
