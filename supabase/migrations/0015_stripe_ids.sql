-- 0015_stripe_ids.sql — Stripe identifiers for real money movement (payments MVP).
-- create-payment-intent needs a persistent Stripe Customer per user (for PaymentSheet
-- + saved cards); complete-session/refunds record the resulting transfer/charge/refund
-- ids on the booking; the tutor Connect status is cached for the payout-setup UI.

alter table public.users          add column if not exists stripe_customer_id text;

alter table public.bookings       add column if not exists stripe_transfer_id text;
alter table public.bookings       add column if not exists stripe_refund_id   text;
alter table public.bookings       add column if not exists stripe_charge_id   text;

-- Connect (Express) status cache — written by connect-status / payments-webhook.
alter table public.tutor_profiles add column if not exists stripe_charges_enabled boolean not null default false;
alter table public.tutor_profiles add column if not exists stripe_payouts_enabled boolean not null default false;
alter table public.tutor_profiles add column if not exists stripe_onboarded_at    timestamptz;
