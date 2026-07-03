# Handoff: noot — peer tutoring app (full iOS journey)

## Overview
**noot** is a peer-to-peer tutoring marketplace for a university campus (launching at the University of Alabama, Fall 2026). Students find, book, pay for, message, and rate campus tutors; tutors apply, get grade-verified, set availability + rates, manage a calendar, and get paid. This bundle is the complete **front-end design source of truth** — every screen in the journey, wired with real forward navigation.

The design is intentionally **campus-native**: real course codes (MGT 300, CH 101), campus locations (Gorgas Library), exam-aware nudges, and a distinct sage/cream brand ("noot", gecko mark) that deliberately avoids UA trademarks (no crimson, no script-A).

## About the design files
The files in this bundle are **design references built in HTML/React (via in-browser Babel)** — a high-fidelity, clickable prototype showing intended look, copy, and behavior. **They are not production code to ship directly.** The in-browser Babel transform, CDN React, single-file `<script type="text/babel">` loading, and the "Jump to" review launcher are all prototyping conveniences, not production patterns.

Your task: **recreate these designs in the target codebase's environment** using its established patterns. If the target is a native iOS app, build in **SwiftUI/UIKit**. If it's React Native / Expo, use that. If no codebase exists yet, **SwiftUI is the recommended choice** for this product (it's a native iOS app), or React Native/Expo if cross-platform is required. Port the visual system and interaction model faithfully; re-implement state/navigation idiomatically for the chosen stack.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, copy, and interactions are all decided. Recreate the UI pixel-accurately. Design tokens, exact hex values, and per-screen detail live in **`HANDOFF.md`** (the authoritative spec, bundled here) and are enumerated below.

## The journey
```
Landing → Sign Up (.edu magic link) → Email Verified → Choose Role
   ├─ Student → Profile Setup → Home (For You)
   │     search / tap tutor → B1 Results → B2 Tutor Profile → B3 Select → B4 Pay → B5 Confirmed → Home
   └─ Tutor → T1 … T10 (application + grade verification) → Tutor Dashboard

Tutor sessions:  TB1 New booking alert → TB2 Session detail
After session:   C1 prompt → C2/C3 rate → C4 confirm
Exceptions:      Student/Tutor cancel · Tutor reschedule → Student request · No-show
Messaging:       M1/M2 chat threads (per-tutor, persisted)
Profile editing: P1–P5 dedicated editor screens (NOT onboarding)
```

`app/screens-map.jsx` (`window.SCREENS`) is the **single source of truth** for every screen's code, name, file, and outbound navigation. `noot Sitemap.html` is the visual diagram — open it in a browser first to see the whole flow.

## Screens / Views
Full per-screen layout, component, and copy detail is in **`HANDOFF.md`** and readable directly in the `app/*.jsx` source. Summary by flow:

- **Onboarding (O1–O4):** Landing, Sign-up (.edu email → magic link), Email Verified, Choose Role. `screens-shared.jsx`.
- **Student (S1–S6):** Profile Setup, Home "For You" hub (live next-session countdown, exam-radar nudge, streak/goal momentum, continue-where-you-left-off), Search/Browse, Sessions (Upcoming/Past/Saved segments), Profile. `screens-student.jsx`, `screens-home.jsx`, `screens-tabs.jsx`.
- **Booking (B1–B5):** Search Results, Tutor Profile, Select Session (course, day/slot, length, focus tag, intro message, **repeat: once/weekly**), Payment, Confirmed (animated handshake, recap, reminders). `screens-booking.jsx`, `screens-booking2.jsx`.
- **Messaging (M1/M2):** Full chat thread, student + tutor perspectives, text + image/file attachments, per-tutor persistence. `screens-chat.jsx`, `chat-store.jsx`.
- **Tutor setup (T1–T10):** Become a tutor → profile → courses → rates → availability → grade verification → agreement → Stripe payout → review → in-review. `screens-tutor.jsx`.
- **Tutor home (TH, TC, TS, TP):** Dashboard (next session, weekly earnings/sessions/rating, quick actions), **Calendar (weekly agenda + tap-to-toggle availability)**, Sessions, Profile. `screens-home.jsx`, `screens-calendar.jsx`, `screens-tabs.jsx`.
- **Profile editing (P1–P5):** Personal info, My courses (student), Edit tutor profile, Courses & rates, Set availability. Dedicated settings-style editors — **NOT the onboarding steps**. `screens-edit.jsx`.
- **Tutor incoming (TB1/TB2):** New booking alert, session detail. `screens-tutorside.jsx`.
- **Completion (C1–C4):** Completion prompt, student rates tutor, tutor rates student, confirmation. `screens-completion.jsx`.
- **Exceptions (X1–X5):** Cancel (student/tutor), reschedule (propose/request), no-show. `screens-changes.jsx`.

## Interactions & behavior
- **Navigation model:** stack-based `go(key)` / `back()`. **Bottom-tab destinations are roots** — navigating to one resets the stack. This means tab switches don't accumulate history AND **onboarding is locked after completion** (after S1→Home or T10→Dashboard you cannot go back into sign-up / the application). Re-implement as: completing onboarding replaces the nav root; tabs are independent roots.
- **Tab bars (role-aware):** Student = Home · Search · Sessions · Profile. Tutor = Home · Calendar · Sessions · Profile.
- **Booking flow** carries a `booking` object (course, tutor, day, slot, length, location, focus tag, intro message, repeat). Weekly repeat rides through payment (charged per session) and confirmation.
- **Chat** threads persist per-tutor; the student's B3 intro message is dropped into the thread on booking confirmation; "Book again" from a past session re-enters B3 prefilled.
- **Calendar** (tutor): weekly view, day strip with booked/open indicators, tap an empty time to open/close it for booking; booked sessions tap through to TB2.
- **Animations:** screen push/pop slide transitions (~380ms), B5 handshake + pulse rings, live countdown timers. Reduced-motion should degrade gracefully.
- **Toasts** confirm stubbed saves (e.g. "Availability saved").

## State management
Per-screen React state today; a store abstraction (`NootStore` in `chat-store.jsx`) backs chat threads + upcoming sessions via localStorage. For production, model: current user + role, nav stack per tab, booking-in-progress, tutor availability template + calendar overrides, chat threads, sessions (upcoming/past). Replace localStorage with the app's real data layer / API.

## Design tokens
Authoritative values in `HANDOFF.md`; brand summary:
- **Colors:** sage `#78A070` (primary/accent), cream/sand `#D0C0A0`, deep charcoal-green `#283028` (ink). Plus themed CSS variables (`--bg`, `--surface`, `--text`, `--text-2/3`, `--border`, `--accent-weak`, `--good`, etc.) defined in `theme.jsx` for three visual directions (sage/sand/forest) and dark mode. Use the sage light theme as the default.
- **Typography:** headings in **Poppins**; body in the system UI stack. Type scale + weights per component in `kit.jsx`.
- **Radii/shadows/spacing:** CSS variables (`--card-radius`, `--btn-radius`, `--field-radius`, `--shadow`, `--shadow-sm`) in `theme.jsx`.
- **Device frame:** designed at 402×874 (iPhone logical points). Icons are inline SVG in `kit.jsx` (`ICONS`).

## Assets
Brand marks (gecko, molecule + foot, `noot` wordmark) exist in two forms: **small optimized copies** embedded as data URIs in `app/brand-data.jsx` (`window.BRAND`, ~2–9 KB each) that the prototype renders from, and the **high-res source PNGs** in `app/brand/` (~400 KB each). These are the same marks at different resolutions, not redundant duplicates — use `app/brand/` originals for the real build (app icon, launch assets), and `window.BRAND` for in-app inline marks. No third-party imagery — user avatars are placeholder initials by design. Poppins loads from Google Fonts in the HTML `<head>`.

## Before you build
The "fill-in" data throughout the prototype — tutor counts (e.g. "512 active tutors · 28 departments"), per-course tutor tallies, student streaks, session history, earnings figures — is **mocked for demo purposes**. Wire these to your real backend and design proper **empty/zero states** (a brand-new user has no streak, no sessions, no upcoming bookings) rather than porting the demo numbers. First impressions at launch are all empty states — treat them as first-class.

## Files
- **`HANDOFF.md`** — the full authoritative spec (per-screen detail, tokens, behavior notes). Read this first.
- **`noot Sitemap.html`** — visual navigation diagram. Open in a browser.
- **`noot App.html`** — modular prototype entry (loads `app/*.jsx`). Open in a browser to click through.
- **`noot App (standalone).html`** — self-contained single-file copy for offline viewing/sharing. This is a **packaged build artifact** (bundled/minified, not human-readable) — view it in a browser, but treat `noot App.html` + `app/*.jsx` as the editable source of truth.
- **`app/`** — all source: `screens-map.jsx` (nav contract), `theme.jsx` (tokens), `kit.jsx` (component + icon library), `brand-data.jsx`, `chat-store.jsx`, `booking-data.jsx`, and one `screens-*.jsx` per flow. `tc-app.jsx` is the router; `ios-frame.jsx` + `tweaks-panel.jsx` are prototype-only chrome (do not port).

### Do not port (prototype-only)
`ios-frame.jsx` (device bezel), `tweaks-panel.jsx` + the Tweaks panel, the "Jump to" launcher and corner label in `tc-app.jsx`, the in-browser Babel/CDN script loading, and localStorage persistence keyed `tc_unified_nav_v1`. These exist to make the prototype reviewable.
