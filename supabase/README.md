# supabase/

Backend for noot — Phase 1 (ARCHITECTURE.md §3–§5).

- `migrations/` — SQL schema (the data model in ARCHITECTURE.md §4 / prd-data-models.md).
- `functions/` — Edge Functions: the server-only logic (Stripe, double-blind ratings,
  refund math, no-show strikes, `.edu` auth hook). These + `packages/core` are the ONLY
  places allowed to import Supabase/Stripe directly.
- `seed.sql` — dev seed data (mirror `design_handoff_noot_app/app/booking-data.jsx`).

```bash
supabase start            # local stack
supabase db reset         # apply migrations + seed
supabase functions serve  # run Edge Functions locally
```
