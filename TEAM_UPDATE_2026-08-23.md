# Noot — team update, Sunday 23 August 2026

**Short version:** the app is feature-complete for a first release and every backend path is
verified. It has **never been built for iOS** and **never been used on a phone**. That's the
whole remaining risk, and clearing it needs the team, not more code.

---

## Where we are

| | |
|---|---|
| Mobile screens | 65 (49 read live data through `@noot/core`) |
| DB migrations | 24, all applied to production |
| Edge Functions | 18, all deployed |
| Automated checks | 7 suites, **all passing** |
| App Store readiness | no blockers in config; 1 warning (Stripe test keys) |
| iOS builds ever produced | **0** |
| Hours the app has been used on a real phone | **~0** |

## What's built and verified

Everything below is backed by an automated suite that runs against a live database:

- **Auth** — `.edu`-gated signup, email + password sign-in, Face ID unlock, password reset
- **Find & book** — tutor search over the real **3,927-course UA catalog**, availability,
  booking, cancel/reschedule, refund tiers
- **Payments** — Stripe PaymentSheet, 17.5% platform fee, Connect payouts, refunds
  *(currently in test mode — see blockers)*
- **Chat** — 1:1 student↔tutor, **image and file attachments**, live delivery, private storage
- **Tutor lifecycle** — apply → in review → approved/rejected, with hour-by-hour availability
- **Roles** — student / tutor / ambassador, switchable, with preview mode before you've joined
- **Admin panel** — tutor approvals, user management, booking oversight, review moderation,
  and a **private admin team chat**
- **Account deletion** — required by Apple; deletes the identity, keeps anonymised financials
- **Crimson theme** — full crimson-and-graphite alternative to the default

**Verification (all green as of today):** backend 14/14 · tutor lifecycle 18/18 ·
account deletion 10/10 · course catalog 20/20 · admin chat 21/21 · chat attachments 13/13 ·
live chat delivery ✅

## The gap

Those suites test the **data layer**. They drive the real database and prove the logic and the
security rules are right. They cannot tap a button.

Nothing in the app has been used through its actual interface. The features never touched by a
human include chat attachments, the admin chat, hourly availability, the course pickers,
account deletion, and profile photos. Automated tests don't catch a mis-sized button, a
keyboard covering an input, or a spinner that never stops.

## What's blocking App Store submission

1. **No iOS build yet.** Everything needed to make one is in place — Apple enrollment, the App
   Store Connect record, signing credentials, deployed functions. It just hasn't been run.
2. **`noot.app` isn't live.** The privacy policy has to be publicly reachable before Apple
   accepts a submission, and reviewers open the link directly. The pages are written and build
   clean; the domain doesn't resolve.
3. **Email isn't configured (SMTP).** Without it, `.edu` signup and password reset send nothing.
   A reviewer literally could not create an account, so we must also hand Apple a demo login.
4. **Stripe is in test mode.** A reviewer's real card would be declined, which reads as a broken
   app. Needs live keys before public launch.
5. **Store listing** — screenshots, description, age rating, privacy labels. None of it exists.

## What we need from the team

**Test the app on your iPhone.** This is the single highest-value thing anyone can do right now.

You do **not** need a MacBook. You need an **iPhone**. (A Mac is irrelevant — builds happen in
the cloud, and the app won't appear in TestFlight on a Mac.)

**Right now, via Expo Go** — install *Expo Go* from the App Store, then scan the QR / open the
link Jadin shares. This covers everything except payments.

Please try, and report anything that looks wrong:

1. Send a **photo** and a **file** in a chat — both directions
2. Change your **profile picture**
3. As a tutor, set availability for **one single hour**, then book that exact hour as a student
4. Search for a class by **name** ("calculus"), not just its code
5. Switch between **Student / Tutor / Ambassador** modes; check Home keeps you in the mode you're in
6. Admins: Profile → Noot Admin → **Admin team chat**
7. **Delete account** — ⚠️ on a throwaway account only. It is real and permanent.

**Heads-up: Expo Go talks to the live production database.** What you create, other people see.
Don't delete anything you care about.

**Payments** can't be tested in Expo Go — that needs the TestFlight build, coming next.

## Known gaps (deliberate, not bugs)

- **Push notifications** aren't sent to devices yet; there's an in-app notification centre
- Per-slot toggles on the tutor Calendar tab don't save yet (the weekly template does)
- "Add to my calendar" doesn't touch your device calendar
- Un-save a tutor from the Sessions tab isn't wired
- 20 smaller `TODO(api)` items tracked in the repo

## Next up

1. First **iOS build** → TestFlight
2. Everyone tests on their iPhone
3. `noot.app` deployed, SMTP configured
4. Store listing + screenshots
5. Live Stripe keys → **submit**
