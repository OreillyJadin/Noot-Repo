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
      ['account_not_yet_compatible_with_v2', 'v1_account_instead_of_v2_account'].includes(err.code)
    ) {
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
