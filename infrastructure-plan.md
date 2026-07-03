# Infrastructure Plan — Tutoring Marketplace App

## Overview
A two-phase infrastructure strategy: launch fast and cheap with managed services, then migrate to AWS once usage justifies the added complexity and cost savings.

---

## Phase 1: Launch (Supabase + Railway)

**Goal:** Get to market quickly with minimal DevOps overhead. Good for MVP through early growth (dozens to low thousands of users).

| Component | Service | Why |
|---|---|---|
| Database | Supabase (Postgres) | Managed Postgres, handles backups/scaling automatically. Relational model fits bookings, tutor/student profiles, ratings. |
| Auth | Supabase Auth | Built-in email verification flow — configure to restrict signups to `.edu` domain (e.g. `@crimson.ua.edu`) for student verification. |
| App/API server | Railway (or Render/Fly.io) | Deploys backend containers, auto-scales, no server patching required. |
| File storage | Supabase Storage | Tutor profile photos, uploaded documents/credentials. |
| Payments | Stripe Connect | Marketplace payments — platform takes a cut, tutors receive payouts. Independent of hosting choice; stays the same in both phases. |

**Tradeoffs:** Higher per-user cost at scale, less infra control, but near-zero ops burden. Right choice while validating the product and growing the user base.

---

## Phase 2: Scale-Up Migration (AWS)

**Trigger:** Move to this phase once usage (thousands of active users, high transaction volume) makes per-user managed-service costs outweigh the ops overhead of self-hosting.

| Component | AWS Service | Notes |
|---|---|---|
| Database | RDS (PostgreSQL) | Same Postgres engine as Supabase — migration is schema-compatible. RDS automates backups/failover but you manage instance sizing and scaling policy. |
| Auth | Cognito (or custom service) | Cognito handles user pools and email verification well; alternatively build custom `.edu` verification + JWT auth. |
| App/API server | ECS/Fargate | Containerized, auto-scaling, no OS-level server management (closest AWS equivalent to Railway). EC2 is an option for more manual control but more maintenance. |
| File storage | S3 | Direct replacement for Supabase Storage. |
| Payments | Stripe Connect | Unchanged — payments infra is hosting-independent. |

**Why migrate:**
- Lower cost per user at real scale
- Full infra control (useful if data residency/compliance becomes relevant given university affiliation)
- Consolidates into one ecosystem instead of three vendors

**Tradeoffs:** Significantly more setup (VPCs, IAM roles, security groups, load balancers) and ongoing maintenance responsibility. Not worth doing until usage data justifies it.

---

## Summary for the Team
- **We launch on Supabase + Railway** — fastest path to a working product, minimal infra work, so we can focus on building and validating with real tutors/students.
- **Stripe Connect handles payments from day one** — this doesn't change when we migrate.
- **AWS is our scale-up plan, not our launch plan.** We migrate once user/transaction volume makes the cost tradeoff worth the added complexity. The database schema (Postgres) transfers directly, minimizing migration risk when that day comes.
