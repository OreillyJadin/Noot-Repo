// Web stand-in for expo-web-browser, aliased in metro.config.js for web only. On native the
// library shows an in-app browser sheet; expo's own web build opens a small popup window
// instead, which is the wrong thing on a laptop. Links open in a normal new tab.
export type WebBrowserResult = { type: 'opened' | 'cancel' };

function openTab(url: string): WebBrowserResult {
  if (typeof window === 'undefined') return { type: 'cancel' };
  window.open(url, '_blank', 'noopener,noreferrer');
  return { type: 'opened' };
}

export async function openBrowserAsync(url: string, _options?: unknown): Promise<WebBrowserResult> {
  return openTab(url);
}

/** No redirect comes back to a tab: it resolves as soon as the page opens. */
export async function openAuthSessionAsync(
  url: string,
  _redirectUrl?: string | null,
  _options?: unknown,
): Promise<WebBrowserResult> {
  return openTab(url);
}

export function maybeCompleteAuthSession(): { type: 'failed'; message: string } {
  return { type: 'failed', message: 'Not an auth popup.' };
}

export function dismissBrowser(): void {}
