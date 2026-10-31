alter table public.tutor_transfer_reversals
  drop constraint tutor_transfer_reversals_status_check;
alter table public.tutor_transfer_reversals
  add constraint tutor_transfer_reversals_status_check
  check (status in ('reversed', 'failed', 'restoration_required', 'obsolete'));

create index tutor_transfer_reversals_restoration_idx
  on public.tutor_transfer_reversals (created_at)
  where status = 'restoration_required';

comment on table public.tutor_transfer_reversals is
  'Admin follow-up: failed = reversal failed (retry/review); restoration_required = refund failed after reversal (restore tutor funds after review, never reverse again); obsolete = refund failed before any reversal. Stripe transfer reversals cannot be canceled. Existing admin-only read RLS remains unchanged.';
