// Human-readable text for a thrown value.
//
// `e instanceof Error` is not enough here: @noot/core surfaces Supabase failures with
// `if (error) throw error`, and a supabase-js PostgrestError is a plain object
// ({ message, code, details, hint }), not an Error. Testing for Error alone silently
// discards the one useful string and shows a generic fallback instead — which is how a
// missing column read as "Could not open the admin chat."
export function errText(e: unknown, fallback: string): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === 'string' && e) return e;
  if (e && typeof e === 'object') {
    const { message, code } = e as { message?: unknown; code?: unknown };
    if (typeof message === 'string' && message) {
      return typeof code === 'string' && code ? `${message} (${code})` : message;
    }
  }
  return fallback;
}
