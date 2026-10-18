// Accounts v2 avoids the sandbox's v1-create rejection; v1 sessions, links, and deletes
// remain compatible. stripe_charges_enabled stores transfersActive (the booking gate).
export const STRIPE_V2_VERSION = '2026-09-30.endive';

type Capability = {
  status?: string;
  requested?: boolean;
};

type V2Configuration = {
  capabilities?: {
    stripe_balance?: {
      stripe_transfers?: Capability;
      payouts?: Capability;
    };
  };
};

export type V2Account = {
  id: string;
  object?: string;
  closed?: boolean;
  dashboard?: string;
  contact_email?: string | null;
  applied_configurations?: string[];
  metadata?: Record<string, string>;
  configuration?: {
    recipient?: V2Configuration | null;
    merchant?: V2Configuration | null;
  };
  requirements?: {
    entries?: Array<{
      awaiting_action_from?: string | null;
      minimum_deadline?: {
        status?: string | null;
      } | null;
    }>;
  } | null;
};

export class StripeApiError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = 'StripeApiError';
    this.status = status;
    this.code = code;
  }
}

export type PayoutStatus = {
  transfersActive: boolean;
  payoutsActive: boolean;
  detailsSubmitted: boolean;
  closed: boolean;
  source: 'v2' | 'v1';
};

async function stripeRequest<T>(
  key: string,
  path: string,
  options: RequestInit = {},
  version = STRIPE_V2_VERSION,
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${key}`);
  headers.set('Stripe-Version', version);
  if (options.body) headers.set('Content-Type', 'application/json');

  const response = await fetch(`https://api.stripe.com${path}`, {
    ...options,
    headers,
  });
  const body = await response.json().catch(() => null) as {
    error?: { code?: string; message?: string };
  } | null;
  if (!response.ok) {
    throw new StripeApiError(
      body?.error?.message ?? `Stripe API request failed (${response.status})`,
      response.status,
      body?.error?.code ?? '',
    );
  }
  return body as T;
}

export function createRecipientAccount(
  key: string,
  input: { userId: string; email: string },
  idempotencyKey: string,
): Promise<V2Account> {
  return stripeRequest<V2Account>(key, '/v2/core/accounts', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({
      contact_email: input.email,
      dashboard: 'express',
      identity: { country: 'us', entity_type: 'individual' },
      defaults: {
        responsibilities: {
          fees_collector: 'application',
          losses_collector: 'application',
        },
      },
      configuration: {
        recipient: {
          capabilities: {
            stripe_balance: {
              stripe_transfers: { requested: true },
            },
          },
        },
      },
      metadata: { user_id: input.userId },
      include: ['configuration.recipient', 'requirements'],
    }),
  });
}

export function retrieveAccount(key: string, id: string): Promise<V2Account> {
  return stripeRequest<V2Account>(
    key,
    `/v2/core/accounts/${encodeURIComponent(id)}?include=configuration.recipient&include=configuration.merchant&include=requirements`,
  );
}

function mapV2PayoutStatus(account: V2Account): PayoutStatus {
  const recipientBalance = account.configuration?.recipient?.capabilities?.stripe_balance;
  const merchantBalance = account.configuration?.merchant?.capabilities?.stripe_balance;
  const needsUserAction = (account.requirements?.entries ?? []).some((entry) =>
    entry.awaiting_action_from === 'user' &&
    ['currently_due', 'past_due'].includes(entry.minimum_deadline?.status ?? '')
  );
  return {
    transfersActive: recipientBalance?.stripe_transfers?.status === 'active',
    payoutsActive:
      recipientBalance?.payouts?.status === 'active' ||
      merchantBalance?.payouts?.status === 'active',
    detailsSubmitted: !needsUserAction,
    closed: account.closed === true,
    source: 'v2',
  };
}

async function retrieveV1PayoutStatus(key: string, id: string): Promise<PayoutStatus> {
  const account = await stripeRequest<{
    capabilities?: { transfers?: string };
    payouts_enabled?: boolean;
    details_submitted?: boolean;
    deleted?: boolean;
  }>(key, `/v1/accounts/${encodeURIComponent(id)}`, {}, '2024-06-20');
  return {
    transfersActive: account.capabilities?.transfers === 'active',
    payoutsActive: account.payouts_enabled === true,
    detailsSubmitted: account.details_submitted === true,
    closed: account.deleted === true,
    source: 'v1',
  };
}

export async function getPayoutStatus(key: string, id: string): Promise<PayoutStatus> {
  let account: V2Account;
  try {
    account = await retrieveAccount(key, id);
  } catch (err) {
    if (
      err instanceof StripeApiError &&
      ([400, 403, 404].includes(err.status) ||
        ['account_not_yet_compatible_with_v2', 'v1_account_instead_of_v2_account'].includes(err.code))
    ) {
      // v2 uses 403 "forbidden" for missing accounts and accounts it won't read; let v1 decide.
      return retrieveV1PayoutStatus(key, id);
    }
    throw err;
  }

  if (!account.closed && !account.configuration?.recipient) {
    return retrieveV1PayoutStatus(key, id);
  }
  return mapV2PayoutStatus(account);
}

export const isDeadAccountError = (e: unknown) =>
  e instanceof StripeApiError &&
  (e.status === 403 ||
    e.status === 404 ||
    ['invalid_fields', 'resource_missing', 'account_invalid'].includes(e.code));

// ---------- which profile row holds a person's payout account ----------
//
// Tutors keep their Connect account on tutor_profiles (with the booking gate
// stripe_charges_enabled = transfers active). An ambassador who is not a tutor keeps the
// same kind of account on ambassador_profiles (0088). Someone who is both uses the tutor
// row, so one person never ends up with two accounts.

type PayoutProfileDb = {
  from(table: string): {
    select(cols: string): {
      eq(col: string, v: string): { maybeSingle(): Promise<{ data: Record<string, unknown> | null; error: unknown }> };
    };
    update(patch: Record<string, unknown>): {
      eq(col: string, v: string): PromiseLike<{ error: unknown }>;
    };
  };
};

export type PayoutProfile = {
  table: 'tutor_profiles' | 'ambassador_profiles';
  /** True when the row exists (a missing tutor row is upserted by connect-onboarding-link). */
  exists: boolean;
  accountId: string | null;
  transfersEnabled: boolean;
  payoutsEnabled: boolean;
};

export async function resolvePayoutProfile(db: PayoutProfileDb, userId: string): Promise<PayoutProfile> {
  const tutor = await db
    .from('tutor_profiles')
    .select('stripe_connect_account_id, stripe_charges_enabled, stripe_payouts_enabled')
    .eq('user_id', userId)
    .maybeSingle();
  if (tutor.error) throw new Error(`tutor_profiles read failed: ${JSON.stringify(tutor.error)}`);
  const tutorAccount = (tutor.data?.stripe_connect_account_id as string | null | undefined) ?? null;
  if (tutor.data && tutorAccount) {
    return {
      table: 'tutor_profiles',
      exists: true,
      accountId: tutorAccount,
      transfersEnabled: !!tutor.data.stripe_charges_enabled,
      payoutsEnabled: !!tutor.data.stripe_payouts_enabled,
    };
  }
  const amb = await db
    .from('ambassador_profiles')
    .select('stripe_connect_account_id, stripe_transfers_enabled, stripe_payouts_enabled, stripe_onboarded_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (amb.error) throw new Error(`ambassador_profiles read failed: ${JSON.stringify(amb.error)}`);
  const ambAccount = (amb.data?.stripe_connect_account_id as string | null | undefined) ?? null;
  if (tutor.data && ambAccount) {
    // An ambassador who later became a tutor: the tutor row has no account yet but the
    // ambassador row does. Move it over so the tutor row owns it from now on (one account
    // per person; the booking gate reads tutor_profiles.stripe_charges_enabled).
    const moved = await db.from('tutor_profiles').update({
      stripe_connect_account_id: ambAccount,
      stripe_charges_enabled: !!amb.data!.stripe_transfers_enabled,
      stripe_payouts_enabled: !!amb.data!.stripe_payouts_enabled,
      stripe_onboarded_at: (amb.data!.stripe_onboarded_at as string | null) ?? null,
    }).eq('user_id', userId);
    if (moved.error) throw new Error(`tutor_profiles account move failed: ${JSON.stringify(moved.error)}`);
    const cleared = await db.from('ambassador_profiles').update({
      stripe_connect_account_id: null,
      stripe_transfers_enabled: false,
      stripe_payouts_enabled: false,
      stripe_onboarded_at: null,
    }).eq('user_id', userId);
    if (cleared.error) throw new Error(`ambassador_profiles account move failed: ${JSON.stringify(cleared.error)}`);
    return {
      table: 'tutor_profiles',
      exists: true,
      accountId: ambAccount,
      transfersEnabled: !!amb.data!.stripe_transfers_enabled,
      payoutsEnabled: !!amb.data!.stripe_payouts_enabled,
    };
  }
  if (tutor.data) {
    return { table: 'tutor_profiles', exists: true, accountId: null, transfersEnabled: false, payoutsEnabled: false };
  }
  if (amb.data) {
    return {
      table: 'ambassador_profiles',
      exists: true,
      accountId: (amb.data.stripe_connect_account_id as string | null) ?? null,
      transfersEnabled: !!amb.data.stripe_transfers_enabled,
      payoutsEnabled: !!amb.data.stripe_payouts_enabled,
    };
  }
  // Neither row: the legacy path (a tutor whose profile row is created on first onboarding).
  return { table: 'tutor_profiles', exists: false, accountId: null, transfersEnabled: false, payoutsEnabled: false };
}

/** Column patch caching a live Stripe status on whichever profile row holds the account. */
export function payoutFlagsPatch(
  table: PayoutProfile['table'],
  flags: { transfersActive: boolean; payoutsActive: boolean; detailsSubmitted: boolean },
): Record<string, unknown> {
  const transfersCol = table === 'tutor_profiles' ? 'stripe_charges_enabled' : 'stripe_transfers_enabled';
  return {
    [transfersCol]: flags.transfersActive,
    stripe_payouts_enabled: flags.payoutsActive,
    stripe_onboarded_at: flags.detailsSubmitted ? new Date().toISOString() : null,
  };
}
