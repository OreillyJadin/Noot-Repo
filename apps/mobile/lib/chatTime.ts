// Separator labels above chat messages.
//
// The old behaviour printed one "Today" divider per day, which told you nothing about when
// anything was actually said. Now a separator carries the clock time, and only appears when
// it's worth reading: at a day boundary, or after a real pause in the conversation. A rapid
// back-and-forth stays one clean block instead of a divider per message.
//
// Today  → "3:42 PM"          (the date would be noise)
// Older  → "Jul 24 · 3:42 PM" (the date you wanted, now with the time too)

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Quiet period after which a new separator is worth showing. */
const GAP_MS = 15 * 60 * 1000;

function clock(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/**
 * Label to show above this message, or null to fold it into the block above.
 * @param iso     this message's createdAt
 * @param prevIso the previous message's createdAt, or undefined for the first
 */
export function separatorLabel(iso: string, prevIso?: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;

  if (prevIso) {
    const prev = new Date(prevIso);
    const sameDay = d.toDateString() === prev.toDateString();
    if (sameDay && d.getTime() - prev.getTime() < GAP_MS) return null;
  }

  const isToday = d.toDateString() === new Date().toDateString();
  return isToday ? clock(d) : `${MONTHS[d.getMonth()]} ${d.getDate()} · ${clock(d)}`;
}
