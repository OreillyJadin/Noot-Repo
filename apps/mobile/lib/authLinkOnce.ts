// What happened to each emailed auth link, remembered across app restarts (tracker T2).
//
// Two ways the same link reaches /auth-callback again after it was used:
//   • a cold launch delivers it twice (launch URL + a "url" event) — two mounts at once;
//   • the app is force-closed and reopened, and the platform hands back the same launch URL
//     (Expo Go reopens a project at its last URL; Android can re-deliver the launch intent
//     from recents). A new process, so an in-memory "done" flag is gone.
// completeAuthFromUrl treats "already signed in" as success, so either path landed the user
// back on "Set a new password" after they had already set it.
//
// So each link's state is kept in storage: 'used' once its code is exchanged, 'reset_done'
// once a recovery link's password reset is complete. Concurrent mounts share one exchange.
// Pure apart from the injected store — see lib/authLinks.ts for the app's instance, and
// test/authLinkOnce.test.ts.
type Result = { ok: boolean; error?: string };
export type LinkState = 'new' | 'used' | 'reset_done';

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

const STORE_KEY = 'noot.authLinks';
/** Plenty for a person's recent links; older entries are dropped. */
const MAX_ENTRIES = 20;

type Ledger = Record<string, { s: Exclude<LinkState, 'new'>; at: number }>;

/** The link's one-time key (`code`, or `token_hash`), if it has one. */
export function linkKey(params: Record<string, unknown>): string | null {
  const key = [params.code, params.token_hash].find((v) => typeof v === 'string' && v);
  return typeof key === 'string' ? key : null;
}

export function createAuthLinks(store: KeyValueStore) {
  const exchanges = new Map<string, Promise<Result>>();
  let recoveryKey: string | null = null;

  const read = async (): Promise<Ledger> => {
    try {
      const raw = await store.getItem(STORE_KEY);
      return raw ? (JSON.parse(raw) as Ledger) : {};
    } catch {
      return {};
    }
  };
  const mark = async (key: string, s: Exclude<LinkState, 'new'>) => {
    const ledger = await read();
    if (ledger[key]?.s === 'reset_done') return; // never downgrade a finished reset
    ledger[key] = { s, at: Date.now() };
    const kept = Object.entries(ledger)
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, MAX_ENTRIES);
    try {
      await store.setItem(STORE_KEY, JSON.stringify(Object.fromEntries(kept)));
    } catch {
      /* best effort — worst case the old behaviour */
    }
  };

  return {
    /** What already happened to this link, on this device. 'new' for a keyless link. */
    async state(params: Record<string, unknown>): Promise<LinkState> {
      const key = linkKey(params);
      if (!key) return 'new';
      return (await read())[key]?.s ?? 'new';
    },

    /**
     * Exchange this link at most once per process (concurrent mounts share the result), and
     * record it as used once the exchange succeeds.
     */
    exchangeOnce(params: Record<string, unknown>, exchange: () => Promise<Result>): Promise<Result> {
      const key = linkKey(params);
      if (!key) return exchange();
      let p = exchanges.get(key);
      if (!p) {
        p = exchange().then(async (res) => {
          if (res.ok) await mark(key, 'used');
          return res;
        });
        exchanges.set(key, p);
      }
      return p;
    },

    /** The recovery link the reset screen is completing (set when routing there). */
    setRecoveryLink(params: Record<string, unknown>): void {
      recoveryKey = linkKey(params);
    },

    /** Called by set_password once the new password is saved. */
    async markPasswordResetDone(): Promise<void> {
      if (recoveryKey) await mark(recoveryKey, 'reset_done');
    },
  };
}
