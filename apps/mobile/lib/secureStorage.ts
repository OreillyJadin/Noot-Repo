// LargeSecureStore — the Supabase session store on native.
//
// Why: supabase-js persists the session (access + refresh JWTs) and the PKCE
// code-verifier through the injected `storage` adapter. We want that in the OS
// keystore (Keychain / Keystore-backed, encrypted) — NOT AsyncStorage, which is
// plaintext. But expo-secure-store has a ~2KB per-value cap on Android, and a
// Supabase session can exceed it. So this adapter transparently CHUNKS values:
//   - the base key holds a manifest  { v: 1, n: <chunkCount> }
//   - chunks live at `${key}.0`, `${key}.1`, …
// The manifest is written LAST, so a crash mid-write never leaves a half-committed
// value the reader would treat as complete (a missing chunk → getItem returns null
// → supabase-js re-authenticates cleanly rather than exchanging a truncated token).
//
// Adapter shape matches SupabaseConfig.storage (getItem/setItem/removeItem); it
// bridges to SecureStore's *Async methods. Native-only — web passes no adapter and
// falls back to localStorage (see _layout.tsx).
import * as SecureStore from 'expo-secure-store';

// Conservative vs the ~2048-byte Android cap; tokens are ASCII (~1 byte/char).
const CHUNK_SIZE = 1500;

// Every write uses the same accessibility so autoRefreshToken can rewrite the
// session while the app is backgrounded / device locked. WHEN_UNLOCKED (the
// default) would make a background refresh throw.
const OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

// SecureStore keys must match [A-Za-z0-9._-]. Supabase's keys already conform;
// this is defensive so any future key can't silently fail to persist.
function sanitizeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, '_');
}

interface Manifest {
  v: 1;
  n: number;
}

function parseManifest(raw: string): Manifest | null {
  try {
    const m = JSON.parse(raw);
    return m && m.v === 1 && typeof m.n === 'number' ? (m as Manifest) : null;
  } catch {
    return null;
  }
}

async function readManifest(skey: string): Promise<Manifest | null> {
  const raw = await SecureStore.getItemAsync(skey, OPTS);
  return raw ? parseManifest(raw) : null;
}

export const largeSecureStore = {
  async getItem(key: string): Promise<string | null> {
    const skey = sanitizeKey(key);
    const base = await SecureStore.getItemAsync(skey, OPTS);
    if (base == null) return null;
    const manifest = parseManifest(base);
    // Not a manifest → a legacy/plain value written directly; return as-is.
    if (!manifest) return base;
    const parts: string[] = [];
    for (let i = 0; i < manifest.n; i++) {
      const part = await SecureStore.getItemAsync(`${skey}.${i}`, OPTS);
      if (part == null) return null; // interrupted write / corruption → force re-auth
      parts.push(part);
    }
    return parts.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    const skey = sanitizeKey(key);
    const prev = await readManifest(skey);

    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
      chunks.push(value.slice(i, i + CHUNK_SIZE));
    }
    if (chunks.length === 0) chunks.push(''); // persist empty string as one empty chunk

    // Write chunks first, then the manifest as the commit point.
    for (let i = 0; i < chunks.length; i++) {
      await SecureStore.setItemAsync(`${skey}.${i}`, chunks[i]!, OPTS);
    }
    await SecureStore.setItemAsync(skey, JSON.stringify({ v: 1, n: chunks.length } satisfies Manifest), OPTS);

    // Clean up now-orphaned higher chunks from a previously larger value. Harmless
    // if a crash interrupts this — the manifest already caps how many we read.
    if (prev && prev.n > chunks.length) {
      for (let i = chunks.length; i < prev.n; i++) {
        await SecureStore.deleteItemAsync(`${skey}.${i}`, OPTS).catch(() => {});
      }
    }
  },

  async removeItem(key: string): Promise<void> {
    const skey = sanitizeKey(key);
    const manifest = await readManifest(skey);
    const n = manifest?.n ?? 0;
    for (let i = 0; i < n; i++) {
      await SecureStore.deleteItemAsync(`${skey}.${i}`, OPTS).catch(() => {});
    }
    await SecureStore.deleteItemAsync(skey, OPTS).catch(() => {});
  },
};
