# noot — Front-end handoff

**One** clickable iOS app covering the full journey, built to hand off to Claude Code
as the front-end source of truth. Open **`noot App.html`** (modular source); **`noot App (standalone).html`** is a self-contained single-file copy for sharing/offline.

**Brand:** noot · peer tutoring for campus life. Palette — sage `#78A070` (primary), cream/sand `#D0C0A0`, deep charcoal-green `#283028` (ink). Marks: the gecko (primary), the molecule + gecko-foot (secondary), lowercase `noot` wordmark set in Poppins. All brand marks are embedded as data URIs in `app/brand-data.jsx` (`window.BRAND`); originals live in `app/brand/`.

Every flow lives under a single router + theme/Tweaks. A **"Jump to" launcher** (bottom
control bar → opens an in-device menu) lets you start from Landing, **skip sign-up
straight to Student Home**, or jump into any screen — it's a review tool, not part of
the shipped app.

## The journey (one connected app)
```
Landing → Sign Up (magic link) → Email Verified → Role ─┬─ Student → Profile → Home ──┐
                                                         │                            │ tap search / a tutor
                                                         │   B1 Results → B2 Profile → B3 Select → B4 Pay → B5 Confirmed → (Home)
                                                         └─ Tutor → T1 … T10 (verification onboarding)

Tutor sessions:   TB1 New booking → TB2 Session detail        After session: C1 prompt → C2/C3 rate → C4 confirm
Changes:          Student/Tutor cancel · Tutor reschedule → Student request · No-show (both sides)
```
Real forward navigation connects the product (Home search/tutor cards open B1/B2; B5/C4/exception "Done" return Home). The launcher reaches everything else.

## Page names & sitemap
Every screen has a stable **page code** and **name**, defined once in **`app/screens-map.jsx`** (`window.SCREENS`) — the single source of truth that also drives the in-app corner label and the Jump-to launcher. **`noot Sitemap.html`** is the visual navigation diagram (open it in a browser). Page codes match the original product specs (B*, T*, C*, TB*).

| Code | Name | key | File | Goes to (trigger) |
|---|---|---|---|---|
| **O1** | Welcome / Landing | `landing` | screens-shared.jsx | O2 (log in / sign up) |
| **O2** | Sign Up (.edu Email) | `signup` | screens-shared.jsx | O3 (open magic link) |
| **O3** | Email Verified | `verified` | screens-shared.jsx | O4 (let's go) |
| **O4** | Choose Your Role | `role` | screens-shared.jsx | **S1** (student) · **T1** (tutor) |
| **S1** | Student Profile Setup | `student_profile` | screens-student.jsx | S2 Home (complete profile) |
| **S2** | Student Home (For You) | `home` | screens-home.jsx | continue w/ tutor · Sessions · Search · *tabs* |
| **S3** | Search / Browse | `student_home` | screens-student.jsx | B1 (search) · B2 (tap tutor) · *tabs* |
| **B1** | Search Results | `b1` | screens-booking.jsx | B2 (open tutor) |
| **B2** | Tutor Profile | `b2` | screens-booking.jsx | B3 (book a session) |
| **B3** | Select Session | `b3` | screens-booking2.jsx | B4 (continue to payment) |
| **B4** | Payment | `b4` | screens-booking2.jsx | B5 (pay → on success) |
| **B5** | Booking Confirmed | `b5` | screens-booking2.jsx | ↩ S2 (done) |
| **S4** | Saved (now a segment inside Sessions) | `saved` | screens-tabs.jsx | folded into Sessions · *tabs* |
| **S5** | My Sessions (Upcoming/Past/Saved) | `sessions` | screens-tabs.jsx | C1 (rate) · X4 (reschedule) · chat · b3 (book again) · *tabs* |
| **S6** | My Profile | `profile` | screens-tabs.jsx | T1 (become a tutor) · home (switch mode) · ↩ O1 (sign out) · *tabs* |
| **TH** | Tutor Home (Dashboard) | `tutor_home` | screens-home.jsx | TB2 · chat_tutor · P3/P4/P5 quick actions · *tabs* |
| **TC** | Tutor Calendar | `tutor_calendar` | screens-calendar.jsx | TB2 (open session) · toggle availability · *tabs* |
| **TS** | Tutor Sessions | `tutor_sessions` | screens-home.jsx | TB2 (open session) · *tabs* |
| **M1** | Chat (student view) | `chat` | screens-chat.jsx | (thread — Message buttons open it) |
| **M2** | Chat (tutor view) | `chat_tutor` | screens-chat.jsx | (thread — TB2 Message opens it) |
| **T1–T10** | Become a Tutor → … → Application In Review | `t1`–`t10` | screens-tutor.jsx | next step; T2–T8 ↩ O1 (save & exit); T10 ↩ O1 |
| **TB1** | New Booking Alert | `tb1` | screens-tutorside.jsx | TB2 (view detail) |
| **TB2** | Session Detail (Tutor) | `tb2` | screens-tutorside.jsx | X3 (reschedule) · X2 (cancel) |
| **C1** | Session Completion Prompt | `c1` | screens-completion.jsx | C2 (student) · C3 (tutor) |
| **C2** | Student Rates Tutor | `c2` | screens-completion.jsx | C4 (submit) |
| **C3** | Tutor Rates Student | `c3` | screens-completion.jsx | C4 (submit) |
| **C4** | Feedback Confirmation | `c4` | screens-completion.jsx | ↩ S2 (done) |
| **X1** | Cancel Session (Student) | `xsc` | screens-changes.jsx | ↩ S2 (done) |
| **X2** | Cancel Session (Tutor) | `xtc` | screens-changes.jsx | X3 (reschedule instead) · ↩ S2 (cancel & refund) |
| **X3** | Propose Reschedule (Tutor) | `xtr` | screens-changes.jsx | X4 (see student's view) |
| **X4** | Reschedule Request (Student) | `xsr` | screens-changes.jsx | ↩ S2 (accept/decline → done) |
| **X5** | Report No-Show | `xns` | screens-changes.jsx | ↩ S2 (done) |

**Bottom nav is role-aware** (`TabBar` in `kit.jsx`, driven by the `role` prop):
- **Student:** `Home · Search · Sessions · Profile` — Home (`home`) is the For-You study hub (live session countdown + streak/goals); Saved folded into Sessions as a segment.
- **Tutor:** `Home · Calendar · Sessions · Profile` — Home (`tutor_home`) is a lightweight dashboard (next session + payout, weekly earnings/sessions/rating, quick actions); **Calendar** (`tutor_calendar`, TC, `screens-calendar.jsx`) merges booked sessions + tap-to-toggle availability in one weekly view.
- The **noot lizard appears in every tab**: it's the Home mark and lives inside the Search magnifier glyph (`TabGlyph`). Profile → "Become a tutor" (student) / "Switch to student mode" (tutor) is the mode switch — one account holds both roles.

## Files
| File | Role |
|---|---|
| `noot App.html` | **The app.** Loads React 18 + Babel, fonts, then every module below, then `tc-app.jsx`. |
| `app/brand-data.jsx` | noot brand marks (gecko / molecule / foot / app-icon) embedded as data URIs → `window.BRAND`. |
| `app/tc-app.jsx` | **Unified router** — nav stack, device stage/scaling, the Jump-to launcher, Tweaks, `U_REG` (key→component map). |
| `app/screens-map.jsx` | **Page registry** — `window.SCREENS`: every screen's code, name, flow, file, and navigation edges. Source of truth for names + the sitemap. |
| `app/theme.jsx` | **Design tokens.** `THEMES` (3 directions × light/dark: Sage / Sand / Forest) → `themeStyle(dir, dark)` emits CSS custom properties. The styling contract — every component reads `var(--token)`, never a raw hex. |
| `app/kit.jsx` | Hi-fi iOS component kit (`Btn`, `Card`, `Field`, `Chip`, `Badge`, `Avatar`, `Toggle`, `ProgressDots`, `NavTop`, `Body`, `ActionBar`, `TabBar`, `Ic`, `Gecko`/`Wordmark`/`LogoMark`, type styles…). |
| `app/screens-shared.jsx` | `Landing`, `SignUp`, `Verified`, `Role`. |
| `app/screens-student.jsx` | `StudentProfile`, `StudentHome` (Search/Browse tab — college-filtered), `TutorRow`. |
| `app/screens-home.jsx` | `StudentHomeFeed` (For-You hub + countdown/streak + exam-radar nudge → B3), `TutorHome` (dashboard), `TutorSessions`. |
| `app/screens-calendar.jsx` | `TutorCalendar` — TC weekly calendar: booked sessions + tap-to-toggle open/closed times, week switch, copy-to-next-week stub. |
| `app/screens-tabs.jsx` | Bottom-tab destinations: `SavedTab`, `SessionsTab` (Upcoming/Past live from `NootStore`, Message + Book again), `ProfileTab`. |
| `app/chat-store.jsx` | `NootStore` — persisted chat threads (per tutor id) + Upcoming/Past sessions; `useNootStore()` hook. |
| `app/screens-chat.jsx` | `Chat` (M1 student) / `ChatTutor` (M2 tutor) — full thread, text + image/file attachments. |
| `app/screens-tutor.jsx` | `T1`–`T10` + the shared `StepHead`. |
| `app/booking-data.jsx` | Demo data — tutors, 14-day availability, reviews. Swap for API data. |
| `app/screens-booking.jsx` | `B1` Search results (+ live filter sheet/sort), `B2` Tutor profile, plus `BottomSheet`/`Section` helpers. |
| `app/screens-booking2.jsx` | `B3` Select session, `B4` Payment (Stripe), `B5` Handshake confirmation. |
| `app/screens-tutorside.jsx` | `TB1` New booking, `TB2` Session detail, `sessionFacts`. |
| `app/screens-completion.jsx` | `C1`–`C4` double-blind ratings, `StarRating`. |
| `app/screens-changes.jsx` | Cancel / reschedule / no-show screens. |
| `app/screens-edit.jsx` | **P1–P4 profile editing** — `EditPersonal` (both roles), `EditCourses` (student), `EditTutorProfile` + `EditRates` (tutor). Settings-style editors with Save → back; onboarding screens (S1, T2–T5) are first-run only and no longer reachable from Profile/Home. |
| `app/ios-frame.jsx` | iPhone bezel / status bar / dynamic island (starter). |
| `app/tweaks-panel.jsx` | Tweaks shell (starter). |

> Earlier `TutorConnect Prototype.html` / `TutorConnect Booking.html` (and the UA-crimson `TutorConnect` branding) were merged into this single app and rebranded to noot.

## Interactivity contract (full button/input audit — complete)
Every screen was walked and every control verified. When wiring the real app in Claude Code, honor these patterns:
- **Every `<Btn>` is wired** — either navigates via `go('key')` / `back()` or performs a real state change (select, toggle, submit).
- **All text inputs are real & editable** — the `Field` component (`kit.jsx`) renders a live `<input>`/`<textarea>` (email, password, search, bio, course, card, review, chat composer…). It holds its own state and takes an optional `onChange(value)`.
- **Backend-dependent actions use `showToast(msg)`** (`kit.jsx`) as a visible stub — e.g. "Added to your calendar", Profile rows (Personal info, Payment methods, Notifications, Help), Settings/Notifications icons, referral banner, Change photo, Edit course. Replace each `showToast(...)` with the real call when the backend exists; grep `showToast` for the full list of stubbed endpoints.
- **Dark mode + visual direction** are Tweaks (`tw.dark`, `tw.direction`); the Profile → Preferences "Dark mode" toggle also drives `tw.dark`.


## Booking loop (B1–B5)
```
B1 Search results → B2 Tutor profile → B3 Select course/time/location → B4 Payment → B5 "Deal locked in" handshake
```
- **Auto-confirm model**: student picks an available block, pays into held payment, booking confirms instantly (no tutor approval). Availability comes from the tutor's T5 calendar.
- **B1 filters are live**: max-price / availability / gender re-filter and re-sort; the Filters button shows an active-count badge. No public star ratings anywhere student-facing — **sessions completed** is the credibility signal (ratings live in the backend loop).
- **B5** is the brand moment — animated handshake + pulse rings, session recap, Message / Add-to-calendar, "Payment held — released after your session" + 24h/1h reminder.
- **B3 requires a Session focus tag** (General · Finish HW · Exam Study · Resume · Advising) **and an intro message** before continuing. Picking a focus auto-drafts the message from a template (`focusMessage(tag, course)` in `screens-booking2.jsx`) that the student can edit; the tag + message ride on `booking.tag` / `booking.message` and surface to the tutor on **TB2** ("From {student}" card).
- **B3 Repeats** — Just once / Weekly segmented control; `booking.repeat` rides to B4 (summary row + "Total · per session" + first-session-only note) and B5 (recap row). Backend: create a recurring booking series, charge per occurrence.
- B4/B5 fall back to sane defaults if reached directly via the launcher (never show `undefined`).

### Navigation model
- `go(key)` pushes onto a stack; `back()` pops. **Bottom-tab destinations (`tabs:true`) are roots** — navigating to one resets the stack, so tab switches don't accumulate history and **onboarding is locked** after completion (S1→home and T10→tutor_home land on a fresh root; you can't swipe back into sign-up/application). Dead-end screens jumped to via the launcher (chat M1/M2) are seeded with a parent so their back button works.

### Messaging & repeat bookings
- **Every "Message" button is wired** (Sessions Upcoming + Past, B5 confirmation, TB2 tutor side) → opens the **Chat** thread for that tutor. Threads are per-tutor, seeded with history, and **persist** (`NootStore`, localStorage) — so a student always sees their full past conversation.
- **Composer supports attachments** — paperclip opens a real file picker (images + docs); images preview inline, other files show as a file chip; staged attachments can be removed before sending.
- The student's **B3 intro message is dropped into the thread** on booking confirmation (B5), so the conversation starts with what they wrote.
- **Past sessions have "Book again"** → re-enters B3 prefilled with that tutor/course; completing the booking adds it back to **Upcoming** (via `NootStore.addUpcoming`), and the chat history carries over.
- Tutor-side chat (`chat_tutor`) renders the same thread from the tutor's perspective (bubbles flipped, student shown as the other party).

### Tutor side (TB1–TB2)
The other half of the handshake — what the tutor sees after a student books (`app/screens-tutorside.jsx`).
- **TB1 New booking** — push-style "New session booked" + the same handshake moment the student saw on B5, student recap card with payout, CTA into the detail view. No Accept/Decline (auto-confirm model — tutor is committed unless they cancel/reschedule).
- **TB2 Session detail** — student, session facts, **earnings preview** (rate × duration), Message / Add-to-calendar, a quiet "Need to reschedule or cancel?" link (opens a sheet: propose new time / cancel), and the 24h + 1h reminder note (location or video link rides the 1-hour reminder).

### Session completion (C1–C4) — double-blind ratings
Auto-fires ~1h after session end (`app/screens-completion.jsx`).
- **C1 Completion prompt** — "How did your session go?" with the session recap. Routes by who you are → C2 (student) or C3 (tutor). In the demo both routes are shown as tappable cards; in production you only see your own side.
- **C2 Student rates tutor** — 1–5 stars, optional public review (500 char), and "Did this session happen as expected?" Yes confirms · **No opens a dispute** (pauses payout).
- **C3 Tutor rates student** — same controls, but the written note is **private** (other tutors + admin only, never shown to students).
- **C4 Confirmation** (role-dependent): student → "your rating is visible once the other party also rates"; tutor → "payment of $X released to Stripe within 2 business days" + payout card.
- **Double-blind**: ratings stay hidden until both submit (prevents retaliation). If neither side responds within 24h, the system auto-completes and releases payment. These are backend rules — the screens surface the copy; wire the timers/visibility server-side.

### Changes & exceptions (cancel / reschedule / no-show)
`app/screens-changes.jsx`. Tutor's TB2 "Need to reschedule or cancel?" sheet routes into the tutor ones.
- **Student cancel** — refund tier by time-to-session (demo selector): `>24h` 100% refund · `2–24h` 50% (tutor paid 50% for the held slot) · `<2h`/no-show 0% (tutor paid 100%). Math is live off the session price.
- **Tutor cancel** — student always 100% refunded, tutor $0; warns it counts toward the cancellation rate (flagged for admin at **>2 / 30 days**) and nudges toward rescheduling.
- **Tutor reschedule** — propose a new day/time (B3-style picker) → "request sent"; payment unchanged.
- **Reschedule request (student)** — old→new time, same price, Accept (session moves, reminders update) / Decline (tutor honors original or cancels). Notes the **3-reschedule** auto-refund + credit rule.
- **No-show** — persona toggle: student marks "Tutor didn't show" (15-min threshold → full refund, hits tutor rate); tutor marks "Student didn't show" (within 1h → auto-payout) with the **3-strike escalation** (warn → 30-day pre-pay → suspension).
- All timers, rate-tracking, strike counts, and dispute routing are backend rules — these screens surface the states and copy.

### B4 maps to Stripe Connect
- Single **Payment Element**: wallet buttons on top (Apple Pay / Google Pay) → wallet sheet; "Or pay with card" accordion below. Wire to Stripe's Payment Element / Express Checkout Element.
- Price breakdown shows **Service fee: Free ($0.00)** as its own line above Total → Stripe `application_fee_amount` (toggle on later).
- **Held-payment** trust line (no "escrow" wording) — funds released to the tutor on session completion (manual capture / separate transfer on the connected account).
- Cancellation policy is a one-line summary with **View policy** expand; the tiers drive Stripe refund timing.
- Primary CTA `Confirm & pay $XX` = confirm PaymentIntent. States implemented: **wallet sheet**, **processing**, **declined w/ retry** (test cards `•••• 4242` approves / `•••• 0002` declines). Success routes to B5.

## Theming
Switches live in the **Tweaks** panel (toolbar), persisted in the `EDITMODE` block of `app/tc-app.jsx`:
- **Visual direction** — `sage` (Sage — calm/natural, the noot default), `sand` (warm, cream-forward), `forest` (deep charcoal-green, high-contrast). Each changes accent shade, neutral warmth, heading font, and corner radii via tokens only. Defined in `THEMES` (`theme.jsx`); the default is `sage` (`U_TWEAKS.direction` in `tc-app.jsx`).
- **Dark mode** — light/dark ramp per direction.
- **Handshake animation** on/off and **Default session length**.

To add a 4th direction: add an entry to `THEMES` with `light`/`dark` token sets + `headingFont`/radii, and a swatch in `DirectionPicker`'s `SW` map (`tc-app.jsx`). No screen code changes.

## Notes for the build
- Every screen is a function component `({ go, back, booking, setBooking, role, setRole, handshake }) => JSX`. `go('key')` pushes, `back()` pops; keys are in `U_REG` (`tc-app.jsx`).
- All data is hard-coded demo content (Lindsay Thomas, Sara W., MGT 300, etc.) — `booking-data.jsx` is the swap point for real API data.
- Interactive bits already stubbed: B1 filters, B3 availability picker, B4 Stripe states (test cards), C2/C3 star + review, the refund-tier and no-show math.
- The **Jump-to launcher** and the bottom Back/Restart bar are review-only — strip them (and the `EDITMODE` tweak block) for production; keep `tc-app.jsx`'s nav stack.
- Inset constants `TOP_INSET` (status bar/island) and `BOT_INSET` (home indicator) in `kit.jsx`.
- Brand accent is sage `#78A070` (press `#5F8758`, weak `#E8EFE3`); ink is deep charcoal-green `#283028`; cream/sand `#D0C0A0`. The design deliberately avoids UA crimson and the script-A. Exact per-direction ramps live in `THEMES` (`theme.jsx`).
