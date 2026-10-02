# Decisions needed from Jadin — 2026-10-02

Written 2026-10-02. The items were raised on 2026-09-23, at the end of the P1 work (T4/T5/T6)
on branch `tracker-fixes`. None of them blocks the code on that branch. They're product and
legal calls that Claude shouldn't make alone. Tick each one off here when it's decided, with the
date and the answer.

---

## 1. Bump the Terms of Use version?

- [ ] Decided: ______ (date: ______)

**What changed:** T6 edited `legal/TERMS_OF_USE.md` §9 (grade verification is optional), §11 (the
fee is 17.5% for verified tutors and 32.5% for unverified ones) and §17 (only tutors with the
Verified badge have had their grades checked).

**What didn't:** the effective date at the top still says **17 September 2026**, and
`TERMS_VERSION` in `apps/mobile/lib/legal.ts` is still `'2026-09-17'`. That's the version string
recorded when a user accepts the Terms at sign-up.

**Why it matters:** the Terms aren't published yet (`trynoot.com/terms`, see
`HANDOFF_2026-09-21.md` §1). If you bump both now, everyone who signs up from here on accepts the
text that's actually in the file. If you don't, new users accept text labelled 17 September that
doesn't match what they were shown.

**Options:**
- **Bump both now** to the date the page goes live (recommended). Nobody has to re-accept,
  because the old text was never published.
- Leave them, and bump when the page is published.

---

## 2. Can students see a tutor's grades? The Terms and the app disagree

- [ ] Decided: ______ (date: ______)

**The contradiction (it predates the tracker work):** Terms §9 says a tutor's grades *"are not
published on your public profile."* But the public tutor profile (`apps/mobile/app/b2.tsx`, the
"Courses & rates" section) shows a grade next to every course.

**What T6 did in the meantime:** unverified tutors' grades are now labelled
**"Grade A · self-reported"** in a neutral colour, and only verified tutors get the green
**"Grade A · verified"**. It used to be green for everyone. The Terms sentence was left as it is,
because whether to publish grades is a privacy decision.

**Options:**
- **Keep showing grades** and change the Terms sentence to say they're shown, labelled as
  self-reported or verified (recommended, since it's what students use to choose a tutor).
- **Hide grades** from the public profile, keep the Terms as they are, and show only the
  Verified badge.

Worth a lawyer's eye either way. `HANDOFF_2026-09-21.md` already flags the Terms for review.

---

## 3. Remove the made-up numbers from the landing screen?

- [ ] Decided: ______ (date: ______)

**Where:** `apps/mobile/app/index.tsx` line 50, on the first screen a signed-out user (or an App
Review reviewer) sees:

> 312 active tutors · 28 departments · grade-verified tutors marked ✓.

**The problem:** "312 active tutors" and "28 departments" look invented. They aren't read from
anything. T6 only removed the part that had just become false ("all grade-verified"); before that
the line read "· all grade-verified."

**Why it matters:** unverifiable claims on the first screen are an App Review risk (Guideline 2.3,
accurate metadata and content), and a user can check them against search.

**Options:**
- **Remove the counts**, keeping "Peer tutors at UA · grade-verified tutors marked ✓" or similar
  (recommended).
- Make them real: compute them from the database through `@noot/core`.
- Keep them, if you can show they're accurate.

---

## Also waiting on you (raised earlier, still open)

- [ ] **Push the security fix to production.** Migration `0038` closes a hole where any
  signed-in user could create their own tutor profile already marked "approved" and appear in
  search, bookable. It's confirmed on the local stack, and production has the same rules. The
  order is: push `0038`, then deploy `approve-tutor`, `create-payment-intent` and
  `confirm-booking`, then ship a new app build. The migration on its own is safe with the current
  app. Note that existing live tutors become unverified at the 32.5% fee as soon as it lands (no
  grandfathering, decided 2026-09-23).
- [ ] **Point `apps/mobile/.env` at the local stack** (`http://192.168.50.198:54321`) for phone
  testing of the `tracker-fixes` branch. Tutor search fails against production until `0038` is
  pushed.
- [ ] **Referral $5 payout (Q3, needed for A2).** Assumption until you say otherwise: the bonus
  is recorded as owed and Watchmen pays it manually.
- [ ] **D4: the subject categories** beyond Business / STEM / Humanities (needed for ST2).
- [ ] **Add `expo-clipboard`** for a one-tap Copy button on the referral code (A1 partial). It's
  held because `apps/mobile/package.json` and `pnpm-lock.yaml` have uncommitted dependency bumps
  that aren't from the tracker work. Commit or discard those first.
- [ ] **Sign-up links may arrive twice too.** T2 fixed the reset link being delivered twice on a
  cold launch. A sign-up verification link could do the same and drop a new user back at the
  start of onboarding. It hasn't been reported. Should it get the same fix?
