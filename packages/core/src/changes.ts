// "The signed-in user's row changed" — a tiny in-process event.
//
// Every api.profile write that touches what getMe() / getTutorStatus() return calls
// notifyUserChanged() once it succeeds. The app's MeProvider subscribes and re-reads, so a
// screen never has to remember to refresh after saving — which it never did, and why a
// photo or signup data only showed up after a force-quit (tracker S1).
type Listener = () => void;

const listeners = new Set<Listener>();

/** Subscribe to user-row changes. Returns the unsubscribe function. */
export function onUserChanged(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Tell subscribers the signed-in user's data changed. A listener that throws can't break the write. */
export function notifyUserChanged(): void {
  for (const fn of [...listeners]) {
    try {
      fn();
    } catch {
      /* a subscriber's failure is its own problem */
    }
  }
}
