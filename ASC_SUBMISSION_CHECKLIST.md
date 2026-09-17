# App Store Connect — submission checklist

Everything you fill in on the ASC website, in the order the site presents it. Values derived
from the actual app where possible so you're not guessing.

App: **noot** · bundle `com.watchmenventures.noot` · ascAppId **6803306711** · version **1.0.0**

---

## ⚠️ Blocker to settle first — report & block

The app has **no way to report a message or block a user**. Guideline **1.2** requires both for
user-generated content, and noot has two kinds: chat messages and tutor reviews.

`/terms` currently claims both exist ("you can report a message or a user from within the app,
and you can block a user"). That text is wrong today — it must either become true, or come out
of the Terms before a reviewer reads it. Leaving a false claim in published terms is worse than
not having the feature.

**Minimum to satisfy 1.2:** a "Report" action on a chat message and on a user, a "Block" action
that stops that user contacting you, and a visible contact route for complaints
(the in-app Help & support screen and the auth-email footers both point at `admin@trynoot.com`).

---

## 1. App Information

| Field | Value |
|---|---|
| Name | max **30 chars**. "noot" alone may be taken — have a fallback like "noot — Campus Tutoring" |
| Subtitle | max **30 chars**, e.g. "Peer tutoring at your school" |
| Primary category | **Education** |
| Secondary category | optional — Social Networking is the honest second |
| Content rights | contains no third-party content → **No** |
| License agreement | Apple's **standard EULA** is fine; `/terms` is linked in-app |

## 2. Age rating questionnaire

Answers that match what the app actually does:

- Violence, sexual content, profanity, alcohol/drugs/tobacco, horror, gambling, contests → **None / No**
- Medical or treatment information → **No**
- Unrestricted web access → **No**. The app only opens two fixed URLs (`/privacy`, `/terms`)
  via `expo-web-browser`; that is not a browser.
- **User-generated content → Yes.** Chat and reviews. Expect this to push the rating to **12+**,
  and expect Apple to look for the report/block controls above.

## 3. Pricing and Availability

- Price: **Free**
- Availability: **United States only** for launch. noot is gated to campus `.edu` emails and
  seeded with one university — shipping worldwide invites installs that can't sign up.

## 4. App Privacy

- **Privacy Policy URL: `https://trynoot.com/privacy`** — live and public as of 2026-09-17, and
  also serves as the Terms document (there is no `/terms` page). Reviewers open
  it directly; a 404 stalls review.
- **Data used to track you: No.** No ad SDKs, no third-party analytics, no IDFA — so no App
  Tracking Transparency prompt is needed.

| Type | Data | Linked to user | Purpose |
|---|---|---|---|
| Contact Info | Name, Email address | Yes | App Functionality |
| User Content | Photos or Videos, Other User Content (messages, transcript) | Yes | App Functionality |
| Identifiers | User ID | Yes | App Functionality |
| Purchases | Purchase History | Yes | App Functionality |

Apple cross-checks this against the policy text, so keep the two in step if either changes.

## 5. Version 1.0 page

- **Screenshots** — **6.9" or 6.7" iPhone required** (e.g. 1290×2796). Up to 10. No iPad needed
  (`supportsTablet: false`). Take them on a real device, not the simulator, so the content is real.
- **Promotional text** (170 chars) — editable later *without* review; put anything time-sensitive here
- **Description** (4000 chars)
- **Keywords** (100 chars total, comma-separated) — e.g.
  `tutor,tutoring,study,campus,college,homework,exam,peer,alabama,student`
- **Support URL** — required. `https://trynoot.com` will do (live, returns 200)
- Marketing URL — optional
- **Copyright** — e.g. `2026 Watchmen Ventures LLC`
- **Build** — select the iOS build (currently expecting build 3)

## 6. App Review Information — the part that gets apps rejected

- **Sign-in required: Yes**, and you must supply working demo credentials.
  **Without SMTP configured a reviewer cannot sign up at all** — `.edu` signup needs a magic
  link and the dev bypass was removed. No demo account = guaranteed rejection.
- The demo account **must be a campus-gated address** (e.g. `…@crimson.ua.edu`) or it will fail
  the signup gate. Create a **dedicated reviewer account with a strong password** — do not use a
  seeded demo account whose password is written down in the repo.
- **Give it real data**: at least one upcoming booking, one past booking, and a chat thread with
  messages and an attachment. An empty app looks broken and invites "unable to review".
- **Notes** — pre-empt the reviewer's questions:
  > noot is a peer-tutoring marketplace for university students. Accounts require a campus
  > `.edu` email; use the demo credentials above. Tutors are verified manually by our team, so
  > the demo tutor account is already approved. Tutoring is an in-person/online real-world
  > service, so payment is handled by Stripe rather than in-app purchase (Guideline 3.1.5(a)).
  > Account deletion: Profile → Delete account.
- **Contact info** — first name, last name, phone, email. Use a phone you'll answer.

## 7. Things already handled in the binary — don't re-do them

- App icon 1024×1024, **no alpha** (Apple rejects transparent icons)
- `ITSAppUsesNonExemptEncryption: false` → **no export compliance question** on upload
- iOS purpose strings for photo library, photo-add, camera, microphone, Face ID (Apple 90683)
- `ios.privacyManifests` declaring the four API categories RN trips (ITMS-91053)
- `buildNumber` auto-increments per build

## 8. Not required — so don't lose time on them

- **Sign in with Apple** — Guideline 4.8 only applies if you offer third-party/social login.
  noot is email + password only, so this is **not** required.
- **In-app purchase** — tutoring is a real-world service; external payment is permitted.
- iPad screenshots, Mac build, App Clip, widgets — none apply.

## 9. Expect after upload, before review

- Build processing: 5–15 minutes before it appears in TestFlight
- Possible **ITMS-91053** email if a dependency adds an undeclared API (the four common ones
  are already declared)
- "Missing Compliance" prompt should **not** appear, thanks to the encryption key above

---

## Realistically still open

| | |
|---|---|
| Report & block (Guideline 1.2) | **not built** — and the Terms claim it exists |
| SMTP | not configured → reviewer demo account is mandatory |
| ~~`noot.app`~~ | superseded by **`trynoot.com`**, live 2026-09-17 → privacy + support URLs resolve |
| Stripe | test keys → a reviewer's real card is declined (Guideline 2.1) |
| Screenshots / description / keywords | none written |
| The app on a device | still never used |
