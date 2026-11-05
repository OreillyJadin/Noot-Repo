// Web: the browser has no OS keystore, so the session lives in localStorage, which is what
// supabase-js uses on its own (app/_layout passes no adapter on web). Same export as
// lib/secureStorage.ts, which keeps expo-secure-store out of the web bundle.
export const largeSecureStore = {
  async getItem(key: string): Promise<string | null> {
    return globalThis.localStorage?.getItem(key) ?? null;
  },
  async setItem(key: string, value: string): Promise<void> {
    globalThis.localStorage?.setItem(key, value);
  },
  async removeItem(key: string): Promise<void> {
    globalThis.localStorage?.removeItem(key);
  },
};
