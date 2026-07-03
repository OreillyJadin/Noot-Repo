# PRD: Data Models — Noot

## Roles Overview

Four user roles, one `Users` table, role-specific profile tables for the two roles that need extra data:

| Role | Extra Profile Table? | Key Behavior |
|---|---|---|
| Student | No | Books sessions with tutors |
| Tutor | Yes — `TutorProfiles` | Must submit transcript, admin-approved before going live |
| Ambassador | Yes — `AmbassadorProfiles` | Recruits students/tutors, earns ongoing commission on their bookings |
| Admin | No | Noot team — approves tutors, manages all accounts |

---

## Users (base table)

| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| email | string, unique | Must be `.edu` domain — verified at signup |
| password_hash | string | (or auth_provider_id if using Supabase Auth / OAuth) |
| role | enum | `student`, `tutor`, `ambassador`, `admin` |
| first_name | string | |
| last_name | string | |
| status | enum | `active`, `suspended`, `banned` |
| created_at | timestamp | |
| updated_at | timestamp | |

---

## TutorProfiles

One-to-one with `Users` where `role = tutor`.

| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| user_id | UUID (FK → Users, unique) | |
| bio | text | |
| subjects | array / join table | What they tutor |
| hourly_rate | decimal | |
| transcript_url | string | Uploaded document for admin review |
| approval_status | enum | `pending`, `approved`, `rejected` |
| reviewed_by | UUID (FK → Users, nullable) | Which admin reviewed it |
| reviewed_at | timestamp, nullable | |
| stripe_connect_account_id | string | For receiving session payouts |
| rating_avg | decimal, denormalized | Computed from Reviews |
| created_at / updated_at | timestamp | |

**Flow**: Tutor signs up → uploads transcript → `approval_status = pending` → Admin reviews in-app → approved or rejected. Only `approved` tutors are visible/bookable by students.

---

## AmbassadorProfiles

One-to-one with `Users` where `role = ambassador`.

| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| user_id | UUID (FK → Users, unique) | |
| referral_code | string, unique | Shareable signup code |
| stripe_connect_account_id | string | For receiving $5 bonus payouts |
| total_referrals | int, denormalized | Count of people recruited |
| total_earned | decimal, denormalized | Lifetime bonuses earned |
| created_at / updated_at | timestamp | |

---

## Referrals

Tracks who each Ambassador recruited — this is what an Ambassador's dashboard is built on.

| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| ambassador_id | UUID (FK → AmbassadorProfiles) | |
| referred_user_id | UUID (FK → Users) | The student or tutor they recruited |
| referred_role | enum | `student` or `tutor`, denormalized for quick filtering |
| referral_code_used | string | |
| created_at | timestamp | |

---

## Bookings

| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| student_id | UUID (FK → Users) | |
| tutor_id | UUID (FK → TutorProfiles) | |
| subject | string | |
| scheduled_at | timestamp | |
| duration_minutes | int | |
| price | decimal | Total charged to student |
| platform_fee | decimal | Noot's cut |
| tutor_payout_amount | decimal | |
| session_type | enum | `video` or `in_person` — tutor's choice, set per booking |
| meeting_link | string, nullable | Populated if `session_type = video` |
| location | string, nullable | Populated if `session_type = in_person` |
| status | enum | `pending`, `confirmed`, `completed`, `cancelled` |
| cancellation_deadline | timestamp | `scheduled_at` minus 24 hours |
| cancelled_at | timestamp, nullable | |
| refund_status | enum | `not_applicable`, `refunded`, `not_refunded` |
| stripe_payment_intent_id | string | Charged upfront at booking confirmation |
| created_at / updated_at | timestamp | |

**Cancellation logic**: if `cancelled_at` is before `cancellation_deadline` (scheduled_at minus 24 hours), full refund. After the deadline, no refund.

---

## Conversations & Messages

Pre-booking messaging between a student and tutor, before any booking exists.

**Conversations**

| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| student_id | UUID (FK → Users) | |
| tutor_id | UUID (FK → TutorProfiles) | |
| created_at | timestamp | |

**Messages**

| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| conversation_id | UUID (FK → Conversations) | |
| sender_id | UUID (FK → Users) | |
| content | text | |
| read_at | timestamp, nullable | |
| created_at | timestamp | |

---

## ReferralBonuses

Flat **$5 one-time bonus** to the Ambassador the first time their referred person completes a paid session. Not ongoing — one bonus per referral, ever.

| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| ambassador_id | UUID (FK → AmbassadorProfiles) | |
| referral_id | UUID (FK → Referrals, unique) | One bonus per referral — enforce uniqueness here |
| triggering_booking_id | UUID (FK → Bookings) | The first completed + paid session that triggered payout |
| bonus_amount | decimal | $5 flat (stored, not hardcoded, in case it changes later) |
| status | enum | `pending`, `paid` |
| paid_at | timestamp, nullable | |
| created_at | timestamp | |

**Trigger logic**: When a Booking's status flips to `completed` and payment has cleared, check if `referred_user_id` (student or tutor on that booking) has a `Referrals` row with no existing `ReferralBonuses` row yet. If so, create one. Because it's per-referral (not per-booking), the earlier double-referral question resolves itself — a student's Ambassador and a tutor's Ambassador on the same booking each get their own independent $5 the first time, no shared pool or split logic needed.

---

## Reviews

| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| booking_id | UUID (FK → Bookings, unique) | One review per booking |
| reviewer_id | UUID (FK → Users) | Student who left it |
| tutor_id | UUID (FK → TutorProfiles) | |
| rating | int (1–5) | |
| comment | text | |
| created_at | timestamp | |

---

## TutorAvailability

Recurring weekly availability windows — what students see when browsing a tutor's calendar to book.

| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| tutor_id | UUID (FK → TutorProfiles) | |
| day_of_week | int (0–6) | Recurring weekly slot (MVP keeps it simple — no one-off date overrides yet) |
| start_time | time | |
| end_time | time | |
| created_at | timestamp | |

**Booking validation**: a new Booking's `scheduled_at` must fall inside one of the tutor's `TutorAvailability` windows for that day of week, and must not overlap an existing `confirmed` Booking for that tutor.

---

## PushTokens

Registers each user's device for push notifications (booking confirmations, session reminders, new messages).

| Field | Type | Notes |
|---|---|---|
| id | UUID (PK) | |
| user_id | UUID (FK → Users) | |
| token | string | Device push token (APNs/FCM) |
| platform | enum | `ios`, `android` |
| created_at | timestamp | |

**Notification triggers for MVP**: booking confirmed, session reminder (e.g. 1 hour before), new message received.

Admins don't get their own profile table — `role = admin` on `Users` is sufficient. Admin capabilities (via the app, not a separate portal):
- Review and approve/reject Tutor transcripts (`TutorProfiles.approval_status`)
- View and manage all Students, Tutors, and Ambassadors (suspend/ban via `Users.status`)
- Visibility into Referrals and Commissions ledger

No approval gate on Ambassador or Student signup — they're active immediately upon `.edu` verification. Admins manage them after the fact rather than gating entry.
